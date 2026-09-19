import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai.js';

function response(){return {statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};}
test('web discovery requires a cited result and requests actual web search',async()=>{
  const originalFetch=globalThis.fetch, key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test-only';
  try {
    let payload;
    globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Entreprise [1]',annotations:[{type:'url_citation',url:'https://example.com',title:'Entreprise',start_index:11,end_index:14}]}]}]})};};
    const res=response();await handler({method:'POST',headers:{},body:{task:'discover_suppliers',input:'Machines emballage Montreal'}},res);
    assert.equal(res.statusCode,200);assert.equal(payload.tools[0].type,'web_search');assert.equal(payload.tool_choice,'required');assert.equal(res.data.citations.length,1);assert.equal(res.data.annotations[0].start_index,11);
    globalThis.fetch=async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Unsourced business',annotations:[]}]}]})});
    const noSource=response();await handler({method:'POST',headers:{},body:{task:'discover_suppliers',input:'Machines emballage Montreal'}},noSource);
    assert.equal(noSource.statusCode,502);assert.equal(noSource.data.error.code,'NO_SOURCED_RESULTS');
  }finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
