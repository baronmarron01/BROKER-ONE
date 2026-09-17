import crypto from 'node:crypto';

const buckets = new Map();

export function traceId(req) {
  const supplied = req.headers['x-request-id'];
  return typeof supplied === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function setSecurityHeaders(res, id) {
  res.setHeader('X-Request-Id', id);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function handleCors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const requestHost = forwardedHost || req.headers.host;
  let sameOrigin = false;
  if (origin && requestHost) {
    try { sameOrigin = new URL(origin).host === requestHost; }
    catch { sameOrigin = false; }
  }
  if (origin && (sameOrigin || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (origin && !sameOrigin && !allowed.includes(origin)) {
    res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } });
    return true;
  }
  return false;
}

export function requireClientToken(req, res) {
  const expected = process.env.BROKER_ONE_CLIENT_TOKEN;
  if (!expected) return true;
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid client token required.' } });
    return false;
  }
  return true;
}

export function enforceRateLimit(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const limit = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 30));
  const record = buckets.get(ip);
  if (!record || now - record.startedAt >= 60_000) {
    buckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  record.count += 1;
  if (record.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((60_000 - (now - record.startedAt)) / 1000)));
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
    return false;
  }
  return true;
}

export function allowMethod(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
  return false;
}

export function safeBody(req, maxBytes = 25_000) {
  const raw = JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error('INVALID_JSON_BODY');
  return req.body;
}

export function sendError(res, status, code, message, id, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) }, trace_id: id });
}
