import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai.js';
import {parseDiscovery} from '../lib/discovery.js';
import {resolveDirection,uniqueBusinesses,draftMessage} from '../public/direction.js';
import {compareOffers} from '../public/comparison.js';
function response(){return {statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};}
function result(cited=true){return {status:'completed',output:[{type:'web_search_call',action:{sources:cited?[{url:'https://clinic.example/services'}]:[]}},{content:[{type:'output_text',text:JSON.stringify({businesses:[{name:'Clinic',url:'https://clinic.example/services',reason:'Propose des traitements laser.'}]})}]}]};}
test('both commercial directions, ambiguity and explicit override',()=>{
 for(const description of ['JE VEND DES MACHINE DIODE LASER','Je vends des machines','Je propose des services','Je cherche des acheteurs'])assert.equal(resolveDirection({description}),'sell');
 for(const description of ["J’achète une machine".replace('’',"'"),'Je veux acheter une machine','Je cherche un prestataire'])assert.equal(resolveDirection({description}),'buy');
 assert.equal(resolveDirection({description:'machine laser'}),null);
 assert.equal(resolveDirection({description:'Je vends et je veux acheter une machine'}),null);
 assert.equal(resolveDirection({description:'Je vends une machine',direction:'buy'}),'buy');
 assert.match(draftMessage({direction:'sell',description:'machine laser',currency:'CAD'}),/Proposition commerciale/);
});
test('sources must actually have been consulted and duplicates are excluded',()=>{
 assert.equal(parseDiscovery(result()).entries.length,1);
 assert.equal(parseDiscovery(result(false)).entries.length,0);
 const variant=result();variant.output[1].content[0].text=JSON.stringify({businesses:[{name:'Clinic',url:'https://www.clinic.example/',reason:'Laser'}]});assert.equal(parseDiscovery(variant).entries[0].url,'https://clinic.example/services');
 assert.equal(parseDiscovery(result(),['https://clinic.example']).entries.length,0);
 assert.equal(uniqueBusinesses([{name:'A',url:'https://a.example/x'},{name:'B',url:'https://www.a.example/y'},{name:'C',url:'javascript:alert(1)'}]).length,1);
 assert.throws(()=>parseDiscovery({output:[]}),/DISCOVERY_FORMAT/);
});
test('web discovery honors both sides and rejects unknown direction before spending',async()=>{
 const originalFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='test-only';
 try{
  let payload,calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;payload=JSON.parse(options.body);return {ok:true,json:async()=>result()};};
  for(const direction of ['sell','buy']){
   const res=response();await handler({method:'POST',headers:{},body:{task:'discover_suppliers',intent_mode:'prospects',direction,input:'Machine laser à Montréal'}},res);
   assert.equal(res.statusCode,200);assert.equal(res.data.direction,direction);assert.equal(res.data.entries.length,1);
   assert.equal(payload.tool_choice,'required');assert.match(payload.instructions,direction==='sell'?/User SELLS/:/User BUYS/);
  }
  const unknown=response();await handler({method:'POST',headers:{},body:{task:'discover_suppliers',input:'Machine laser'}},unknown);
  assert.equal(unknown.statusCode,422);assert.equal(calls,2);
 }finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('seller compares received bids descending; buyer compares costs ascending',()=>{
 const offers=[100,200].map((n,i)=>({supplier_name:String(i),currency:'CAD',base_minor:n,tax_minor:0,shipping_minor:0,installation_minor:0,valid_until:'2099-01-01',stage:'response_received'}));
 assert.equal(compareOffers(offers,undefined,'buy')[0].base_minor,100);
 assert.equal(compareOffers(offers,undefined,'sell')[0].base_minor,200);
});
