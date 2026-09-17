# BROKER-ONE MVP v2.4

MVP fonctionnel de courtage B2B assisté. Cette reconstruction transforme le proxy OpenAI initial en une application testable avec interface, classification de risque, matching explicable et assistant IA borné.

## Capacités livrées

- Interface web responsive en français.
- `POST /api/classify` : validation et classification déterministe A/B/C avec matrice de risques.
- `POST /api/match` : classement explicable, contraintes éliminatoires et prior bayésien pour les nouveaux fournisseurs.
- `POST /api/ai` : seulement trois tâches autorisées (`structure_request`, `explain_matches`, `clarify_request`).
- `GET /api/health` : état du service sans exposer de secret.
- Clé OpenAI uniquement côté serveur; Responses API et `store:false`.
- CORS par liste blanche, CSP, limitation de taille, limitation de débit, identifiants de trace et erreurs normalisées.
- Tests unitaires avec le runner natif de Node.
- Authentification Supabase par courriel, profils acheteur/fournisseur et sessions navigateur.
- PostgreSQL avec 15 tables, migrations versionnées et RLS sur chaque table exposée.
- Registre fournisseurs, offres, historique, matching persistant, demandes de devis et réponses.
- Conversations, notifications et piste d’audit structurées dans le schéma.
- Console administrative activée uniquement par rôle sécurisé dans `app_metadata`.
- `POST /api/search` : recherche plein texte française, filtres catégorie/zone/budget, rappel élargi et provenance.
- Historique des exécutions de recherche et snapshots de preuves par résultat.
- Découverte externe hybride sans clé via GLEIF et Wikidata, avec timeout, cache court, déduplication et échec partiel toléré.
- Registre machine-readable des licences et droits; les candidats externes restent non vérifiés et non contactables avant validation.
- Registre initial de fournisseurs de démonstration; aucun achat ou paiement réel.

## Démarrage

Prérequis : Node.js 20 ou supérieur.

```bash
npm install
cp .env.example .env.local
npm test
npm run dev:local
```

Ouvrir ensuite `http://localhost:3000`.

`npm run dev:local` suffit pour tester les fonctions locales. Les fonctions persistantes utilisent le projet Supabase BROKER-ONE.
Le lanceur local charge automatiquement `.env.local` sans afficher son contenu.

L’application fonctionne sans OpenAI pour la classification et le matching. Pour activer l’assistant, renseigner `OPENAI_API_KEY` et `OPENAI_MODEL` dans `.env.local` ou dans les variables Vercel.

## Déploiement Vercel

```bash
vercel link
vercel env add OPENAI_API_KEY production --sensitive
vercel env add OPENAI_MODEL production
vercel env add ALLOWED_ORIGINS production
vercel --prod
```

Ne jamais placer une clé dans `public/`, un fichier commité ou une variable préfixée `NEXT_PUBLIC_`.

## Contrats d’API

### Classification

```json
POST /api/classify
{
  "description": "Machine d'emballage avec installation à Montréal",
  "category": "industrial",
  "min_budget": 5000,
  "max_budget": 12000,
  "currency": "CAD",
  "location": "Montréal",
  "requires_installation": true
}
```

### Matching

`POST /api/match` reçoit `{ "request": {...}, "candidates": [...] }`. Un candidat peut fournir `semantic_score`, `capability_score`, `constraint_score`, `location_score`, `total_price`, `total_transactions`, `successful_transactions`, `rating` et `eligible`.

## Données et sécurité

La configuration publique Supabase se trouve dans `public/db.js`; c’est volontaire, car la clé publishable identifie l’application sans lui accorder de privilège serveur. La sécurité repose sur les politiques RLS. Ne jamais y ajouter une clé `secret` ou `service_role`.

Les migrations sont dans `supabase/migrations/`. Toute évolution de schéma doit conserver RLS, index de colonnes d’autorisation et séparation acheteur/fournisseur/admin.

## Limites conscientes

Ce MVP ne prétend pas être la plateforme complète du document maître. Restent conditionnés à des décisions humaines ou à des comptes externes :

- avis juridique sur le rôle de paiement, le statut MSB et la terminologie escrow;
- paiement et messagerie transactionnelle externe;
- import en lot Overture Places et connecteurs commerciaux sous contrat;
- contrats, taxes, KYB/KYC, sanctions et conformité sectorielle;
- paiement, ledger financier, remboursements et litiges;
- rate limiting distribué et observabilité persistante;
- revue de sécurité, EFVP, tests de charge et pentest.

## Architecture suivante recommandée

Le registre interne dispose maintenant d’une recherche réelle et traçable. Ajouter ensuite un connecteur externe autorisé, pgvector pour le rappel sémantique, le stockage objet des justificatifs et un workflow durable pour les processus longs. Le LLM doit rester hors des calculs de paiement, d’autorisation et de conformité finale.
