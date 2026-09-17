import { sourcePolicy } from './source-policy.js';

const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;
const MAX_QUERY = 160;
const CONNECTOR_BUDGET_MS = 7800;
const MAX_DISCOVERY_QUERIES = 6;

const CATEGORY_TERMS = Object.freeze({
  industrial: ['équipement industriel', 'industrial equipment', 'fabricant', 'manufacturer'],
  packaging: ['machine emballage', 'packaging machinery', 'équipement conditionnement', 'packaging equipment'],
  food: ['équipement alimentaire', 'food processing equipment', 'emballage alimentaire', 'food packaging'],
  medical: ['fournisseur médical', 'medical supplier', 'équipement médical', 'medical equipment'],
  electrical: ['entrepreneur électrique', 'electrical contractor', 'équipement électrique', 'electrical equipment'],
  software: ['logiciel entreprise', 'business software', 'services informatiques', 'IT services'],
  logistics: ['logistique', 'logistics provider', 'transport commercial', 'commercial transportation']
});

function boundedQuery(value) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

function meaningfulWords(value) {
  const ignored = new Set(['avec','dans','pour','une','des','les','aux','sur','par','livraison','cherche','recherche','besoin','commerciale','service','services','montreal','montréal','quebec','québec','canada']);
  return (String(value || '').toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || []).filter(word => !ignored.has(word));
}

export function planDiscoveryQueries(request) {
  const description = boundedQuery(request.description);
  const location = boundedQuery(request.location);
  const words = [...new Set(meaningfulWords(description))];
  const category = boundedQuery(request.category).toLowerCase();
  const inferred = [];
  if (words.some(word => /emball|conditionn|packag/.test(word))) inferred.push('packaging');
  if (words.some(word => /aliment|food/.test(word))) inferred.push('food');
  inferred.push(category);
  const terms = [...new Set(inferred.flatMap(key => CATEGORY_TERMS[key] || []))];
  const phrases = [
    words.slice(0, 4).join(' '),
    words.slice(0, 2).join(' '),
    ...terms
  ].filter(Boolean);
  const localized = location && phrases[0] ? [`${phrases[0]} ${location}`] : [];
  return [...new Set([...localized, ...phrases].map(boundedQuery))].slice(0, MAX_DISCOVERY_QUERIES);
}

export function normalizeExternalIdentity(name, location = '') {
  const legalSuffixes = /\b(inc|incorporated|corp|corporation|ltd|limited|llc|sarl|sa|sas|gmbh|co|company)\b/gi;
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(legalSuffixes, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  return `${normalize(name)}|${normalize(location).split(' ').slice(-2).join(' ')}`;
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

function candidate({ source, id, name, description, location, website, sourceUrl, evidence, confidence, matchedQuery }) {
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
      sources: [{ type: 'external_api', source_id:source, label: policy.label, url: sourceUrl, checked_at: new Date().toISOString(), evidence:{ ...evidence, matched_query:matchedQuery } }]
    }
  };
}

export async function searchGleif(request, limit = 5) {
  const queries = planDiscoveryQueries(request).slice(0, 2);
  const settled = await Promise.allSettled(queries.map(async query => {
    const url = new URL('https://api.gleif.org/api/v1/lei-records');
    url.searchParams.set('filter[entity.legalName]', query);
    url.searchParams.set('page[size]', String(Math.min(limit, 5)));
    const payload = await fetchJson(url, { timeout:4500, headers: { 'User-Agent': 'BROKER-ONE/2.5 supplier-discovery' } });
    return (payload.data || []).map(row => ({ row, query }));
  }));
  const pages = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!pages.length && settled.length) throw settled[0].reason;
  return pages.flat().map(({ row, query }) => {
    const entity = row.attributes?.entity || {};
    const address = entity.legalAddress || {};
    const location = [address.city, address.region, address.country].filter(Boolean).join(', ');
    return candidate({ source:'gleif', id:row.id, name:entity.legalName?.name, location,
      description:'Entité légale identifiée dans le Global LEI Index.',
      sourceUrl:`https://lei.bloomberg.com/leis/view/${encodeURIComponent(row.id)}`,
      evidence:{ lei:row.id, status:entity.status, registration_status:row.attributes?.registration?.status }, confidence:0.72, matchedQuery:query });
  });
}

export async function searchWikidata(request, limit = 8) {
  const planned = planDiscoveryQueries(request);
  const plain = planned.filter(query => !request.location || !query.includes(request.location));
  const english = plain.filter(query => /\b(packaging|food|equipment|manufacturer|supplier|industrial|business|logistics|commercial)\b/i.test(query));
  const queries = [...new Set([plain[0], ...english, ...plain].filter(Boolean))].slice(0, 3);
  const settled = await Promise.allSettled(queries.map(async (query, index) => {
    const language = /\b(packaging|food|equipment|manufacturer|supplier|industrial|business|logistics|commercial)\b/i.test(query) ? 'en' : 'fr';
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action','wbsearchentities'); url.searchParams.set('format','json');
    url.searchParams.set('language',language); url.searchParams.set('uselang','fr');
    url.searchParams.set('type','item'); url.searchParams.set('limit',String(Math.min(5, limit))); url.searchParams.set('search',query);
    url.searchParams.set('origin','*');
    const payload = await fetchJson(url, { timeout:7000, headers: { 'User-Agent': 'BROKER-ONE/2.5 supplier-discovery contact=admin@broker-one.invalid' } });
    return (payload.search || []).map(row => ({ row, query, language }));
  }));
  const pages = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!pages.length && settled.length) throw settled[0].reason;
  return pages.flat().map(({ row, query, language }) => candidate({ source:'wikidata', id:row.id, name:row.label,
    description:row.description || 'Candidat découvert dans Wikidata.', sourceUrl:row.concepturi,
    evidence:{ wikidata_id:row.id, match:row.match?.text || row.label, language }, confidence:0.48, matchedQuery:query }));
}

export function mergeExternalCandidates(items, limit = 12) {
  const merged = new Map();
  for (const item of items) {
    const identity = normalizeExternalIdentity(item.name, item.service_zones?.[0]);
    if (!identity.startsWith('|') && merged.has(identity)) {
      const existing = merged.get(identity);
      existing.semantic_score = Math.max(existing.semantic_score, item.semantic_score);
      existing.lexical_score = Math.max(existing.lexical_score, item.lexical_score);
      existing.reliability_score = Math.max(existing.reliability_score, item.reliability_score);
      const sources = [...existing.provenance.sources, ...item.provenance.sources];
      existing.provenance.sources = sources.filter((source, index) => sources.findIndex(value => value.source_id === source.source_id && value.evidence?.matched_query === source.evidence?.matched_query) === index);
      existing.provenance.source_count = new Set(existing.provenance.sources.map(source => source.source_id)).size;
    } else merged.set(identity || item.provider_id, structuredClone(item));
  }
  return [...merged.values()].sort((a,b) => b.semantic_score - a.semantic_score || a.name.localeCompare(b.name)).slice(0, limit);
}

export async function discoverExternal(request, { limit = 12, sources = ['gleif','wikidata'] } = {}) {
  const enabled = sources.filter(value => ['gleif','wikidata'].includes(value));
  const plannedQueries = planDiscoveryQueries(request);
  const key = JSON.stringify([plannedQueries, request.location, enabled, limit]);
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
  const candidates = mergeExternalCandidates(results.flatMap(result => result.candidates), limit);
  const value = { candidates, queries:plannedQueries, connectors:results.map(({ source,status,error,candidates }) => ({ source,status,error,result_count:candidates.length })), cached:false };
  cache.set(key, { at:Date.now(), value });
  return value;
}
