# BROKER-ONE MVP v2.4

MVP fonctionnel de courtage B2B assisté. Cette reconstruction transforme le proxy OpenAI initial en une application testable avec interface, classification de risque, matching explicable et assistant IA borné.

## Capacités livrées

- Interface web responsive en français.
- `POST /api/classify` : validation et classification déterministe A/B/C avec matrice de risques.
- `POST /api/match` : classement explicable, contraintes éliminatoires et prior bayésien.
- `POST /api/ai` : assistant IA borné à trois tâches autorisées.
- `POST /api/search` : registre interne et découverte externe GLEIF/Wikidata avec provenance.
- Authentification Supabase, PostgreSQL, RLS, demandes de devis et piste d’audit.
- Candidats externes non vérifiés et non contactables avant validation.
- Clé OpenAI exclusivement côté serveur.

## Démarrage

Prérequis : Node.js 20 ou supérieur.

```bash
npm install
cp .env.example .env.local
npm test
npm run dev:local
```

Ouvrir `http://localhost:3000`.

## Sécurité

Ne jamais placer une clé secrète dans `public/`, dans Git ou dans une variable `NEXT_PUBLIC_`. La clé Supabase exposée dans `public/db.js` est une clé publishable; les autorisations sont appliquées avec RLS.

## Déploiement

Le projet est conçu pour Vercel. Configurer côté serveur `OPENAI_API_KEY`, `OPENAI_MODEL` et `ALLOWED_ORIGINS`, puis déployer la branche `main`.
