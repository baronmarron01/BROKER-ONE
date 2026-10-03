import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDocument,verifyDocument,MAX_DOCUMENT_BYTES} from '../public/evidence-validation.js';
const pdf=()=>new File(['%PDF-1.4\nTest fictif\n%%EOF'], 'test.pdf',{type:'application/pdf'});
test('document fingerprint matches uploaded bytes and catches tampering',async()=>{
 const file=pdf(),meta=await inspectDocument(file);assert.equal(meta.mime,'application/pdf');assert.match(meta.sha256,/^[a-f0-9]{64}$/);
 await verifyDocument(file,{byte_size:meta.size,sha256:meta.sha256});
 await assert.rejects(verifyDocument(new Blob(['changed']),{byte_size:meta.size,sha256:meta.sha256}),/Intégrité/);
});
test('reject HTML disguised as PDF and conflicting MIME',async()=>{
 await assert.rejects(inspectDocument(new File(['<script>alert(1)</script>'],'fake.pdf',{type:'application/pdf'})),/Format/);
 await assert.rejects(inspectDocument(new File(['%PDF-1.4'],'fake.png',{type:'image/png'})),/correspond/);
});
test('reject empty, oversized and path filenames',async()=>{
 await assert.rejects(inspectDocument(new File([],'empty.pdf')),/non vide/);
 await assert.rejects(inspectDocument({size:MAX_DOCUMENT_BYTES+1}),/5 Mo/);
 await assert.rejects(inspectDocument(new File(['%PDF-1.4'],'../test.pdf')),/Nom/);
});
test('PNG and JPEG signatures accepted without a browser MIME',async()=>{
 assert.equal((await inspectDocument(new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png'))).mime,'image/png');
 assert.equal((await inspectDocument(new File([new Uint8Array([255,216,255])],'test.jpg'))).mime,'image/jpeg');
});
