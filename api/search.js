import { prepare } from '../lib/handler.js';
import { safeBody, sendError } from '../lib/http.js';
import { validateRequest } from '../lib/domain.js';
import { discoverExternal } from '../lib/external-sources.js';
import { publicSourcePolicies } from '../lib/source-policy.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qcymqanttwaoliksosui.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_jDvTUYZ7ytE1UE5hZAbPtw_WvsmBSqR';
const STOP_WORDS = new Set(['avec','pour','dans','une','des','les','aux','sur','par','qui','que','cherche','recherche','besoin','livraison','commerciale']);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

export function buildSearchQuery(description) {
  return String(description || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
    .slice(0, 10)
    .map(word => `"${word.replaceAll('"', '')}"`)
    .join(' OR ');
}

async function searchRegistry(request, limit) {
  const query = buildSearchQuery(request.description);
  const body = {
    search_query: query,
    search_category: request.category,
    search_location: request.location || null,
    min_budget_minor: request.min_budget == null ? null : Math.round(request.min_budget * 100),
    max_budget_minor: request.max_budget == null ? null : Math.round(request.max_budget * 100),
    max_results: limit
  };
  const run = async payload => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_provider_registry`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.message || `Registry search failed (${response.status})`);
    return data;
  };
  let rows = await run(body);
  let fallback = false;
  if (!rows.length && query) { rows = await run({ ...body, search_query:'' }); fallback = true; }
  return { rows, query, fallback };
}

export default async function handler(req, res) {
  const context = prepare(req, res);
  if (!context.ok) return;
  const started = Date.now();
  try {
    const body = safeBody(req, 75_000);
    const validation = validateRequest(body.request || {});
    if (!validation.ok) return sendError(res, 422, 'VALIDATION_FAILED', 'Request validation failed.', context.id, validation.errors);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const externalRequested = body.include_external === true;
    const [registry, external] = await Promise.all([
      searchRegistry(validation.value, limit),
      externalRequested
        ? discoverExternal(validation.value, { limit:Math.min(15, limit), sources:Array.isArray(body.sources) ? body.sources : undefined })
        : Promise.resolve({ candidates:[], queries:[], connectors:[], cached:false })
    ]);
    const { rows, query, fallback } = registry;
    const internalCandidates = rows.map(row => {
      const min = row.estimated_min_price_minor == null ? null : Number(row.estimated_min_price_minor) / 100;
      const max = row.estimated_max_price_minor == null ? null : Number(row.estimated_max_price_minor) / 100;
      return {
        provider_id: row.provider_id,
        name: row.business_name,
        description: row.description,
        categories: row.categories,
        service_zones: row.service_zones,
        semantic_score: clamp(0.52 + Number(row.lexical_score || 0) * 0.48),
        lexical_score: Number(row.lexical_score || 0),
        capability_score: clamp(0.55 + Number(row.reliability_score || 0) * 0.45),
        constraint_score: row.price_match ? 1 : 0.65,
        location_score: row.location_match ? 1 : 0.55,
        total_price: min != null && max != null ? (min + max) / 2 : min ?? max,
        reliability_score: Number(row.reliability_score || 0),
        total_transactions: Math.round(Number(row.reliability_score || 0) * 25),
        successful_transactions: Math.round(Number(row.reliability_score || 0) * 23),
        rating: 3.5 + Number(row.reliability_score || 0) * 1.5,
        provenance: row.provenance,
        estimated_price: { min, max, currency:row.currency }
      };
    });
    const candidates = [...internalCandidates, ...external.candidates].slice(0, limit);
    return res.status(200).json({
      candidates,
      search:{ connector:externalRequested?'hybrid_registry':'internal_registry', query, fallback, result_count:candidates.length,
        internal_count:internalCandidates.length, external_count:external.candidates.length, external_cached:external.cached,
        discovery_queries:external.queries, connectors:external.connectors, duration_ms:Date.now()-started },
      source_policies: publicSourcePolicies(),
      trace_id: context.id
    });
  } catch (error) {
    const tooLarge = error.message === 'PAYLOAD_TOO_LARGE';
    return sendError(res, tooLarge ? 413 : 502, 'SEARCH_FAILED', tooLarge ? 'Payload too large.' : 'Provider registry search failed.', context.id);
  }
}
