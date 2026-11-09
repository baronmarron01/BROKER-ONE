# BROKER-ONE runtime research skills

These are application instructions loaded by api/ai.js from lib/orchestration.js, not installed ChatGPT personal skills.

Version research-1.0 contains four modules: understand, search, qualify, propose. plan_search applies understanding and planning before any discovery batch. Its JSON output is validated, displayed and retained in the request snapshot. Discovery consumes the validated semantic plan plus previous batch count/note, up to six batches; strict searches stop after an empty batch from batch three onwards. This is bounded adaptive prompting through the provider web-search tool, not a durable background workflow or authenticated source-specific crawler.

Meaning is inferred by the model, not guaranteed by synonym lists. The two manual references can be surfaced using the semantic family, but remain separate, geography-bound and expiring, never proof of automatic retrieval. Individual source notices must still be consulted and pass evidence/date gates. External source text and client plans are untrusted. No private access or transaction tools are exposed.

Proposal preparation creates a recipient-specific draft with source, purpose and unknowns. Approval is local review only, tied to the exact recipient/source/action/text. Editing invalidates it. Transfer copies the reviewed text into the existing draft field; it sends nothing and creates no contract or payment. Authenticated, durable authorization for future send/purchase execution is not implemented and must be designed before adding such tools.

Validation: automated tests exercise shape/bounds, semantic-family reference routing, geography exclusion and approval invalidation. Actual model paraphrase tests must be reported separately; unit fixtures do not establish semantic model accuracy.
