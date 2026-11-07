import {canonicalUrl,uniqueBusinesses} from '../public/direction.js';
export function parseDiscovery(data,excluded=[]) {
 const texts=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text');
 const text=texts.map(x=>x.text||'').join('\n').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('DISCOVERY_FORMAT');}
 const cited=[...texts.flatMap(x=>x.annotations||[]).filter(x=>x.type==='url_citation'),...(data.output||[]).filter(x=>x.type==='web_search_call').flatMap(x=>x.action?.sources||[])];
 const sources=new Set(cited.map(x=>canonicalUrl(x.url)).filter(Boolean));
 const excludedDomains=new Set(excluded.map(canonicalUrl).filter(Boolean).map(x=>new URL(x).hostname.replace(/^www\./,'')));
 const entries=uniqueBusinesses((Array.isArray(parsed.businesses)?parsed.businesses:[]).filter(x=>x&&typeof x.name==='string'&&typeof x.reason==='string'&&typeof x.url==='string').map(x=>({name:x.name.slice(0,160),reason:x.reason.slice(0,1200),url:canonicalUrl(x.url),intent_status:'unconfirmed'})).filter(x=>sources.has(x.url)&&!excludedDomains.has(new URL(x.url).hostname.replace(/^www\./,'')))).slice(0,5);
 return {entries,note:typeof parsed.note==='string'?parsed.note.slice(0,1000):'',citations:entries.map(x=>({url:x.url,title:x.name}))};
}
