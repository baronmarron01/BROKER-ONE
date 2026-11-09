export function prepareProposal(entry,request){
 if(!entry||!['buy','sell'].includes(request.direction))throw new Error('Sélectionnez un résultat et votre rôle.');
 const url=new URL(entry.url);if(url.protocol!=='https:')throw new Error('Source invalide.');
 return {recipient:entry.name,source:url.href,action:request.direction==='sell'?'Proposition commerciale à examiner':'Préparation d’achat / demande de devis',text:`Bonjour,\n\nConcernant votre activité ou demande publiée : ${url.href}\n\n${request.direction==='sell'?'Nous proposons :':'Nous recherchons :'}\n${request.description}\n\nPouvez-vous confirmer votre besoin ou disponibilité actuelle, les spécifications indispensables, la quantité, le budget ou prix, le calendrier et la personne habilitée à décider ?\n\nLa compatibilité, les conditions et les documents applicables restent à vérifier. Ce message ne constitue ni commande, ni acceptation, ni engagement de paiement.\n\n[Nom et coordonnées à compléter]`,unknowns:'Destinataire et coordonnées à vérifier ; disponibilité, compatibilité, budget et pouvoir de décision non confirmés.'};
}
export function proposalSnapshot(p){return JSON.stringify({recipient:p.recipient,source:p.source,action:p.action,text:p.text});}
export function approvalCurrent(p,approvedSnapshot){return Boolean(approvedSnapshot)&&proposalSnapshot(p)===approvedSnapshot;}
