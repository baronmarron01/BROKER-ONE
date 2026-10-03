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
