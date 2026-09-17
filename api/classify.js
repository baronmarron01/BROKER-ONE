import { prepare } from '../lib/handler.js';
import { safeBody, sendError } from '../lib/http.js';
import { classifyRequest, validateRequest } from '../lib/domain.js';

export default async function handler(req, res) {
  const context = prepare(req, res);
  if (!context.ok) return;
  try {
    const validation = validateRequest(safeBody(req));
    if (!validation.ok) return sendError(res, 422, 'VALIDATION_FAILED', 'Request validation failed.', context.id, validation.errors);
    return res.status(200).json({ request: validation.value, classification: classifyRequest(validation.value), trace_id: context.id });
  } catch (error) {
    const tooLarge = error.message === 'PAYLOAD_TOO_LARGE';
    return sendError(res, tooLarge ? 413 : 400, error.message, tooLarge ? 'Payload too large.' : 'Invalid JSON body.', context.id);
  }
}
