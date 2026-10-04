# Vérification du 4 octobre 2026

Supabase ACTIVE_HEALTHY. Auth health GET avec clé publique : HTTP 200. Pré-vérification OPTIONS pour POST auth depuis https://broker-one-mvp.vercel.app : HTTP 200, en-têtes apikey/content-type autorisés.

Connexion réelle via formulaire sécurisé du navigateur distant : Failed to fetch, aucune connexion confirmée. Inspection des logs navigateur bloquée ensuite par la protection native des identifiants, y compris après retour explicite à l’origine. Cause réseau précise non établie. Aucun test réel de dépôt/téléchargement/revue de document ne peut être déclaré réussi.

Correction : une panne réseau, HTTP 429 ou HTTP 5xx ne supprime plus les identifiants de renouvellement de session. Une session expirée n’est pas présentée comme connectée. Les refus explicites HTTP 400/401/403 effacent la session. Message réseau en français sans accuser le mot de passe. Ce correctif ne prétend pas réparer la cause inconnue de Failed to fetch.

Validation locale : 28 tests réussis avec node --test --test-isolation=none --test-reporter=spec test/*.test.js. Contrôles d’accès aux données inchangés.
