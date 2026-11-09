// Manually reviewed public references, NOT live-discovered or verified buyers.
export const opportunities=[
 {id:'mic-rniGZtRysSaP',name:'Demande publiée — 50 machines diode, États-Unis',url:'https://sourcing.made-in-china.com/request/rniGZtRysSaP/Hair-Removal-Machine.html',published:'2026-08-25',deadline:'2026-11-13',reviewed:'2026-11-08',country:'États-Unis',summary:'50 unités ; diode 755/808/1064 nm ; puissance de pièce à main annoncée ≥ 1 000 W. Prix cible dans le descriptif : 1 000–1 500 USD/unité.',limits:'Budget contradictoire entre formulaire et descriptif. Conditions FOB Ningbo/Shanghai et exigences documentaires américaines à examiner. Votre quatrième longueur d’onde, la puissance, le prix et les conditions de livraison ne sont pas validés. Identité acheteur réservée aux membres Premium.'},
 {id:'mic-vQiGDWLJVSTz',name:'Demande publiée — 15 appareils d’épilation, États-Unis',url:'https://sourcing.made-in-china.com/request/vQiGDWLJVSTz/Professional-Hair-Removal-Beauty-Machine.html',published:'2026-09-24',deadline:'2026-12-11',reviewed:'2026-11-08',country:'États-Unis',summary:'15 appareils professionnels ; destination New York ; demande de devis, spécifications, garanties et documents pour le marché américain.',limits:'Technologie exacte non précisée ; image de référence et identité acheteur derrière un accès Premium. Recherche de fabricant pour coopération potentielle. Compatibilité avec votre appareil non établie.'}
];
export function knownOpportunities(r={},now=new Date()){
 if(r.direction!=='sell')return [];
 const text=String(r.description||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(r.semantic_plan?.product_family!=='hair_removal_equipment'&&(!/epilation|hair removal/.test(text)||!/laser|diode|machine|appareil|equipment|device/.test(text)))return [];
 const scope=r.search_scope||'worldwide';
 const target=String(scope==='local'?r.location:r.target_region||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 // Do not infer that a country-level notice satisfies a city-level filter.
 if(scope!=='worldwide'&&!target.split(';').some(x=>/^(etats[- ]unis|united states(?: of america)?|usa|us|amerique du nord|north america)$/.test(x.trim())))return [];
 const today=now.toISOString().slice(0,10);
 return opportunities.filter(x=>x.reviewed<=today&&x.deadline>today);
}
