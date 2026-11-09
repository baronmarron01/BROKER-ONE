import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSemanticPlan,semanticInstructions} from '../lib/orchestration.js';
import {knownOpportunities} from '../public/known-opportunities.js';
import {prepareProposal,proposalSnapshot,approvalCurrent} from '../public/proposal.js';
test('semantic family permits paraphrased reference matching without changing geography',()=>{
 const semantic_plan=validateSemanticPlan({direction:'sell',product_family:'hair_removal_equipment',product:'Professional hair removal device',use:'Permanent reduction of body hair',queries:['professional diode RFQ']});
 const r={direction:'sell',description:'Nous commercialisons des plateformes professionnelles de réduction durable de la pilosité.',search_scope:'worldwide',semantic_plan};
 assert.equal(knownOpportunities(r,new Date('2026-11-09')).length,2);
 assert.equal(knownOpportunities({...r,search_scope:'custom',target_region:'France'},new Date('2026-11-09')).length,0);
 assert.equal(knownOpportunities({...r,semantic_plan:{...semantic_plan,product_family:'other'}},new Date('2026-11-09')).length,0);
});
test('invalid model plans are rejected, context lengths and feedback bounded',()=>{
 assert.throws(()=>validateSemanticPlan({direction:'execute_purchase'}));
 const p=validateSemanticPlan({direction:'buy',product_family:'other',product:'x'.repeat(1000),queries:['q']});assert.equal(p.product.length,300);
 assert.match(semanticInstructions(p,{last_note:'x'.repeat(10000)}),/Never send/);
});
test('human review binds exact draft and cannot send or purchase',()=>{
 const p=prepareProposal({name:'Test',url:'https://example.com/request'},{direction:'sell',description:'Machine professionnelle'});
 const approved=proposalSnapshot(p);assert.equal(approvalCurrent(p,approved),true);
 for(const k of ['recipient','source','action','text'])assert.equal(approvalCurrent({...p,[k]:'changed'},approved),false);
 assert.equal(approvalCurrent(p,''),false);assert.equal(p.execute,undefined);assert.match(p.text,/ni engagement de paiement/);
});
