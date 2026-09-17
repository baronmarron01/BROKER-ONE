import { allowMethod, enforceRateLimit, handleCors, requireClientToken, setSecurityHeaders, traceId } from './http.js';

export function prepare(req, res, methods = ['POST']) {
  const id = traceId(req);
  setSecurityHeaders(res, id);
  if (handleCors(req, res)) return { ok: false, id };
  if (!allowMethod(req, res, methods)) return { ok: false, id };
  if (!enforceRateLimit(req, res)) return { ok: false, id };
  if (!requireClientToken(req, res)) return { ok: false, id };
  return { ok: true, id };
}
