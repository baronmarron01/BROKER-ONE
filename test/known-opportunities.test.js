import test from 'node:test';
import assert from 'node:assert/strict';
import {knownOpportunities} from '../public/known-opportunities.js';
const now=new Date('2026-11-08T12:00:00Z');
const r={direction:'sell',description:'Je vends une machine laser pour épilation',search_scope:'worldwide',location:'Montréal'};
test('reviewed notices are available for matching worldwide and US sale searches',()=>{
 assert.equal(knownOpportunities(r,now).length,2);
 assert.equal(knownOpportunities({...r,search_scope:'custom',target_region:'Canada ; États-Unis'},now).length,2);
});
test('notices never leak into unrelated products, buyer searches or Montreal-only searches',()=>{
 assert.equal(knownOpportunities({...r,direction:'buy'},now).length,0);
 assert.equal(knownOpportunities({...r,description:'Je vends du café'},now).length,0);
 assert.equal(knownOpportunities({...r,search_scope:'local'},now).length,0);
 assert.equal(knownOpportunities({...r,search_scope:'custom',target_region:'France'},now).length,0);
});
test('expired references automatically disappear without requiring deployment',()=>{
 assert.equal(knownOpportunities(r,new Date('2026-11-13T12:00:00Z')).length,1);
 assert.equal(knownOpportunities(r,new Date('2026-12-11T12:00:00Z')).length,0);
});
