# État d’implémentation

| Domaine | État | Preuve |
|---|---|---|
| Interface demande | Implémenté | `public/index.html`, `public/app.js` |
| Validation | Implémenté | `lib/domain.js` |
| Classification A/B/C | Implémenté avec matrice de risque | `classifyRequest()` |
| Matching explicable | Implémenté sur candidats fournis | `rankCandidates()` |
| Recherche registre réelle | Implémenté | FTS français, GIN, filtres, `/api/search` |
| Provenance de recherche | Implémenté | `provider_sources`, `search_runs`, `search_results` |
| Découverte externe | Implémenté | GLEIF + Wikidata, licences exposées, cache, timeout et dégradation contrôlée |
| Overture Places | Architecture/licence préparée | Ingestion en lot à brancher sur stockage persistant |
| Assistant IA | Implémenté, activation par clé | `api/ai.js` |
| Authentification | Implémenté | Supabase Auth, profils et sessions |
| Base de données | Implémenté | PostgreSQL, 11 tables, migrations et RLS |
| Registre fournisseurs | Implémenté | Profils, offres, statut de vérification |
| Devis | Implémenté | Demandes, réponses et statuts |
| Communications | Schéma implémenté | Conversations, messages et notifications; UI de messagerie à enrichir |
| Historique et audit | Implémenté | Demandes persistantes et `audit_events` |
| Console admin | Implémenté partiellement | Statistiques RLS; attribution initiale du rôle par opérateur Supabase |
| Paiement / escrow | Bloqué | Validation juridique et partenaire requis |
| KYC/KYB | Bloqué | Compte fournisseur et politique requise |
| Tests domaine | Implémenté | `test/domain.test.js` |
| Contrôles HTTP | Implémenté pour MVP | `lib/http.js` |
| Rate limiting distribué | Non implémenté | Redis/KV requis avant exposition publique |

Le terme « production-ready » reste conditionnel : la recherche interne est en place, mais il reste la découverte externe, la messagerie transactionnelle, les contrôles KYB/KYC, l’observabilité distribuée et la validation juridique.
