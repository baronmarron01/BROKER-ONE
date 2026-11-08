import {currentUser,table} from './db.js';
import {requireDirection,roleLabel,targetLabel} from './direction.js';
import {amountMinor} from './comparison.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMarket(getRequest){
 const $=id=>document.getElementById(id);
 let candidates=[],mine=[],threads=[],active=null,generation=0;
 const status=s=>{$('marketStatus').textContent=s;};
 function renderCandidates(rows){
  candidates=rows;
  $('matchesPanel').hidden=false;$('searchBadge').textContent=rows.length+' annonce(s) publiée(s) · déclarations non vérifiées · filtre de zone par texte déclaré, sans géocodage';
  $('matches').innerHTML=rows.map(l=>`<article class="match"><div><span class="badge">${roleLabel(l.direction)}</span><h3>${esc(l.business_name)} — ${esc(l.title)}</h3><p>${esc(l.description)}</p><p>${esc(l.location)} · annonce du ${new Date(l.created_at).toLocaleDateString('fr-CA')}</p><p>Intérêt déclaré par publication ; disponibilité et qualification à confirmer.</p>${l.website?`<a href="${esc(l.website)}" rel="noopener noreferrer" target="_blank">Site déclaré</a>`:''}<button type="button" class="mini prepare-market" data-id="${l.id}">Préparer un échange privé</button></div></article>`).join('')||'<p>Aucune annonce correspondante publiée dans le registre. La recherche web peut trouver des prospects ; aucun résultat fictif ne sera ajouté.</p>';
 }
 async function search(){
  const r=getRequest();r.direction=requireDirection(r);
  const response=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:r,limit:20})});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Recherche impossible');
  renderCandidates(data.candidates.filter(l=>l.owner_id!==currentUser()?.id));
  $('matchesPanel').scrollIntoView({behavior:'smooth'});
 }
 async function load(){
  const ticket=++generation;active=null;threads=[];mine=[];$('threadMessages').replaceChildren();$('threadSelect').replaceChildren();$('myListings').replaceChildren();$('marketMessageForm').hidden=true;
  if(!currentUser()){status('Connectez-vous pour publier une offre ou un besoin et échanger dans le portail.');return;}
  try{const [list,t]=await Promise.all([table('market_listings',{filters:`&owner_id=eq.${currentUser().id}`,order:'created_at.desc',limit:100}),table('market_threads',{order:'created_at.desc',limit:100})]);if(ticket!==generation)return;mine=list;threads=t;renderMine();renderThreads();status('Offres, demandes et conversations chargées.');}catch(e){status(e.message);}
 }
 function renderMine(){$('myListings').innerHTML=mine.map(l=>`<article><b>${esc(l.title)}</b><p>${roleLabel(l.direction)} · ${esc(l.status)}</p><button class="mini listing-edit" type="button" data-id="${l.id}">Modifier / publier / fermer</button></article>`).join('')||'<p>Aucune annonce personnelle.</p>';}
 function renderThreads(){$('threadSelect').innerHTML='<option value="">Choisir une conversation</option>'+threads.map(t=>`<option value="${t.id}">${esc(t.subject)}</option>`).join('');}
 async function openThread(id){
  active=threads.find(t=>t.id===id)||null;$('marketMessageForm').hidden=!active;$('threadMessages').replaceChildren();if(!active)return;
  const rows=await table('market_messages',{filters:`&thread_id=eq.${id}`,order:'created_at.asc',limit:200});if(active?.id!==id)return;
  $('threadMessages').innerHTML='<p>Échange privé entre les deux participants. Les propositions ne constituent pas une acceptation ni un paiement.</p>'+rows.map(m=>`<article><b>${m.sender_id===currentUser()?.id?'Vous':'Votre interlocuteur'}</b> · ${new Date(m.created_at).toLocaleString('fr-CA')}<p>${esc(m.body)}</p>${m.amount_minor!=null?`<p>Proposition : ${new Intl.NumberFormat('fr-CA',{style:'currency',currency:m.currency}).format(m.amount_minor/100)} · valable jusqu’au ${esc(m.valid_until)} ${m.valid_until<new Date().toISOString().slice(0,10)?'— EXPIRÉE':''}</p>`:''}</article>`).join('');
 }
 $('matches').addEventListener('click',async e=>{
  const b=e.target.closest('.prepare-market');if(!b)return;
  if(!currentUser()){status('Connectez-vous avant de préparer cet échange.');$('marketPanel').scrollIntoView();return;}
  const l=candidates.find(x=>x.id===b.dataset.id);if(!l)return;
  // This only prepares the recipient. No thread or message is sent by this click.
  $('recipientListing').value=l.id;$('recipientName').textContent=`Destinataire : ${l.business_name} — ${l.title}`;
  $('startThreadForm').hidden=false;$('startThreadBody').value='';$('startThreadForm').scrollIntoView({behavior:'smooth'});
 });
 $('startThreadForm').addEventListener('submit',async e=>{
  e.preventDefault();const user=currentUser();if(!user){status('Connexion nécessaire.');return;}
  const l=candidates.find(x=>x.id===$('recipientListing').value);if(!l){status('Relancez la recherche pour choisir le destinataire.');return;}
  const body=$('startThreadBody').value.trim();if(!body)return;const b=$('sendFirstMessage');b.disabled=true;
  try{const direction=requireDirection(getRequest());if(direction===l.direction)throw new Error('Cette annonce ne correspond plus à votre rôle. Relancez la recherche.');
   const existing=await table('market_threads',{filters:`&listing_id=eq.${l.id}&initiator_id=eq.${user.id}`,limit:1});
   let t=existing[0];if(!t)t=await table('market_threads',{method:'POST',single:true,body:{listing_id:l.id,initiator_id:user.id,recipient_id:l.owner_id,initiator_direction:direction,subject:l.title}});
   await table('market_messages',{method:'POST',body:{thread_id:t.id,sender_id:user.id,body}});
   $('startThreadForm').hidden=true;await load();$('threadSelect').value=t.id;await openThread(t.id);status('Message envoyé dans le portail au destinataire indiqué.');
  }catch(e){status('Envoi impossible : '+e.message);}finally{b.disabled=false;}
 });
 $('marketMessageForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!active||!currentUser())return;const id=active.id;const b=$('sendMarketReply');b.disabled=true;
  try{const amount=amountMinor($('replyAmount').value);const date=$('replyValidity').value;if(amount!=null&&!date)throw new Error('Précisez la date de validité de la proposition.');
   await table('market_messages',{method:'POST',body:{thread_id:id,sender_id:currentUser().id,body:$('replyBody').value.trim(),amount_minor:amount,currency:amount==null?null:$('replyCurrency').value,valid_until:amount==null?null:date}});
   $('marketMessageForm').reset();await openThread(id);status('Réponse enregistrée dans la conversation.');
  }catch(e){status(e.message);}finally{b.disabled=false;}
 });
 $('threadSelect').addEventListener('change',()=>openThread($('threadSelect').value).catch(e=>status(e.message)));
 $('refreshMarket').addEventListener('click',load);
 $('listingForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser()){status('Connexion nécessaire.');return;}
  const b=$('saveListing');b.disabled=true;
  try{const r=getRequest(),direction=requireDirection(r),id=$('listingId').value;const website=$('listingWebsite').value.trim();if(website&&new URL(website).protocol!=='https:')throw new Error('Utilisez un site https://.');
   if(id&&mine.find(x=>x.id===id)?.direction!==direction)throw new Error('Le rôle ne peut pas changer sur une annonce existante. Créez une nouvelle annonce.');
   const payload={title:r.description.slice(0,160),description:r.description,category:r.category,location:r.location,business_name:$('listingBusiness').value.trim(),website,status:$('listingStatus').value};
   if(payload.status==='active'&&!$('publishConsent').checked)throw new Error('Confirmez que ces informations peuvent être publiques.');
   await table('market_listings',id?{method:'PATCH',filters:`?id=eq.${id}&owner_id=eq.${currentUser().id}`,body:payload}:{method:'POST',body:{...payload,owner_id:currentUser().id,direction}});
   $('listingForm').reset();$('listingId').value='';await load();status('Annonce enregistrée. Seules les annonces actives sont publiques.');
  }catch(e){status(e.message);}finally{b.disabled=false;}
 });
 $('newListing').addEventListener('click',()=>{$('listingForm').reset();$('listingId').value='';status('Nouvelle annonce à partir du formulaire principal.');});
 $('myListings').addEventListener('click',e=>{const b=e.target.closest('.listing-edit');if(!b)return;const l=mine.find(x=>x.id===b.dataset.id);if(!l)return;
  $('description').value=l.description;$('category').value=l.category;$('location').value=l.location;$('searchDirection').value=l.direction;$('requestForm').dispatchEvent(new Event('input',{bubbles:true}));
  $('listingId').value=l.id;$('listingBusiness').value=l.business_name;$('listingWebsite').value=l.website;$('listingStatus').value=l.status;$('publishConsent').checked=false;status('Modifiez le descriptif dans le formulaire principal puis enregistrez. Le rôle de cette annonce reste inchangé.');
 });
 document.addEventListener('broker-session-change',()=>{$('startThreadForm').hidden=true;load();});
 return {load,search};
}
