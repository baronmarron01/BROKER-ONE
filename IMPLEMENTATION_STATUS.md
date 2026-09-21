# BROKER-ONE — état vérifié au 21 septembre 2026

## Résultat attendu pour l’usager

Décrire son besoin, répondre aux questions utiles, obtenir des pistes d’entreprises avec preuves, qualifier leurs capacités, demander de vrais devis, comparer leurs conditions puis décider. Une piste trouvée sur le web n’est pas un fournisseur qualifié. Un brouillon n’est pas un message transmis. Une offre soumise n’est pas acceptée par l’acheteur.

## Corrections livrées en v2.7

- Recherche web par OpenAI Responses avec outil web_search obligatoire et citations cliquables. Les résultats sans citations ou incomplets sont refusés. Délai serveur borné à 50 secondes.
- Les réponses de clarification enrichissent réellement la description. Toute modification invalide classification, identifiant courant et ancien classement.
- Les fournisseurs fictifs ont été retirés de la recherche commerciale. Les références GLEIF/Wikidata ne sont plus mélangées au classement dans le parcours principal.
- Absence d’historique : aucun pourcentage de confiance affiché. Un prix absent n’est plus converti en zéro.
- Détection conservatrice de certains termes réglementés dans le texte, même si la catégorie est industrielle. Ce filtre lexical reste incomplet et ne constitue pas une décision juridique.
- Brouillon de devis modifiable, téléchargeable et enregistrable dans le compte avec RLS par propriétaire. Aucun envoi extérieur effectué.
- Demandes de devis du portail limitées aux fournisseurs actifs, vérifiés et disposant d’un compte propriétaire.
- Association d’une réponse au bon fournisseur et à la bonne demande imposée en base ; identifiants non réassignables par le client.
- Une réponse fournisseur ne marque plus sa propre offre acceptée.
- Correction d’une récursion RLS révélée par le test de devis. La fonction privée ne renvoie que l’appartenance de la demande à l’identité connectée.
- Une revue administrative externe crée seulement une piste pending, sans score de fiabilité inventé et sans cocher automatiquement des vérifications non réalisées.
- Correction CSS de l’attribut hidden ; traduction des risques et approbations ; échecs d’historique signalés.

## Tests exécutés

| Test | Résultat et portée |
|---|---|
| Suite Node | 17 tests réussis, dont refus d’une recherche IA sans citations et non-déclassement d’un besoin réglementé |
| Syntaxe | API et app.js valides |
| Site déployé | API health 2.7.0 et interface v2.7 observées |
| Recherche web navigateur | Cinq pistes accompagnées de sources renvoyées pour l’emballage alimentaire à Montréal ; pertinence commerciale et conformité non certifiées |
| Classification navigateur | Besoin avec installation classé B |
| Recherche registre navigateur | État explicite « Aucun fournisseur qualifié », sans résultats de démonstration |
| Clarification navigateur | Réponse saisie intégrée dans la description ; ancien bouton de classement masqué |
| Téléchargement du brouillon | Fonction présente ; deux attentes de téléchargement ont expiré dans le navigateur de test. Export non validé, texte consultable et copiable dans le formulaire |
| Brouillon navigateur | Texte généré avec besoin, lieu, budget et informations à demander |
| Devis Supabase | Dans une transaction annulée : acheteur de test → fournisseur de test → offre soumise → offre visible par l’acheteur ; réussi après correction RLS |
| Confidentialité brouillons | Brouillon d’une identité synthétique invisible à une autre ; transaction annulée |
| Privilèges SQL | Lecture anonyme des brouillons interdite ; réassignation acheteur et fournisseur interdite |
| Qualification administrative | Définition SQL vérifiée : création pending, qualification commerciale false |

Ces tests ne sont pas une transaction commerciale réelle. Aucun fournisseur n’a été contacté, aucun paiement effectué, aucun compte réel usurpé. Le parcours connecté complet dans le navigateur avec deux comptes réels reste à valider ; le test des rôles en base ne le remplace pas.

## Ce qui reste à construire ou valider

1. Transformer les résultats web en dossiers structurés persistants, reliés à chaque besoin, avec déduplication et critères de qualification documentés.
2. Achever le rattachement sécurisé d’un représentant fournisseur, les contrôles documentaires, la décision de qualification et sa révocation.
3. Relier l’approbation de contact à une action effectivement contrôlée côté serveur ; les gates affichées ne sont pas encore un workflow d’approbation complet.
4. Mettre en place l’envoi transactionnel et ses accusés, la réception des réponses extérieures et la messagerie. Actuellement : brouillon manuel ou boîte du portail pour comptes inscrits.
5. Comparateur normalisé des offres (transport, taxes, installation, garanties, devises, validité) ; les conditions sont affichées mais le coût total n’est pas normalisé.
6. Paiements, contrats, commissions, livraison, litiges et recherche inverse d’acheteurs : non implémentés. Choix commerciaux, partenaires et contrôles adaptés requis avant activation.
7. Limitation de coûts et débit partagée entre instances, surveillance d’erreurs, reprise des traitements longs, tests multi-utilisateurs navigateur, accessibilité et responsive approfondis.
8. La configuration Supabase signale la protection contre les mots de passe divulgués désactivée. La fonction administrative SECURITY DEFINER est également signalée ; elle contrôle explicitement le rôle administrateur.

## Appréciation

4/10 par rapport à la vision complète de courtage. Le sourcing sourcé et les correctifs de devis sont concrets, mais l’application n’est pas un courtier autonome ni un produit prêt pour des transactions réelles. Le travail restant comprend du développement ; il ne dépend pas exclusivement d’une intervention humaine.

## Reproduction

`npm test` puis `npm run check`. Le test SQL `supabase/tests/quote_roundtrip_rollback.sql` utilise uniquement des données synthétiques dans BEGIN/ROLLBACK. Les réparations SQL appliquées à distance sont conservées dans `supabase/repairs/` ; ne pas les réappliquer aveuglément. La dernière réparation interdit la promotion commerciale automatique des pistes.
