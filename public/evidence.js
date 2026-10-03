import {currentUser,table,evidenceStorage} from './db.js';
import {inspectDocument,verifyDocument} from './evidence-validation.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const criteria={identity:'Identité de l’entreprise',technical_fit:'Adéquation technique',commercial_terms:'Conditions commerciales',compliance:'Conformité documentaire'};
const findings={supported:'Étayé selon votre revue',insufficient:'Preuves insuffisantes',contradicted:'Contradiction relevée'};
export function mountEvidence(){
 const $=id=>document.getElementById(id);
 let offer=null,documents=[],ticket=0;
 const status=s=>{$('evidenceStatus').textContent=s;};
 function reset(){ticket++;offer=null;documents=[];$('evidencePanel').hidden=true;$('documentList').replaceChildren();$('reviewHistory').replaceChildren();$('documentForm').reset();$('reviewForm').reset();$('reviewDocument').replaceChildren();}
 async function refresh(){
  if(!offer)return;const stamp=++ticket;const id=offer.id;
  const docs=await table('offer_documents',{filters:`&offer_id=eq.${id}`,order:'created_at.desc',limit:100});
  if(stamp!==ticket)return;documents=docs;
  const reviews=docs.length?await table('offer_document_reviews',{filters:`&document_id=in.(${docs.map(d=>d.id).join(',')})`,order:'created_at.desc',limit:200}):[];
  if(stamp!==ticket)return;
  $('documentList').innerHTML=docs.length?docs.map(d=>`<article class="evidence-card"><b>${esc(d.file_name)}</b><p>${Math.ceil(d.byte_size/1024)} Ko · reçu le ${esc(d.received_on)} · ${d.uploaded_at?'Dépôt confirmé':'Transfert incomplet'}</p><p>Provenance déclarée : ${esc(d.provenance)}</p><p class="evidence-hash">Empreinte SHA-256 : ${esc(d.sha256)}</p>${d.uploaded_at?`<button class="mini download-document" type="button" data-id="${esc(d.id)}">Télécharger ${esc(d.file_name)}</button>`:'<p>Le dépôt n’est pas confirmé. Si le transfert a abouti, confirmez-le ; sinon déposez de nouveau le fichier.</p><button class="mini finalize-document" type="button" data-id="${esc(d.id)}">Confirmer le transfert</button>'}</article>`).join(''):'<p>Aucune pièce jointe.</p>';
  const ready=docs.filter(d=>d.uploaded_at);
  $('reviewDocument').innerHTML=ready.map(d=>`<option value="${esc(d.id)}">${esc(d.file_name)}</option>`).join('');
  $('reviewForm').hidden=!ready.length;
  $('reviewHistory').innerHTML=reviews.length?`<h4>Historique de vos revues</h4>${reviews.map(r=>`<article class="evidence-card"><b>${criteria[r.criterion]} · ${findings[r.finding]}</b><p>${esc(documents.find(d=>d.id===r.document_id)?.file_name)} · ${esc(new Date(r.created_at).toLocaleString('fr-CA'))}</p><p>${esc(r.conclusion)}</p></article>`).join('')}`:'<p>Aucune revue documentaire enregistrée.</p>';
 }
 async function open(value){reset();offer=value;$('evidencePanel').hidden=false;$('evidenceOffer').textContent=value.supplier_name;$('receivedOn').value=new Date().toISOString().slice(0,10);status('Chargement des pièces…');const id=value.id;try{await refresh();if(offer?.id===id)status('Pièces privées de cette offre.');}catch(e){if(offer?.id===id)status(e.message);}}
 $('closeEvidence').addEventListener('click',reset);
 $('refreshEvidence').addEventListener('click',async()=>{try{await refresh();status('Pièces et revues actualisées.');}catch(e){status(e.message);}});
 $('documentForm').addEventListener('submit',async e=>{
  e.preventDefault();const user=currentUser();if(!offer||!user)return;
  const offerId=offer.id;const buyer=user.id;const button=$('uploadDocument');button.disabled=true;
  const active=()=>currentUser()?.id===buyer&&offer?.id===offerId;
  try{
   status('Vérification du fichier…');const file=$('evidenceFile').files[0];const meta=await inspectDocument(file);
   const received=$('receivedOn').value;if(received>new Date().toISOString().slice(0,10))throw new Error('La date de réception ne peut pas être dans le futur.');
   if(!active())return;
   const record=await table('offer_documents',{method:'POST',single:true,body:{id:crypto.randomUUID(),offer_id:offerId,buyer_user_id:buyer,file_name:file.name,mime_type:meta.mime,byte_size:meta.size,sha256:meta.sha256,provenance:$('documentProvenance').value.trim(),received_on:received}});
   if(!active())return;status('Transfert privé en cours…');
   await evidenceStorage(record.object_path,{file:new Blob([file],{type:meta.mime})});
   // Database validates the actual Storage object before confirming the upload.
   const saved=await table('offer_documents',{method:'PATCH',filters:`?id=eq.${record.id}`,body:{uploaded_at:new Date().toISOString()}});
   if(!saved?.length)throw new Error('Transfert effectué, confirmation absente. Actualisez les pièces.');
   if(!active())return;$('documentForm').reset();$('receivedOn').value=new Date().toISOString().slice(0,10);await refresh();status('Pièce déposée. Son contenu et son authenticité restent à vérifier.');
  }catch(error){if(active())status('Dépôt non confirmé : '+error.message);}finally{button.disabled=false;}
 });
 $('documentList').addEventListener('click',async e=>{
  const finalize=e.target.closest('.finalize-document');if(finalize){finalize.disabled=true;try{const rows=await table('offer_documents',{method:'PATCH',filters:`?id=eq.${finalize.dataset.id}`,body:{uploaded_at:new Date().toISOString()}});if(!rows?.length)throw new Error('Aucune confirmation enregistrée.');await refresh();status('Transfert confirmé.');}catch(error){status(error.message);}finally{finalize.disabled=false;}return;}
  const button=e.target.closest('.download-document');if(!button)return;
  const doc=documents.find(d=>d.id===button.dataset.id);if(!doc)return;
  const buyer=currentUser()?.id;button.disabled=true;
  try{const blob=await evidenceStorage(doc.object_path);await verifyDocument(blob,doc);if(currentUser()?.id!==buyer||offer?.id!==doc.offer_id)return;
   const url=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'}));const link=document.createElement('a');link.href=url;link.download=doc.file_name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Fichier contrôlé ; téléchargement demandé au navigateur.');
  }catch(error){status(error.message);}finally{button.disabled=false;}
 });
 $('reviewForm').addEventListener('submit',async e=>{
  e.preventDefault();const buyer=currentUser()?.id;const offerId=offer?.id;if(!buyer||!offerId)return;
  const button=$('saveDocumentReview');button.disabled=true;
  try{await table('offer_document_reviews',{method:'POST',body:{document_id:$('reviewDocument').value,buyer_user_id:buyer,criterion:$('reviewCriterion').value,finding:$('reviewFinding').value,conclusion:$('reviewConclusion').value.trim()}});
   if(currentUser()?.id!==buyer||offer?.id!==offerId)return;$('reviewConclusion').value='';await refresh();status('Revue datée enregistrée. Elle ne certifie pas le fournisseur et ne déclenche aucun achat.');
  }catch(error){status(error.message);}finally{button.disabled=false;}
 });
 document.addEventListener('broker-session-change',reset);
 return {open,reset};
}
