// All amounts are integer minor units. Unknown is never interpreted as zero.
export function amountMinor(value) {
  if(value == null || String(value).trim()==='') return null;
  const raw=String(value).trim().replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Montant invalide : utilisez au plus deux décimales et aucun séparateur de milliers.');
  const [whole,fraction='']=raw.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount) || amount>100000000000)throw new Error('Montant hors limite.');
  return amount;
}
export function summarizeOffer(offer,today=new Date().toISOString().slice(0,10)) {
  const fields=['base_minor','tax_minor','shipping_minor','installation_minor'];
  const missing=fields.filter(key=>offer[key]==null || !Number.isSafeInteger(Number(offer[key])) || Number(offer[key])<0);
  const subtotal=fields.reduce((sum,key)=>sum+(offer[key]==null?0:Number(offer[key])),0);
  const expired=Boolean(offer.valid_until && offer.valid_until<today);
  const comparable=missing.length===0 && !expired && Boolean(offer.valid_until) && offer.stage==='response_received';
  return {...offer,total_minor:missing.length?null:subtotal,known_subtotal_minor:subtotal,missing,expired,comparable};
}
export function compareOffers(offers,today) {
  // Currency groups are independent; no invented exchange rate.
  return offers.map(o=>summarizeOffer(o,today)).sort((a,b)=>a.currency.localeCompare(b.currency)||Number(b.comparable)-Number(a.comparable)||(a.total_minor??Infinity)-(b.total_minor??Infinity)||a.supplier_name.localeCompare(b.supplier_name));
}
