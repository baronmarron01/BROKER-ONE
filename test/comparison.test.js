import test from 'node:test';
import assert from 'node:assert/strict';
import {amountMinor,summarizeOffer,compareOffers} from '../public/comparison.js';
const offer={supplier_name:'Entreprise',currency:'CAD',stage:'response_received',base_minor:10000,tax_minor:1500,shipping_minor:2000,installation_minor:0,valid_until:'2026-12-31'};
test('money uses decimal precision without floating point surprises',()=>{assert.equal(amountMinor('0.29'),29);assert.equal(amountMinor('12,50'),1250);assert.equal(amountMinor(''),null);assert.throws(()=>amountMinor('-1'));assert.throws(()=>amountMinor('2.999'));assert.throws(()=>amountMinor('Infinity'));});
test('unknown shipping prevents a complete total',()=>{const r=summarizeOffer({...offer,shipping_minor:null},'2026-09-22');assert.equal(r.total_minor,null);assert.equal(r.comparable,false);assert.equal(r.known_subtotal_minor,11500);});
test('explicit included costs are zero and can be compared',()=>{assert.equal(summarizeOffer(offer,'2026-09-22').total_minor,13500);assert.equal(summarizeOffer(offer,'2026-09-22').comparable,true);});
test('expired, undated or not received offers are not comparable',()=>{for(const patch of [{valid_until:'2026-01-01'},{valid_until:null},{stage:'candidate'},{stage:'excluded'}])assert.equal(summarizeOffer({...offer,...patch},'2026-09-22').comparable,false);});
test('currencies are never ranked as one interchangeable price',()=>{const r=compareOffers([{...offer,currency:'USD',base_minor:1},{...offer,currency:'CAD',base_minor:99999}],'2026-09-22');assert.deepEqual(r.map(x=>x.currency),['CAD','USD']);});
