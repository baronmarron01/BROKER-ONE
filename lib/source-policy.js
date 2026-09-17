const POLICIES = Object.freeze({
  internal_registry: {
    label: 'Registre BROKER-ONE', licence: 'first-party', cost: 'internal',
    storage: 'permanent', display: true, redistribution: 'contractual', verification: 'verified'
  },
  gleif: {
    label: 'GLEIF Global LEI Index', licence: 'CC0-1.0', cost: 'free',
    terms_url: 'https://www.gleif.org/en/meta/lei-data-terms-of-use',
    storage: 'permanent', display: true, redistribution: 'allowed', verification: 'legal-identity-signal'
  },
  wikidata: {
    label: 'Wikidata', licence: 'CC0-1.0', cost: 'free',
    terms_url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    storage: 'permanent', display: true, redistribution: 'allowed', verification: 'discovery-only'
  },
  overture_places: {
    label: 'Overture Maps Places', licence: 'CDLA-Permissive-2.0-or-Apache-2.0-per-source', cost: 'free',
    terms_url: 'https://docs.overturemaps.org/guides/places/',
    storage: 'permanent-with-provenance', display: true, redistribution: 'allowed-with-source-terms', verification: 'discovery-only'
  }
});

export function sourcePolicy(id) { return POLICIES[id] || null; }
export function publicSourcePolicies() { return Object.entries(POLICIES).map(([id, policy]) => ({ id, ...policy })); }

