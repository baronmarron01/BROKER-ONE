import test from 'node:test';
import assert from 'node:assert/strict';
import {buyingSignal} from '../lib/buying-intent.js';
import {parseDiscovery} from '../lib/discovery.js';
const now=new Date('2026-11-08T12:00:00Z');
const url='https://buyer.example/notices/123';
const sources=new Set([url]);
const evidence={type:'rfq',status:'open',product_match:true,geography_match:true,url,excerpt:'Seeking quotations for diode laser hair removal equipment.',published_at:'2026-11-01',deadline:'2026-12-01'};
test('dated explicit demand remains an unverified extracted signal, never ready to pay',()=>{
 const x=buyingSignal(evidence,sources,now);assert.equal(x.status,'open_declared');assert.equal(x.verification,'model_extracted_not_independently_verified');assert.equal(x.ready_to_buy,undefined);
});
test('reject missing evidence, unknown or expired dates, wrong product/geography and unconsulted URL',()=>{
 for(const changes of [{type:'clinic_service'},{status:'closed'},{product_match:false},{geography_match:false},{published_at:null},{published_at:'2026-02-31'},{published_at:'2027-01-01'},{deadline:'2026-11-08'},{deadline:'2026-10-01'},{published_at:'2026-01-01',deadline:null},{url:'https://buyer.example/'},{excerpt:''}])assert.equal(buyingSignal({...evidence,...changes},sources,now),null,JSON.stringify(changes));
});
test('strict mode cannot promote a generic clinic; permits multiple buyers on one tender portal',()=>{
 const data={output:[{type:'web_search_call',action:{sources:[{url},{url:'https://buyer.example/notices/456'}]}},{content:[{type:'output_text',text:JSON.stringify({businesses:[{name:'A',url,reason:'Explicit demand',evidence},{name:'B',url:'https://buyer.example/notices/456',reason:'Another buyer',evidence:{...evidence,url:'https://buyer.example/notices/456'}},{name:'Clinic',url,reason:'Uses lasers'}]})}]}]};
 const r=parseDiscovery(data,[],{intentMode:'active_demand',now});assert.equal(r.entries.length,2);assert.equal(r.rejected_count,1);
});
