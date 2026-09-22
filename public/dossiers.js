import {currentUser,table} from './db.js';
import {amountMinor,compareOffers} from './comparison.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c)=>v==null?'Inconnu':new Intl.NumberFormat('fr-CA',{style:'currency',currency:c}).format(v/100);
const stages={candidate:'Piste à qualifier',contacted_by_user:'Contact déclaré par vous',response_received:'Réponse reçue selon vous',excluded:'Écartée'};
const costLabels={base_minor:'prix de base',tax_minor:'taxes',shipping_minor:'transport',installation_minor:'installation'};
export function mountDossiers(getRequest,getResearch){
 const $=id=>document.getElementById(id);
 let selected=null,offers=[],dossiers=[],generation=0;
 const status=message=>{$('dossierStatus').textContent=message;};
 function reset(){generation++;selected=null;offers=[];dossiers=[];$('dossierSelect').replaceChildren();$('dossierDetails').replaceChildren();$('offerRows').replaceChildren();$('offerForm').reset();$('offerId').value='';$('offerForm').hidden=true;}
 async function load(){
  reset();if(!currentUser()){status('Connectez-vous pour conserver vos recherches et offres dans un dossier privé.');return;}
  const ticket=generation;
  try{const rows=await table('procurement_dossiers',{order:'created_at.desc',limit:100});if(ticket!==generation)return;dossiers=rows;
   $('dossierSelect').innerHTML='<option value="">Choisir un dossier</option>'+rows.map(d=>`<option value="${esc(d.id)}">${esc(d.title)} — ${new Date(d.created_at).toLocaleDateString('fr-CA')}</option>`).join('');status(rows.length?'Sélectionnez un dossier pour reprendre son suivi.':'Aucun dossier. Enregistrez votre besoin actuel.');
  }catch(e){status('Chargement impossible : '+e.message);}
 }
 async function open(id){
  const dossier=dossiers.find(d=>d.id===id);selected=dossier||null;offers=[];$('offerRows').replaceChildren();$('offerForm').reset();$('offerId').value='';$('offerForm').hidden=!dossier;
  if(!dossier){$('dossierDetails').replaceChildren();return;}
  const ticket=++generation;
  $('dossierDetails').innerHTML=`<h3>${esc(dossier.title)}</h3><p>${esc(dossier.request_snapshot.description)}</p><details><summary>Recherche et sources conservées</summary><pre>${esc(dossier.research_text||'Aucune recherche enregistrée avec ce dossier.')}</pre><ul>${dossier.sources.filter(s=>/^https:\/\//.test(s.url||'')).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.url)}</a></li>`).join('')}</ul></details>`;
  try{const rows=await table('procurement_offers',{filters:`&dossier_id=eq.${id}`,order:'created_at.desc',limit:200});if(ticket!==generation)return;offers=rows;render();status('Dossier chargé. Les modifications d’offres doivent être enregistrées.');}catch(e){status('Lecture des offres impossible : '+e.message);}
 }
 function render(){
  const rows=compareOffers(offers);
  $('offerRows').innerHTML=rows.length?`<div class="comparison-scroll"><table class="comparison-table"><caption>Offres regroupées par devise. Aucune conversion ni recommandation automatique.</caption><thead><tr><th>Entreprise et suivi</th><th>Base</th><th>Taxes</th><th>Transport</th><th>Installation</th><th>Total et validité</th><th>Preuves et conditions</th></tr></thead><tbody>${rows.map(o=>`<tr><td><b>${esc(o.supplier_name)}</b><p>${stages[o.stage]}</p><button class="mini edit-offer" data-id="${esc(o.id)}" type="button">Modifier</button></td>${['base_minor','tax_minor','shipping_minor','installation_minor'].map(k=>`<td>${money(o[k],o.currency)}</td>`).join('')}<td><b>${money(o.total_minor,o.currency)}</b><p>${o.missing.length?'Manquant : '+o.missing.map(k=>costLabels[k]).join(', '):o.comparable?'Montant complet déclaré':'Non comparable à ce stade'}</p><p>${o.expired?'EXPIRÉE · ':''}${esc(o.valid_until||'Validité inconnue')}</p><p>Délai : ${o.delivery_days==null?'inconnu':o.delivery_days+' jours'}</p></td><td><p>Saisie par l’acheteur · non vérifiée</p><p>${esc(o.qualification_notes||'Aucune preuve de qualification renseignée.')}</p><p>${esc(o.notes||'Conditions non renseignées.')}</p>${o.source_url?`<a href="${esc(o.source_url)}" target="_blank" rel="noopener noreferrer">Source fournie</a>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p>Aucune offre ni piste dans ce dossier. Ajoutez une entreprise ci-dessous.</p>';
 }
 $('saveDossierBtn').addEventListener('click',async()=>{
  if(!currentUser()){status('Connexion nécessaire : utilisez le bouton Connexion en haut de page.');return;}
  const request=getRequest();if(request.description.length<10){status('Décrivez votre besoin en au moins 10 caractères.');return;}
  const research=getResearch();const include=research && research.request_key===JSON.stringify(request);
  const buyer=currentUser().id;const button=$('saveDossierBtn');button.disabled=true;
  try{const dossier=await table('procurement_dossiers',{method:'POST',single:true,body:{buyer_user_id:buyer,title:request.description.slice(0,160),request_snapshot:request,research_text:include?research.content:'',sources:include?research.citations:[]}});
   if(currentUser()?.id!==buyer)return;await load();$('dossierSelect').value=dossier.id;await open(dossier.id);status(include?'Dossier enregistré avec la recherche et ses sources.':'Besoin enregistré. Aucune recherche correspondant exactement à cette version du besoin.');
  }catch(e){status('Enregistrement impossible : '+e.message);}finally{button.disabled=false;}
 });
 $('refreshDossiers').addEventListener('click',load);
 $('dossierSelect').addEventListener('change',()=>open($('dossierSelect').value));
 $('offerRows').addEventListener('click',e=>{
  const button=e.target.closest('.edit-offer');if(!button)return;const offer=offers.find(o=>o.id===button.dataset.id);if(!offer)return;
  $('offerId').value=offer.id;
  for(const [id,key] of Object.entries({offerName:'supplier_name',offerSource:'source_url',offerCurrency:'currency',offerStage:'stage',offerValidity:'valid_until',offerDelivery:'delivery_days',offerNotes:'notes',offerQualification:'qualification_notes'}))$(id).value=offer[key]??'';
  for(const [id,key] of Object.entries({offerBase:'base_minor',offerTax:'tax_minor',offerShipping:'shipping_minor',offerInstallation:'installation_minor'}))$(id).value=offer[key]==null?'':(offer[key]/100).toFixed(2);
  $('offerName').focus();status('Modification de '+offer.supplier_name+'. Cliquez sur Enregistrer pour confirmer.');
 });
 $('newOfferBtn').addEventListener('click',()=>{$('offerForm').reset();$('offerId').value='';status('Nouvelle piste ou offre.');});
 $('offerForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!selected||!currentUser()){status('Sélectionnez un dossier de votre compte.');return;}
  const button=$('saveOfferBtn');button.disabled=true;const dossierId=selected.id;const buyer=currentUser().id;
  try{
   const source=$('offerSource').value.trim();if(source && new URL(source).protocol!=='https:')throw new Error('La source doit utiliser https://.');
   const payload={supplier_name:$('offerName').value.trim(),source_url:source,currency:$('offerCurrency').value,stage:$('offerStage').value,valid_until:$('offerValidity').value||null,delivery_days:$('offerDelivery').value===''?null:Number($('offerDelivery').value),notes:$('offerNotes').value.trim(),qualification_notes:$('offerQualification').value.trim()};
   for(const [id,key] of Object.entries({offerBase:'base_minor',offerTax:'tax_minor',offerShipping:'shipping_minor',offerInstallation:'installation_minor'}))payload[key]=amountMinor($(id).value);
   const id=$('offerId').value;
   const saved=await table('procurement_offers',id?{method:'PATCH',filters:`?id=eq.${id}&dossier_id=eq.${dossierId}`,body:payload}:{method:'POST',body:{...payload,dossier_id:dossierId,buyer_user_id:buyer}});
   if(!saved?.length)throw new Error('Aucune modification enregistrée. Rechargez le dossier.');
   if(currentUser()?.id!==buyer)return;await open(dossierId);status('Piste ou offre enregistrée. Le statut est votre déclaration ; aucun message ni engagement n’a été envoyé.');
  }catch(error){status(error.message);}finally{button.disabled=false;}
 });
 document.addEventListener('broker-session-change',load);
 return load;
}
