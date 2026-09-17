import { sourcePolicy } from './source-policy.js';

const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;
const MAX_QUERY = 160;
const CONNECTOR_BUDGET_MS = 3200;

function boundedQuery(value) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

function keywords(request) {
  const ignored = new Set(['avec','dans','pour','une','des','les','aux','sur','par','livraison','cherche','recherche','besoin','commerciale','service','services']);
  const words = `${request.category || ''} ${request.description || ''}`.toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || [];
  return [...new Set(words.filter(word => !ignored.has(word)))].slice(0, 6).join(' ');
}

async function fetchJson(url, { timeout = 4500, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function withDeadline(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('deadline'), { name:'TimeoutError' })), ms); })
    ]);
  } finally { clearTimeout(timer); }
}

function candidate({ source, id, name, description, location, website, sourceUrl, evidence, confidence }) {
  const policy = sourcePolicy(source);
  return {
    provider_id: `external:${source}:${id}`,
    external: true,
    verification_status: 'unverified_candidate',
    name: name || 'Entité sans nom', description: description || '', categories: [],
    service_zones: location ? [location] : [], website: website || null,
    semantic_score: confidence, lexical_score: confidence, capability_score: 0.35,
    constraint_score: 0.5, location_score: location ? 0.55 : 0.35,
    reliability_score: confidence, total_transactions: 0, successful_transactions: 0,
    provenance: {
      source_count: 1, latest_checked_at: new Date().toISOString(),
      licence: policy.licence, storage: policy.storage, redistribution: policy.redistribution,
      sources: [{ type: 'external_api', label: policy.label, url: sourceUrl, checked_at: new Date().toISOString(), evidence }]
    }
  };
}

export async function searchGleif(request, limit = 5) {
  const query = boundedQuery(keywords(request));
  if (!query) return [];
  const url = new URL('https://api.gleif.org/api/v1/lei-records');
  url.searchParams.set('filter[entity.legalName]', query);
  url.searchParams.set('page[size]', String(Math.min(limit, 10)));
  const payload = await fetchJson(url, { headers: { 'User-Agent': 'BROKER-ONE/2.4 supplier-discovery' } });
  return (payload.data || []).map(row => {
    const entity = row.attributes?.entity || {};
    const address = entity.legalAddress || {};
    const location = [address.city, address.region, address.country].filter(Boolean).join(', ');
    return candidate({ source:'gleif', id:row.id, name:entity.legalName?.name, location,
      description:'Entité légale identifiée dans le Global LEI Index.',
      sourceUrl:`https://lei.bloomberg.com/leis/view/${encodeURIComponent(row.id)}`,
      evidence:{ lei:row.id, status:entity.status, registration_status:row.attributes?.registration?.status }, confidence:0.72 });
  });
}

export async function searchWikidata(request, limit = 8) {
  const query = boundedQuery(keywords(request));
  if (!query) return [];
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action','wbsearchentities'); url.searchParams.set('format','json');
  url.searchParams.set('language','fr'); url.searchParams.set('uselang','fr');
  url.searchParams.set('type','item'); url.searchParams.set('limit',String(Math.min(limit, 10))); url.searchParams.set('search',query);
  url.searchParams.set('origin','*');
  const payload = await fetchJson(url, { headers: { 'User-Agent': 'BROKER-ONE/2.4 supplier-discovery contact=admin@broker-one.invalid' } });
  return (payload.search || []).map(row => candidate({ source:'wikidata', id:row.id, name:row.label,
    description:row.description || 'Candidat découvert dans Wikidata.', sourceUrl:row.concepturi,
    evidence:{ wikidata_id:row.id, match:row.match?.text || row.label }, confidence:0.48 }));
}

export async function discoverExternal(request, { limit = 12, sources = ['gleif','wikidata'] } = {}) {
  const enabled = sources.filter(value => ['gleif','wikidata'].includes(value));
  const key = JSON.stringify([keywords(request), request.location, enabled, limit]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached:true };
  const jobs = enabled.map(async source => {
    try {
      const lookup = source === 'gleif' ? searchGleif(request, limit) : searchWikidata(request, limit);
      return { source, status:'ok', candidates:await withDeadline(lookup, CONNECTOR_BUDGET_MS) };
    }
    catch (error) { return { source, status:'unavailable', candidates:[], error:['AbortError','TimeoutError'].includes(error.name) ? 'timeout' : 'upstream_error' }; }
  });
  const results = await Promise.all(jobs);
  const seen = new Set();
  const candidates = results.flatMap(result => result.candidates).filter(item => {
    const identity = `${item.name.toLowerCase()}|${item.service_zones[0] || ''}`;
    if (seen.has(identity)) return false; seen.add(identity); return true;
  }).slice(0, limit);
  const value = { candidates, connectors:results.map(({ source,status,error,candidates }) => ({ source,status,error,result_count:candidates.length })), cached:false };
  cache.set(key, { at:Date.now(), value });
  return value;
}
