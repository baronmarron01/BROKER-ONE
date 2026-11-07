import { prepare } from '../lib/handler.js';
import { safeBody, sendError } from '../lib/http.js';
import { validateRequest } from '../lib/domain.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qcymqanttwaoliksosui.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_jDvTUYZ7ytE1UE5hZAbPtw_WvsmBSqR';
const STOP_WORDS = new Set(['avec','pour','dans','une','des','les','aux','sur','par','qui','que','cherche','recherche','besoin','livraison','commerciale']);

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

export default async function handler(req, res) {
  const context = prepare(req, res);
  if (!context.ok) return;
  const started = Date.now();
  try {
    const body = safeBody(req, 75_000);
    const validation = validateRequest(body.request || {});
    if (!validation.ok) return sendError(res, 422, 'VALIDATION_FAILED', 'Request validation failed.', context.id, validation.errors);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit)) || 20));
    const request=validation.value;
    if(!request.direction)return sendError(res,422,'DIRECTION_REQUIRED','Choisissez votre rôle achat ou vente.',context.id);
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_market_registry`,{
      method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(15000),
      body:JSON.stringify({search_direction:request.direction,search_category:request.category,search_text:buildSearchQuery(request.description),max_results:limit})
    });
    if(!response.ok)throw new Error('REGISTRY_UNAVAILABLE');
    const rows=await response.json();
    return res.status(200).json({candidates:rows,search:{connector:'bidirectional_registry',result_count:rows.length,direction:request.direction,duration_ms:Date.now()-started},trace_id:context.id});
  } catch (error) {
    const tooLarge = error.message === 'PAYLOAD_TOO_LARGE';
    return sendError(res, tooLarge ? 413 : 502, 'SEARCH_FAILED', tooLarge ? 'Payload too large.' : 'Registre momentanément indisponible.', context.id);
  }
}
