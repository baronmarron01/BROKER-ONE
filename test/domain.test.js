import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest, rankCandidates, scoreCandidate, validateRequest } from '../lib/domain.js';
import { handleCors } from '../lib/http.js';
import { buildSearchQuery } from '../api/search.js';
import { publicSourcePolicies, sourcePolicy } from '../lib/source-policy.js';
import { mergeExternalCandidates, normalizeExternalIdentity, planDiscoveryQueries } from '../lib/external-sources.js';

const request = { description: 'Machine commerciale pour emballage alimentaire', category: 'industrial', min_budget: 5000, max_budget: 10000, currency: 'CAD', location: 'Montréal', requires_physical_presence: false, requires_inspection: false, requires_installation: false, requires_licensed_professional: false, regulated_override: null };

test('validates a procurement request', () => assert.equal(validateRequest(request).ok, true));
test('rejects inverted budgets', () => assert.equal(validateRequest({ ...request, min_budget: 20, max_budget: 10 }).ok, false));
test('classifies simple digital request as A', () => assert.equal(classifyRequest(request).pipeline_class, 'A'));
test('classifies installation request as B', () => assert.equal(classifyRequest({ ...request, requires_installation: true }).pipeline_class, 'B'));
test('classifies regulated request as C', () => assert.equal(classifyRequest({ ...request, category: 'medical' }).pipeline_class, 'C'));
test('excludes an ineligible candidate', () => assert.equal(scoreCandidate(request, { provider_id: 'x', eligible: false, semantic_score: 1, capability_score: 1 }).score, 0));
test('ranks eligible candidates by score and gives new providers a prior', () => {
  const ranked = rankCandidates(request, [
    { provider_id: 'a', name: 'A', semantic_score: 0.9, capability_score: 0.9, total_price: 8000, location_score: 1, total_transactions: 0 },
    { provider_id: 'b', name: 'B', semantic_score: 0.4, capability_score: 0.4, total_price: 15000, location_score: 0.2, total_transactions: 20, successful_transactions: 18, rating: 4.8 }
  ]);
  assert.equal(ranked[0].provider_id, 'a');
  assert.ok(ranked[0].confidence > 0);
});

test('allows same-origin Vercel deployment URLs without an allowlist entry', () => {
  const headers = {};
  const req = { method: 'POST', headers: { origin: 'https://broker-one-random.vercel.app', host: 'broker-one-random.vercel.app' } };
  const res = { setHeader: (key, value) => { headers[key] = value; }, status() { return this; }, json() { throw new Error('should not reject'); } };
  assert.equal(handleCors(req, res), false);
  assert.equal(headers['Access-Control-Allow-Origin'], req.headers.origin);
});

test('builds a bounded OR query for registry recall', () => {
  const query = buildSearchQuery("Je cherche une machine commerciale d'emballage alimentaire avec livraison à Montréal.");
  assert.match(query, /"machine"/);
  assert.match(query, / OR /);
  assert.doesNotMatch(query, /"cherche"|"avec"|"livraison"/);
  assert.ok(query.split(' OR ').length <= 10);
});

test('publishes machine-readable rights for every enabled external source', () => {
  const policies = publicSourcePolicies();
  assert.ok(policies.length >= 4);
  for (const policy of policies) {
    assert.ok(policy.id && policy.licence && policy.storage && policy.redistribution);
  }
  assert.equal(sourcePolicy('gleif').licence, 'CC0-1.0');
  assert.equal(sourcePolicy('unknown'), null);
});

test('plans bounded bilingual discovery queries', () => {
  const queries = planDiscoveryQueries({ ...request, location:'Montréal' });
  assert.ok(queries.length >= 4 && queries.length <= 6);
  assert.ok(queries.some(query => /packaging|food/.test(query)));
  assert.ok(queries.some(query => query.includes('Montréal')));
  assert.ok(queries.some(query => !query.includes('Montréal')));
});

test('normalizes legal suffixes and accents for deduplication', () => {
  assert.equal(normalizeExternalIdentity('Équipement Démo Inc.', 'Montréal, Québec'), normalizeExternalIdentity('Equipement Demo Ltd', 'Montreal Quebec'));
});

test('merges duplicate candidates while preserving distinct source evidence', () => {
  const base = { provider_id:'external:wikidata:Q1', external:true, name:'Démo Inc.', service_zones:['Montréal, Québec'], semantic_score:0.4, lexical_score:0.4, reliability_score:0.4, provenance:{ source_count:1, sources:[{source_id:'wikidata',evidence:{matched_query:'demo'}}] } };
  const other = structuredClone(base); other.provider_id='external:gleif:L1'; other.name='Demo Ltd'; other.semantic_score=0.7; other.provenance.sources=[{source_id:'gleif',evidence:{matched_query:'demo'}}];
  const merged = mergeExternalCandidates([base, other]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].provenance.source_count, 2);
  assert.equal(merged[0].semantic_score, 0.7);
});
