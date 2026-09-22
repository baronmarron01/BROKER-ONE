# Livraison v2.8 — 22 septembre 2026

Cette livraison ajoute des dossiers privés, des pistes/offres saisies par l’acheteur et un comparateur de coûts. Elle ne fournit pas encore une qualification documentaire certifiée ni un envoi externe.

Parcours : saisir le besoin → rechercher des entreprises → enregistrer le besoin et ses sources dans un dossier → ajouter une piste ou une offre → renseigner prix, taxes, transport, installation, devise, validité, délai et preuves → retrouver et modifier le suivi dans le compte.

- Un dossier conserve une copie du besoin et uniquement une recherche correspondant exactement à cette version. Une recherche périmée après modification du besoin n’est pas jointe.
- Offres modifiables ; identité du propriétaire et rattachement au dossier non modifiables par le client.
- Les étapes « contacté » et « réponse reçue » sont des déclarations de l’acheteur, sans envoi par l’application.
- Totaux en unités monétaires entières ; champs vides inconnus, zéro explicite inclus ; pas de total complet lorsqu’un poste manque.
- Devises séparées, offres expirées ou sans validité et pistes sans réponse signalées non comparables. Aucun classement de qualité ou conformité déduit du prix.
- Sources, conditions et notes de qualification affichées avec échappement HTML.
- Limites actuelles d’affichage : 100 dossiers récents et 200 offres par dossier ; pagination non implémentée.

Tests v2.8 : 22 tests Node réussis. Transaction Supabase annulée : lecture propriétaire, conservation des coûts inconnus, blocage lecture/modification/insertion intercomptes et usurpation du propriétaire, tous réussis. Vérification navigateur en production réussie après connexion sécurisée : accès visiteur refusé avec message explicite, création du dossier [TEST v2.8], création d’une offre fictive avec transport inconnu et total inconnu, modification du transport à zéro, rechargement complet puis réouverture du dossier : total exact conservé de 1 150,12 CAD (base 1 000,10 + taxes 150,02). Les données sont explicitement fictives et restent identifiées comme test dans le compte. Aucun fournisseur contacté. Ce test ne valide pas encore l’import de documents ni une transaction commerciale complète.

La comparaison normalisée de coûts saisis est désormais implémentée. L’import automatisé de vrais devis, les preuves documentaires, la conversion de devises, les envois, les contrats, les paiements et les commissions restent à construire ou intégrer. L’ancien état ci-dessous reste l’historique de la v2.7.

---

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
