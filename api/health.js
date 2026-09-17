import { prepare } from '../lib/handler.js';

export default async function handler(req, res) {
  const context = prepare(req, res, ['GET']);
  if (!context.ok) return;
  return res.status(200).json({ status: 'ok', service: 'broker-one-mvp', version: '2.5.0', ai_configured: Boolean(process.env.OPENAI_API_KEY), model_configured: Boolean(process.env.OPENAI_MODEL), registry_search: true, external_discovery: ['gleif','wikidata'], multilingual_queries:true, timestamp: new Date().toISOString(), trace_id: context.id });
}
