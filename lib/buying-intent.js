export function buyingSignal(e,sources,now=new Date()) {
 if(!e||e.individual_notice!==true||!['rfq','tender','wanted'].includes(e.type)||e.status!=='open'||e.product_match!==true||e.geography_match!==true)return null;
 if(!sources.has(e.url)||typeof e.excerpt!=='string'||!e.excerpt.trim()||e.excerpt.trim().split(/\s+/).length>25)return null;
 const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 let published,deadline;
 try{if(!day(e.published_at))return null;published=Date.parse(e.published_at+'T00:00:00Z');if(e.deadline!=null&&!day(e.deadline))return null;deadline=e.deadline?Date.parse(e.deadline+'T00:00:00Z'):null;}catch{return null;}
 const today=Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z');
 if(published>today||(deadline!==null&&(deadline<=today||deadline<published))||(deadline===null&&today-published>30*86400000))return null;
 return {type:e.type,url:e.url,excerpt:e.excerpt.trim(),published_at:e.published_at,deadline:e.deadline||null,status:'open_declared',verification:'model_extracted_not_independently_verified'};
}
