import {mountDossiers} from './dossiers.js';
import { currentUser, getSession, refreshSession, rpc, signIn, signOut, signUp, table } from './db.js';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const labels={regulatory:'Réglementaire',physical:'Physique',financial:'Financier',reversibility:'Réversibilité',low:'Faible',medium:'Modéré',high:'Élevé',before_provider_contact:'Avant contact fournisseur',before_contract:'Avant contrat',before_payment:'Avant paiement',compliance_review:'Contrôle de conformité'};
const money = (minor, currency = 'CAD') => new Intl.NumberFormat('fr-CA',{style:'currency',currency}).format(Number(minor || 0) / 100);
let currentRequest;
let lastResearch=null;
let currentRequestId;
let directory = [];
let authMode = 'signin';

function requestFromForm() {
  return {
    description: $('description').value.trim(), category: $('category').value, location: $('location').value.trim(),
    min_budget: Number($('minBudget').value), max_budget: Number($('maxBudget').value), currency: $('currency').value,
    requires_physical_presence: $('physical').checked, requires_inspection: $('inspection').checked,
    requires_installation: $('installation').checked, requires_licensed_professional: $('licensed').checked
  };
}

async function api(path, body) {
  const response = await fetch(path, { method:body ? 'POST':'GET', headers:body ? {'Content-Type':'application/json'}:{}, body:body ? JSON.stringify(body):undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error?.message || `Erreur ${response.status}`); error.code = data.error?.code; throw error; }
  return data;
}

async function health() {
  try { const data = await api('/api/health'); $('healthDot').className='ok'; $('healthText').textContent=data.ai_configured?'API active · IA configurée':'API active · IA optionnelle inactive'; }
  catch { $('healthDot').className='fail'; $('healthText').textContent='API indisponible'; }
}

function jwtPayload() {
  try { return JSON.parse(atob(getSession().access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch { return {}; }
}

async function audit(action, entityType, entityId, metadata = {}) {
  const user = currentUser(); if (!user) return;
  try { await table('audit_events',{method:'POST',body:{actor_user_id:user.id,action,entity_type:entityType,entity_id:entityId,metadata}}); } catch (error) { console.warn('Audit non enregistré', error); }
}

async function updateSessionUI() {
  document.dispatchEvent(new Event('broker-session-change'));
  const user = currentUser();
  $('accountBtn').hidden=!!user; $('logoutBtn').hidden=!user;
  $('sessionBadge').textContent=user ? user.email : 'Mode visiteur';
  $('sessionBadge').className=user ? 'badge':'badge muted';
  $('adminTab').hidden=jwtPayload()?.app_metadata?.role !== 'admin';
  if (user) await Promise.allSettled([loadHistory(),loadQuotes(),loadProviderWorkspace()]);
  else { $('adminView').hidden=true; $('verificationQueue').replaceChildren(); $('adminStats').replaceChildren(); $('providerInbox').replaceChildren(); $('providerForm').reset(); $('historyContent').textContent='Connectez-vous pour enregistrer et retrouver vos demandes.'; $('quotesContent').textContent='Connectez-vous pour gérer vos devis.'; }
}

function openAuth() { $('authDialog').showModal(); }
function setAuthMode(mode) {
  authMode=mode; const signup=mode==='signup'; $('signupFields').hidden=!signup;
  $('authTitle').textContent=signup?'Créer un compte':'Connexion'; $('authSubmit').firstChild.textContent=signup?'Créer le compte ':'Se connecter ';
  $('authToggle').textContent=signup?'J’ai déjà un compte':'Créer un compte'; $('authMessage').textContent='';
}

$('accountBtn').addEventListener('click',openAuth);
$('authClose').addEventListener('click',()=> $('authDialog').close());
$('authToggle').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin'));
$('logoutBtn').addEventListener('click',async()=>{ await signOut(); currentRequestId=null; await updateSessionUI(); });
$('authForm').addEventListener('submit',async event=>{
  event.preventDefault(); const button=$('authSubmit'); button.disabled=true; $('authMessage').textContent='Traitement…';
  try {
    if(authMode==='signup') {
      const result=await signUp({email:$('authEmail').value,password:$('authPassword').value,displayName:$('displayName').value,companyName:$('companyName').value,accountType:$('accountType').value});
      if(!result.access_token){ setAuthMode('signin'); $('authMessage').textContent='Compte créé. Vérifiez votre courriel puis connectez-vous.'; return; }
    } else await signIn($('authEmail').value,$('authPassword').value);
    $('authDialog').close(); await updateSessionUI();
  } catch(error){ $('authMessage').textContent=error.message; }
  finally{ button.disabled=false; }
});

$('requestForm').addEventListener('submit', async event => {
  event.preventDefault(); const button=event.submitter || $('requestForm').querySelector('button[type=submit]'); if(button) button.disabled=true; currentRequestId=null; $('matchesPanel').hidden=true;
  try {
    currentRequest=requestFromForm(); const data=await api('/api/classify',currentRequest);
    $('emptyState').hidden=true; $('classification').hidden=false;
    $('classValue').textContent=`Classe ${data.classification.pipeline_class}`; $('modeValue').textContent=data.classification.processing_mode.replaceAll('_',' '); $('traceBadge').textContent=`Trace ${data.trace_id.slice(0,8)}`;
    $('riskGrid').innerHTML=Object.entries(data.classification.risk_axes).map(([key,value])=>`<div class="risk"><span>${escapeHtml(labels[key] || key)}</span><b class="${escapeHtml(value)}">${escapeHtml(labels[value] || value)}</b></div>`).join('');
    $('gates').innerHTML=(data.classification.approval_gates.length?data.classification.approval_gates:['aucune approbation additionnelle']).map(value=>`<span class="chip">${escapeHtml(labels[value] || value.replaceAll('_',' '))}</span>`).join('');
    if(currentUser()) {
      const saved=await table('requests',{method:'POST',single:true,body:{buyer_user_id:currentUser().id,title:currentRequest.description.slice(0,90),description:currentRequest.description,category:currentRequest.category,location:currentRequest.location,min_budget_minor:Math.round(currentRequest.min_budget*100),max_budget_minor:Math.round(currentRequest.max_budget*100),currency:currentRequest.currency,constraints:{physical:currentRequest.requires_physical_presence,inspection:currentRequest.requires_inspection,installation:currentRequest.requires_installation,licensed:currentRequest.requires_licensed_professional},risk_axes:data.classification.risk_axes,approval_gates:data.classification.approval_gates,pipeline_class:data.classification.pipeline_class,processing_mode:data.classification.processing_mode,status:'classified'}});
      currentRequestId=saved?.id; await audit('request.classified','request',currentRequestId,{trace_id:data.trace_id}); await loadHistory();
    }
  } catch(error){ alert(error.message); } finally{ if(button) button.disabled=false; }
});

$('matchBtn').addEventListener('click',async()=>{
  const button=$('matchBtn'); button.disabled=true; button.firstChild.textContent='Recherche en cours… ';
  try {
    const searchData=await api('/api/search',{request:currentRequest,limit:20,include_external:false});
    const candidates=searchData.candidates;
    if(!candidates.length){$('matchesPanel').hidden=false;$('searchBadge').textContent='Aucun fournisseur qualifié';$('matches').textContent='Aucun fournisseur qualifié dans le registre pour ce besoin. Utilisez la recherche web ci-dessous pour identifier des entreprises à qualifier.';$('matchesPanel').scrollIntoView({behavior:'smooth'});return;}
    const data=await api('/api/match',{request:currentRequest,candidates}); $('matchesPanel').hidden=false;
    $('searchBadge').textContent=`${searchData.search.result_count} résultat(s) · ${searchData.search.internal_count} interne(s) · ${searchData.search.external_count} externe(s) · ${searchData.search.duration_ms} ms${searchData.search.fallback?' · rappel élargi':''}`;
    $('matches').innerHTML=data.matches.map(item=>{const source=candidates.find(x=>x.provider_id===item.provider_id);const evidence=source?.provenance;const external=Boolean(source?.external);return `<article class="match"><div class="rank">${String(item.rank).padStart(2,'0')}</div><div><h3>${escapeHtml(item.name)}${item.eligible?'':' · EXCLU'}</h3><p>${escapeHtml(item.explanation)} ${item.confidence == null ? 'Confiance non établie : historique insuffisant.' : `Confiance indicative : ${Math.round(item.confidence*100)}%.`}</p><div class="evidence"><span>${external?'Candidat externe non vérifié':'Fournisseur vérifié'}</span><span>${Number(evidence?.source_count||0)} source(s)</span><span>Licence: ${escapeHtml(evidence?.licence||'interne')}</span><span>Vérification: ${evidence?.latest_checked_at?new Date(evidence.latest_checked_at).toLocaleDateString('fr-CA'):'non datée'}</span></div>${external?'<span class="badge muted">Validation requise avant contact</span>':currentUser()&&currentRequestId&&item.eligible?`<button class="mini quote-action" data-provider="${escapeHtml(item.provider_id)}">Demander un devis</button>`:''}</div><div class="score"><strong>${Math.round(item.score*100)}</strong><span>SCORE / 100</span></div></article>`}).join('');
    if(currentUser()&&currentRequestId) {
      const run=await table('search_runs',{method:'POST',single:true,body:{buyer_user_id:currentUser().id,request_id:currentRequestId,query_text:searchData.search.query||currentRequest.description,filters:{category:currentRequest.category,location:currentRequest.location,min_budget:currentRequest.min_budget,max_budget:currentRequest.max_budget},connector:searchData.search.connector,result_count:candidates.length,duration_ms:searchData.search.duration_ms}});
      for(const [index,candidate] of candidates.entries()) {
        if(candidate.external) {
          const [,sourceId] = candidate.provider_id.split(':');
          await table('external_search_results',{method:'POST',body:{search_run_id:run.id,buyer_user_id:currentUser().id,external_key:candidate.provider_id,source_id:sourceId,display_name:candidate.name,position:index+1,score:candidate.semantic_score,verification_status:'unverified_candidate',provenance_snapshot:candidate.provenance||{}}}).catch(error=>{ $('searchBadge').textContent='Résultats affichés — historique partiellement enregistré'; console.warn('Échec de sauvegarde',error.message); });
        } else await table('search_results',{method:'POST',body:{search_run_id:run.id,buyer_user_id:currentUser().id,provider_id:candidate.provider_id,position:index+1,lexical_score:candidate.lexical_score,filter_score:(candidate.location_score+candidate.constraint_score)/2,provenance_snapshot:candidate.provenance||{}}}).catch(error=>{ $('searchBadge').textContent='Résultats affichés — historique partiellement enregistré'; console.warn('Échec de sauvegarde',error.message); });
      }
      for(const item of data.matches) if(!String(item.provider_id).startsWith('external:')) await table('matches',{method:'POST',body:{request_id:currentRequestId,provider_id:item.provider_id,rank:item.rank,score:item.score,confidence:item.confidence ?? 0,eligible:item.eligible,explanation:item.explanation,score_breakdown:item.subscores || {}}}).catch(error=>{ $('searchBadge').textContent='Résultats affichés — historique partiellement enregistré'; console.warn('Échec de sauvegarde',error.message); });
      await audit('search.completed','search_run',run.id,{connector:searchData.search.connector,count:candidates.length,fallback:searchData.search.fallback});
      await audit('matching.completed','request',currentRequestId,{count:data.matches.length,search_run_id:run.id});
    }
    $('matchesPanel').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error){ alert(error.message); }
  finally { button.disabled=false; button.firstChild.textContent='Rechercher et classer les fournisseurs '; }
});

$('matches').addEventListener('click',async event=>{
  const button=event.target.closest('.quote-action'); if(!button)return; button.disabled=true;
  try { const recipients=await table('providers',{select:'id,owner_user_id,verification_status,active',filters:`&id=eq.${button.dataset.provider}`,limit:1}); if(!recipients[0]?.owner_user_id || recipients[0].verification_status!=='verified' || !recipients[0].active)throw new Error('Ce fournisseur ne dispose pas d’un compte destinataire qualifié. Préparez un brouillon de devis.'); const rows=await table('quote_requests',{method:'POST',body:{request_id:currentRequestId,provider_id:button.dataset.provider,buyer_user_id:currentUser().id,message:'Merci de soumettre un devis détaillé pour cette demande.'}}); const quoteRequest=rows?.[0]; await audit('quote.requested','quote_request',quoteRequest?.id,{provider_id:button.dataset.provider}); button.textContent='Demande enregistrée dans le portail'; await loadQuotes(); }
  catch(error){ alert(error.message.includes('duplicate')?'Un devis a déjà été demandé à ce fournisseur.':error.message); button.disabled=false; }
});

$('clarifyBtn').addEventListener('click',async()=>{ $('aiDialog').showModal(); $('aiOutput').textContent='Analyse de la demande…'; try{const data=await api('/api/ai',{task:'clarify_request',input:$('description').value,locale:'fr'});$('aiOutput').textContent=data.content||'Aucune question générée.';}catch(error){$('aiOutput').textContent=error.message+(error.code==='AI_NOT_CONFIGURED'?'\n\nOPENAI_API_KEY doit être configurée côté serveur.':'');} });

async function loadDirectory(){
  try { directory=await table('providers',{select:'id,business_name,description,categories,service_zones,website,verification_status,reliability_score',filters:'&active=eq.true&owner_user_id=not.is.null',order:'reliability_score.desc'}); $('providerDirectory').innerHTML=directory.map(p=>`<article class="directory-card"><div><span class="badge">${escapeHtml(p.verification_status)}</span><h3>${escapeHtml(p.business_name)}</h3></div><p>${escapeHtml(p.description)}</p><div class="chips">${(p.categories||[]).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join('')}</div><small>Fiabilité ${Math.round(p.reliability_score*100)}% · ${(p.service_zones||[]).map(escapeHtml).join(', ')}</small></article>`).join('')||'<p class="list-empty">Aucun fournisseur vérifié.</p>'; }
  catch(error){ $('providerDirectory').textContent=error.message; }
}

async function loadHistory(){
  if(!currentUser())return; const [requests,auditRows,drafts]=await Promise.all([table('requests',{order:'created_at.desc',limit:30}),table('audit_events',{order:'created_at.desc',limit:30}),table('inquiry_drafts',{order:'created_at.desc',limit:30})]);
  $('historyContent').innerHTML=`<div class="data-list"><h3>Demandes</h3>${drafts.map(d=>`<article><b>Brouillon de demande — aucun envoi</b><details><summary>Lire le texte</summary><pre>${escapeHtml(d.body)}</pre></details><span>${new Date(d.created_at).toLocaleString('fr-CA')}</span></article>`).join('')}${requests.map(r=>`<article><b>${escapeHtml(r.title||r.description)}</b><span>Classe ${escapeHtml(r.pipeline_class||'—')} · ${escapeHtml(r.status)} · ${new Date(r.created_at).toLocaleString('fr-CA')}</span></article>`).join('')||'<p>Aucune demande enregistrée.</p>'}</div><div class="data-list"><h3>Journal d’audit</h3>${auditRows.map(a=>`<article><b>${escapeHtml(a.action)}</b><span>${escapeHtml(a.entity_type)} · ${new Date(a.created_at).toLocaleString('fr-CA')}</span></article>`).join('')||'<p>Aucun événement.</p>'}</div>`;
}
$('refreshHistory').addEventListener('click',loadHistory);

async function loadQuotes(){
  if(!currentUser())return; const rows=await table('quote_requests',{select:'id,status,message,created_at,provider_id,request_id,providers(business_name),requests(title),quotes(id,amount_minor,currency,status,terms,valid_until)',order:'created_at.desc'});
  $('quotesContent').innerHTML=`<div class="data-list">${rows.map(q=>`<article><b>${escapeHtml(q.providers?.business_name||'Fournisseur')} — ${escapeHtml(q.requests?.title||'Demande')}</b><span>Statut: ${escapeHtml(q.status)} · ${q.quotes?.[0]?money(q.quotes[0].amount_minor,q.quotes[0].currency):'En attente du devis'}</span>${(q.quotes || []).map(offer=>`<p>Offre : ${escapeHtml(offer.status)} · Validité : ${escapeHtml(offer.valid_until || 'non précisée')}</p><p>${escapeHtml(offer.terms || 'Conditions non précisées')}</p>`).join('')}</article>`).join('')||'<p>Aucune demande de devis.</p>'}</div>`;
}

async function loadProviderWorkspace(){
  if(!currentUser())return; const owned=await table('providers',{filters:`&owner_user_id=eq.${currentUser().id}`,limit:1}); const provider=owned[0];
  if(provider){ $('providerName').value=provider.business_name; $('providerWebsite').value=provider.website||''; $('providerDescription').value=provider.description; $('providerCategories').value=(provider.categories||[]).join(', '); $('providerZones').value=(provider.service_zones||[]).join(', '); const inbox=await table('quote_requests',{select:'id,status,message,created_at,requests(title,description),quotes(id,amount_minor,currency,status)',filters:`&provider_id=eq.${provider.id}`,order:'created_at.desc'}); $('providerInbox').innerHTML=`<h3>Demandes reçues</h3>${inbox.map(q=>`<article class="inbox-item"><div><b>${escapeHtml(q.requests?.title||'Demande')}</b><p>${escapeHtml(q.requests?.description||'')}</p></div>${q.quotes?.length?`<span class="badge">${money(q.quotes[0].amount_minor,q.quotes[0].currency)}</span>`:`<button class="mini respond-quote" data-id="${q.id}" data-provider="${provider.id}">Répondre</button>`}</article>`).join('')||'<p class="list-empty">Aucune demande reçue.</p>'}`; }
  else $('providerInbox').innerHTML='<p class="list-empty">Créez votre profil fournisseur pour recevoir des demandes. Une validation administrative sera requise.</p>';
}

$('providerForm').addEventListener('submit',async event=>{ event.preventDefault(); if(!currentUser()){openAuth();return;} const body={owner_user_id:currentUser().id,business_name:$('providerName').value.trim(),website:$('providerWebsite').value||null,description:$('providerDescription').value.trim(),categories:$('providerCategories').value.split(',').map(x=>x.trim()).filter(Boolean),service_zones:$('providerZones').value.split(',').map(x=>x.trim()).filter(Boolean)}; const owned=await table('providers',{filters:`&owner_user_id=eq.${currentUser().id}`,limit:1}); const result=owned[0]?await table('providers',{method:'PATCH',filters:`?id=eq.${owned[0].id}`,body}):await table('providers',{method:'POST',body}); const id=result?.[0]?.id||owned[0]?.id; await audit(owned[0]?'provider.updated':'provider.created','provider',id); alert('Profil fournisseur enregistré.'); await loadProviderWorkspace(); });

$('providerInbox').addEventListener('click',async event=>{ const button=event.target.closest('.respond-quote');if(!button)return;const amount=prompt('Montant du devis en CAD (ex. 12500)');if(!amount)return;if(!Number.isFinite(Number(amount)) || Number(amount)<=0){alert('Saisissez un montant positif.');return;}const terms=prompt('Conditions principales du devis')||'';try{const q=await table('quotes',{method:'POST',body:{quote_request_id:button.dataset.id,provider_id:button.dataset.provider,amount_minor:Math.round(Number(amount)*100),currency:'CAD',terms,status:'submitted'}});await audit('quote.submitted','quote',q?.[0]?.id,{quote_request_id:button.dataset.id});await loadProviderWorkspace();}catch(error){alert(error.message);} });

function splitList(value){ return value.split(',').map(item=>item.trim()).filter(Boolean); }

async function loadAdmin(){
  if(jwtPayload()?.app_metadata?.role!=='admin')return;
  $('verificationQueue').innerHTML='<p class="list-empty">Chargement de la file sécurisée…</p>';
  try {
    const names=['profiles','providers','requests','quote_requests','quotes','messages','audit_events'];
    const [values,externalResults,cases]=await Promise.all([
      Promise.all(names.map(name=>table(name,{select:'*',limit:1000}))),
      table('external_search_results',{select:'id,display_name,source_id,score,verification_status,provenance_snapshot,created_at',order:'created_at.desc',limit:50}),
      table('external_verification_cases',{select:'id,external_result_id,status,decision_reason,promoted_provider_id,decided_at',order:'updated_at.desc',limit:100})
    ]);
    $('adminStats').innerHTML=names.map((name,index)=>`<article><strong>${values[index].length}</strong><span>${escapeHtml(name)}</span></article>`).join('');
    const caseByResult=new Map(cases.map(item=>[item.external_result_id,item]));
    $('verificationQueue').innerHTML=externalResults.map(candidate=>{
      const verification=caseByResult.get(candidate.id); const status=verification?.status||candidate.verification_status; const locked=status==='approved'; const sources=candidate.provenance_snapshot?.sources||[];
      return `<article class="verification-card" data-id="${candidate.id}"><div class="verification-summary"><div><span class="badge ${status==='rejected'?'danger':''}">${escapeHtml(status)}</span><h4>${escapeHtml(candidate.display_name)}</h4><p>${escapeHtml(candidate.source_id.toUpperCase())} · Score ${Math.round(Number(candidate.score)*100)}% · ${sources.length} preuve(s)</p></div><span>${new Date(candidate.created_at).toLocaleString('fr-CA')}</span></div><div class="verification-fields"><label>Nom vérifié<input class="review-name" value="${escapeHtml(candidate.display_name)}" maxlength="160" ${locked?'disabled':''}></label><label>Site officiel<input class="review-website" type="url" placeholder="https://" ${locked?'disabled':''}></label><label>Catégories<input class="review-categories" value="industrial" ${locked?'disabled':''}></label><label>Zones desservies<input class="review-zones" value="Québec" ${locked?'disabled':''}></label></div><label>Motif documenté<textarea class="review-reason" minlength="10" maxlength="2000" placeholder="Décrivez les vérifications effectuées et la justification de la décision." ${locked?'disabled':''}>${escapeHtml(verification?.decision_reason||'')}</textarea></label><div class="evidence">${sources.map(source=>`<span>${escapeHtml(source.label||source.source_id||'source')} · ${escapeHtml(source.evidence?.matched_query||'preuve enregistrée')}</span>`).join('')||'<span>Preuve enregistrée dans le snapshot immuable</span>'}</div>${locked?`<p class="notice">Préqualifié · contrôle commercial requis · fiche ${escapeHtml(verification.promoted_provider_id||'créé')}</p>`:`<div class="verification-actions"><button class="mini review-action" data-decision="approved">Préqualifier (validation restante)</button><button class="mini danger review-action" data-decision="rejected">Rejeter</button></div>`}</article>`;
    }).join('')||'<p class="list-empty">Aucun candidat externe enregistré. Effectuez une recherche connectée pour alimenter la file.</p>';
  } catch(error){ $('verificationQueue').innerHTML=`<p class="list-empty">${escapeHtml(error.message)}</p>`; }
}

$('refreshAdmin').addEventListener('click',loadAdmin);
$('verificationQueue').addEventListener('click',async event=>{
  const button=event.target.closest('.review-action'); if(!button)return;
  const card=button.closest('.verification-card'); const reason=card.querySelector('.review-reason').value.trim();
  if(reason.length<10){ alert('Ajoutez un motif de vérification d’au moins 10 caractères.'); return; }
  button.disabled=true;
  try {
    await rpc('review_external_candidate',{candidate_result_id:card.dataset.id,decision:button.dataset.decision,reason,reviewed_business_name:card.querySelector('.review-name').value.trim(),reviewed_categories:splitList(card.querySelector('.review-categories').value),reviewed_service_zones:splitList(card.querySelector('.review-zones').value),reviewed_website:card.querySelector('.review-website').value.trim()||null});
    await Promise.all([loadAdmin(),loadDirectory()]);
  } catch(error){ alert(error.message); button.disabled=false; }
});

document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab)); document.querySelectorAll('.workspace-view').forEach(x=>x.hidden=x.id!==`${tab.dataset.view}View`); if(tab.dataset.view==='providers')loadDirectory(); if(tab.dataset.view==='admin')loadAdmin(); }));

await refreshSession();
await Promise.all([health(),loadDirectory(),updateSessionUI()]);

// A changed need invalidates its previous classification and supplier ranking.
function invalidateRequest() {
  currentRequest=null; currentRequestId=null;
  $('classification').hidden=true; $('emptyState').hidden=false; $('matchesPanel').hidden=true;
}
$('requestForm').addEventListener('input',invalidateRequest);
$('applyClarifications').addEventListener('click',()=>{
  const answers=$('clarificationAnswers').value.trim();
  if(!answers){$('clarificationStatus').textContent='Ajoutez vos réponses avant de continuer.';return;}
  const description=$('description').value.trim()+'\n\nPrécisions fournies :\n'+answers;
  if(description.length>4000){$('clarificationStatus').textContent='La demande complète doit rester sous 4 000 caractères. Raccourcissez vos réponses.';return;}
  $('description').value=description; $('clarificationAnswers').value='';
  invalidateRequest(); $('aiDialog').close(); $('description').focus();
  $('emptyState').textContent='Précisions intégrées. Cliquez sur Analyser et classer pour actualiser la décision.';
});
$('discoverBtn').addEventListener('click',async()=>{
  const button=$('discoverBtn');button.disabled=true;
  lastResearch=null; $('discoveryOutput').textContent='Recherche de sites d’entreprises…';
  try {
    const request=requestFromForm();
    if(request.description.length<10)throw new Error('Décrivez votre besoin en au moins 10 caractères.');
    const data=await api('/api/ai',{task:'discover_suppliers',input:JSON.stringify(request),locale:'fr'});
    lastResearch={request_key:JSON.stringify(request),content:data.content,citations:data.citations.map(c=>({...c,checked_at:data.checked_at})),checked_at:data.checked_at};
    const result=document.createElement('p');
    let offset=0;
    for(const citation of (data.annotations || []).sort((a,b)=>a.start_index-b.start_index)){
      if(citation.start_index<offset || citation.end_index>data.content.length)continue;
      result.append(document.createTextNode(data.content.slice(offset,citation.start_index)));
      const a=document.createElement('a');a.href=citation.url;a.textContent='[Source : '+(citation.title || new URL(citation.url).hostname)+']';a.target='_blank';a.rel='noopener noreferrer';result.append(a);offset=citation.end_index;
    }
    result.append(document.createTextNode(data.content.slice(offset)));
    $('discoveryOutput').replaceChildren(result);
    const label=document.createElement('p');label.textContent='Sources consultées — '+new Date(data.checked_at).toLocaleString('fr-CA');$('discoveryOutput').append(label);
    for(const citation of data.citations){const p=document.createElement('p');const a=document.createElement('a');a.href=citation.url;a.textContent=citation.title;a.target='_blank';a.rel='noopener noreferrer';p.append(a);$('discoveryOutput').append(p);}
  } catch(error){$('discoveryOutput').textContent=error.message;}
  finally{button.disabled=false;}
});
$('draftInquiryBtn').addEventListener('click',()=>{
  const r=requestFromForm();
  $('inquiryDraft').value=`Objet : Demande de devis — ${r.description.slice(0,80)}\n\nBonjour,\n\nVoici notre besoin :\n${r.description}\n\nLieu : ${r.location || 'à préciser'}\nBudget indicatif : ${r.min_budget} à ${r.max_budget} ${r.currency} (à confirmer).\n\nMerci de confirmer :\n- votre capacité à répondre et les caractéristiques proposées ;\n- le prix détaillé, les taxes, le transport et l’installation ;\n- la disponibilité et le délai ;\n- les garanties, conditions de paiement et durée de validité ;\n- les preuves des certifications requises, le cas échéant.\n\nCoordonnées du demandeur : [à compléter]\n\nCette demande ne constitue pas une commande ni un engagement.\n`;
  $('inquiryDraft').focus();
});
$('downloadInquiryBtn').addEventListener('click',()=>{
  if(!$('inquiryDraft').value.trim()){alert('Préparez le texte du devis avant de le télécharger.');return;}
  const url=URL.createObjectURL(new Blob([$('inquiryDraft').value],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='broker-one-demande-devis-brouillon.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

$('saveInquiryBtn').addEventListener('click',async()=>{
  if(!currentUser()){openAuth();return;}
  const body=$('inquiryDraft').value.trim();if(!body){$('inquiryStatus').textContent='Préparez un brouillon avant de l’enregistrer.';return;}
  $('saveInquiryBtn').disabled=true;
  try{await table('inquiry_drafts',{method:'POST',body:{buyer_user_id:currentUser().id,body}});$('inquiryStatus').textContent='Brouillon enregistré dans votre historique. Aucun envoi effectué.';await loadHistory();}
  catch(error){$('inquiryStatus').textContent='Enregistrement impossible : '+error.message;}
  finally{$('saveInquiryBtn').disabled=false;}
});

const loadDossiers=mountDossiers(requestFromForm,()=>lastResearch);
await loadDossiers();
