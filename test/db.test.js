import test from 'node:test';
import assert from 'node:assert/strict';
import {table} from '../public/db.js';
test('data service requests have a deadline and show a useful timeout error',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async (_url,options)=>{
   assert.ok(options.signal instanceof AbortSignal);
   throw new DOMException('timed out','TimeoutError');
  };
  await assert.rejects(table('procurement_dossiers'),/service de données ne répond pas/);
 } finally {globalThis.fetch=original;}
});

test('network failures preserve refresh credentials; rejected credentials are cleared',async()=>{
 const {refreshSession,currentUser}=await import('../public/db.js');
 const originalFetch=globalThis.fetch,originalStorage=globalThis.sessionStorage;
 let stored;
 globalThis.sessionStorage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;},removeItem:()=>{stored=null;}};
 try {
  const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test-user'}};
  stored=JSON.stringify(session);
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(table('procurement_dossiers'),/Cet échec ne confirme pas un mot de passe incorrect/);
  assert.deepEqual(await refreshSession(),session);
  assert.deepEqual(currentUser(),session.user);
  assert.equal(JSON.parse(stored).refresh_token,'test-refresh');
  stored=JSON.stringify({...session,expires_at:1});
  assert.equal(await refreshSession(),null);
  assert.equal(currentUser(),null);
  assert.equal(JSON.parse(stored).refresh_token,'test-refresh');
  for(const status of [429,500,503]) {
   globalThis.fetch=async()=>new Response(JSON.stringify({message:'temporary'}),{status});
   await refreshSession(); assert.ok(stored);
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'Invalid refresh token'}),{status:400});
  assert.equal(await refreshSession(),null); assert.equal(stored,null);
 } finally {globalThis.fetch=originalFetch;globalThis.sessionStorage=originalStorage;}
});
