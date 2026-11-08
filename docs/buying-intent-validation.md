# Buying intent correction — 2026-11-08

## Root cause
The previous discovery prompt deliberately targeted relevant users of a product. A clinic using lasers is a prospect, not evidence of an open buying need. Existing status was unconfirmed for every entry.

## Delivered
Seller discovery defaults to active_demand. Prospects remain an explicit alternate mode. Buyer-side supplier search remains available. Strict mode requests individual public RFQs, tenders and wanted notices with product/geography compatibility, dated purchasing text, consulted source URL and declared open status. A future deadline is required unless the publication is within 30 days. Deadline today is conservatively excluded because its closing time is unknown. Missing, expired or unsupported signals are rejected server-side. Different buyers on the same procurement portal are not collapsed by domain.

No entry is labeled ready to buy. Evidence is model-extracted and not independently corroborated against full page text; source metadata only establishes that the search tool consulted the URL. Buyer identity, funds, authority, final availability and willingness to buy this specific seller's product remain unconfirmed. Public notices can be canceled or amended.

## Live validation
Production API test: seller offering diode hair-removal lasers, 755/808/940/1064 nm, 20 million pulses, 2000 W, Montréal Québec. Response 200, active_demand, zero qualified entries. Trace 1a078457-9794-4d86-a421-22c22afaea14, checked 2026-11-08T15:07:23Z. This is one live search batch, not proof of absence of buyers and not an exhaustive market search. No generic clinics were substituted. The source-coverage prose is model-generated and labeled as such in the UI.

34 automated tests passed. New cases cover expiry, unknown/invalid/future publication dates, wrong product/geography, missing source, multiple buyers on one portal and rejection of clinic-only evidence. No buyer was contacted. Production deployment READY for 6b2d988 before this documentation and coverage-label follow-up.

## Limits and next evidence needed
Search uses the existing provider web-search tool; it is not an authenticated connector to every named portal. Private groups, paid databases, confidential purchase plans and non-indexed notices are not covered. Fifteen/twenty are targets, not fabricated minimums. A firm ready-to-buy status requires a current buyer response specifying product, quantity, budget, timing and authority, with explicit user authorization before outbound contact. Current private conversations can retain that response but do not automatically verify it or execute a purchase.
