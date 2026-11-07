export function resolveDirection(request={}) {
 if(['buy','sell'].includes(request.direction)) return request.direction;
 const s=String(request.description||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const sell=/\b(je vends?|nous vendons|i sell|we sell|i am selling|i'm selling|je propose|nous proposons|j'offre|we offer|i offer)\b|\b(cherche|recherche|besoin|looking for|need)\b.{0,35}\b(acheteurs?|clients?|buyers?|customers?)\b/.test(s);
 const buy=/\b(j'achete|je veux acheter|nous achetons|i buy|we buy|i want to buy|je cherche|je recherche|j'ai besoin|i need|looking for)\b/.test(s.replace(/\b(cherche|recherche|besoin|looking for|need)\b.{0,35}\b(acheteurs?|clients?|buyers?|customers?)\b/g,''));
 return sell&&!buy?'sell':buy&&!sell?'buy':null;
}
export function requireDirection(request) {
 const direction=resolveDirection(request);
 if(!direction)throw new Error('Précisez votre objectif : acheter / recevoir un service, ou vendre / proposer un service.');
 return direction;
}
export const roleLabel=direction=>direction==='sell'?'Vendeur / prestataire':'Acheteur / demandeur';
export const targetLabel=direction=>direction==='sell'?'Acheteurs / clients potentiels':'Vendeurs / prestataires';
export function canonicalUrl(value) {try{const u=new URL(value);if(u.protocol!=='https:')return '';u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_'))u.searchParams.delete(k);return u.href.replace(/\/$/,'');}catch{return '';}}
export function uniqueBusinesses(items) {
 const names=new Set(),domains=new Set();
 return items.filter(x=>{const url=canonicalUrl(x.url);if(!url||!x.name?.trim())return false;const name=x.name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');const domain=new URL(url).hostname.replace(/^www\./,'');if(names.has(name)||domains.has(domain))return false;names.add(name);domains.add(domain);return true;});
}
export function draftMessage(r) {
 const sell=requireDirection(r)==='sell';
 return `Objet : ${sell?'Proposition commerciale':'Demande de devis'} — ${r.description.slice(0,80)}\n\nBonjour,\n\n${sell?'Voici le produit ou service que nous proposons :':'Voici notre besoin :'}\n${r.description}\n\nZone recherchée : ${r.location||'à préciser'}\n${sell?'Prix proposé':'Budget indicatif'} : ${r.min_budget??'à préciser'} à ${r.max_budget??'à préciser'} ${r.currency} (à confirmer).\n\n${sell?'Cette offre correspond-elle à un besoin actuel chez vous ? Merci de préciser les quantités, votre calendrier, vos contraintes techniques et votre processus de décision. Les caractéristiques annoncées doivent être documentées avant toute vente.':'Merci de préciser vos capacités, votre prix détaillé, les taxes, le transport, les délais, les garanties et les justificatifs utiles.'}\n\nCoordonnées : [à compléter]\nAucun engagement contractuel. Message à relire et envoyer vous-même.\n`;
}
