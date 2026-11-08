import {buyingSignal} from './buying-intent.js';
import {canonicalUrl,uniqueBusinesses} from '../public/direction.js';
export function parseDiscovery(data,excluded=[],options={}) {
 const texts=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text');
 const text=texts.map(x=>x.text||'').join('\n').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('DISCOVERY_FORMAT');}
 const cited=[...texts.flatMap(x=>x.annotations||[]).filter(x=>x.type==='url_citation'),...(data.output||[]).filter(x=>x.type==='web_search_call').flatMap(x=>x.action?.sources||[])];
 const sources=new Set(cited.map(x=>canonicalUrl(x.url)).filter(Boolean));
 const host=url=>new URL(url).hostname.replace(/^www\./,'');
 const consultedUrl=value=>{const url=canonicalUrl(value);if(!url)return '';if(sources.has(url))return url;return [...sources].find(source=>host(source)===host(url))||'';};
 const excludedDomains=new Set(excluded.map(canonicalUrl).filter(Boolean).map(x=>new URL(x).hostname.replace(/^www\./,'')));

 const strict=options.intentMode==='active_demand';
 const excludedUrls=new Set(excluded.map(canonicalUrl));
 const raw=(Array.isArray(parsed.businesses)?parsed.businesses:[]).filter(x=>x&&typeof x.name==='string'&&typeof x.reason==='string'&&typeof x.url==='string');
 const eligible=raw.map(x=>{
  const evidence=x.evidence?{...x.evidence,url:canonicalUrl(x.evidence.url)}:null;
  const signal=buyingSignal(evidence,sources,options.now);
  if(strict&&!signal)return null;
  const url=strict?signal.url:consultedUrl(x.url);
  if(!url||!sources.has(url)||(strict?excludedUrls.has(url):excludedDomains.has(host(url))))return null;
  return {name:x.name.slice(0,160),reason:x.reason.slice(0,1200),url,intent_status:strict?'published_demand_to_verify':'unconfirmed',...(strict?{evidence:signal}:{})};
 }).filter(Boolean);
 const seen=new Set();
 const entries=(strict?eligible.filter(x=>{const key=x.name.toLowerCase().trim();if(seen.has(key))return false;seen.add(key);return true;}):uniqueBusinesses(eligible)).slice(0,5);
 return {entries,consulted_sources:[...sources].slice(0,30),note:typeof parsed.note==='string'?parsed.note.slice(0,1000):'',intent_mode:strict?'active_demand':'prospects',rejected_count:raw.length-entries.length,citations:entries.map(x=>({url:x.url,title:x.name}))};
}
