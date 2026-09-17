import { prepare } from '../lib/handler.js';
import { safeBody, sendError } from '../lib/http.js';
import { rankCandidates, validateRequest } from '../lib/domain.js';

export default async function handler(req, res) {
  const context = prepare(req, res);
  if (!context.ok) return;
  try {
    const body = safeBody(req, 75_000);
    const validation = validateRequest(body.request || {});
    if (!validation.ok) return sendError(res, 422, 'VALIDATION_FAILED', 'Request validation failed.', context.id, validation.errors);
    if (!Array.isArray(body.candidates) || body.candidates.length < 1 || body.candidates.length > 100) {
      return sendError(res, 422, 'INVALID_CANDIDATES', 'candidates must contain 1 to 100 items.', context.id);
    }
    return res.status(200).json({ matches: rankCandidates(validation.value, body.candidates), trace_id: context.id });
  } catch (error) {
    const tooLarge = error.message === 'PAYLOAD_TOO_LARGE';
    return sendError(res, tooLarge ? 413 : 400, error.message, tooLarge ? 'Payload too large.' : 'Invalid JSON body.', context.id);
  }
}
