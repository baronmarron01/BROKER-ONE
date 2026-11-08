import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlan,planInstructions} from '../lib/search-plan.js';
import {parseDiscovery} from '../lib/discovery.js';
test('worldwide is independent from user location',()=>{const p=searchPlan({description:'Je vends des machines épilation laser',location:'Montréal'});assert.equal(p.scope,'worldwide');assert.equal(p.target,'Monde entier');assert.equal(p.sector,'beauty');});
test('different products select different source families, unknown products fall back',()=>{
 for(const [description,sector] of [['logiciel de comptabilité','it'],['café grains agricoles','agriculture'],['pièces usinage industriel','industrial'],['matériaux construction','construction'],['conseil professionnel','services'],['objets xyz','general']])assert.equal(searchPlan({description}).sector,sector);
 assert.equal(searchPlan({description:'logiciel'},'buy').suggested_domains.length,0);
});
test('selected geography is bounded and required',()=>{
 assert.equal(searchPlan({search_scope:'custom',target_region:'France ; Belgique'}).target,'France ; Belgique');
 assert.equal(searchPlan({search_scope:'local',location:'Lyon'}).target,'Lyon');
 assert.throws(()=>searchPlan({search_scope:'custom'}));assert.throws(()=>searchPlan({search_scope:'bad'}));
 assert.match(planInstructions(searchPlan({})),/NOT a restriction/);
});
test('restricted searches reject results lacking matching geographic evidence',()=>{
 const data={output:[{type:'web_search_call',action:{sources:[{url:'https://example.com'}]}},{content:[{type:'output_text',text:JSON.stringify({businesses:[{name:'X',reason:'Supplier',url:'https://example.com',geography_match:false,location:'Tokyo'}]})}]}]};
 assert.equal(parseDiscovery(data,[],{scope:'custom'}).entries.length,0);
 assert.equal(parseDiscovery(data,[],{scope:'worldwide'}).entries.length,1);
});
