begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.dossier',gen_random_uuid()::text,true),set_config('test.offer',gen_random_uuid()::text,true),set_config('test.doc',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.owner')::uuid,'evidence-owner@example.invalid'),(current_setting('test.other')::uuid,'evidence-other@example.invalid');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
insert into public.procurement_dossiers(id,buyer_user_id,title,request_snapshot) values(current_setting('test.dossier')::uuid,auth.uid(),'Test evidence','{}');
insert into public.procurement_offers(id,dossier_id,buyer_user_id,supplier_name,currency) values(current_setting('test.offer')::uuid,current_setting('test.dossier')::uuid,auth.uid(),'Test fictif','CAD');
insert into public.offer_documents(id,offer_id,buyer_user_id,file_name,mime_type,byte_size,sha256,provenance,received_on) values(current_setting('test.doc')::uuid,current_setting('test.offer')::uuid,auth.uid(),'test.pdf','application/pdf',100,repeat('a',64),'Document synthétique',current_date);
do $$ begin
 begin
 update public.offer_documents set uploaded_at=now() where id=current_setting('test.doc')::uuid;
 raise exception 'MISSING_OBJECT_ACCEPTED';
 exception when raise_exception then if sqlerrm='MISSING_OBJECT_ACCEPTED' then raise;end if;end;
 begin
 insert into public.offer_document_reviews(document_id,buyer_user_id,criterion,finding,conclusion) values(current_setting('test.doc')::uuid,auth.uid(),'identity','supported','Test avant dépôt');
 raise exception 'REVIEW_BEFORE_UPLOAD';
 exception when insufficient_privilege then null;end;
end $$;
-- Transaction-only Storage metadata fixture; does not claim an actual upload.
insert into storage.objects(bucket_id,name,owner_id,metadata) select 'offer-evidence',object_path,auth.uid()::text,'{"size":100,"mimetype":"application/pdf"}' from public.offer_documents where id=current_setting('test.doc')::uuid;
update public.offer_documents set uploaded_at='2000-01-01' where id=current_setting('test.doc')::uuid;
insert into public.offer_document_reviews(document_id,buyer_user_id,criterion,finding,conclusion) values(current_setting('test.doc')::uuid,auth.uid(),'identity','insufficient','Document synthétique non probant');
do $$ begin
 if not exists(select 1 from public.offer_documents where id=current_setting('test.doc')::uuid and uploaded_at>='2026-01-01') then raise exception 'TIMESTAMP_SPOOF';end if;
 begin
 update public.offer_documents set sha256=repeat('b',64) where id=current_setting('test.doc')::uuid;
 raise exception 'IMMUTABLE_DOCUMENT_CHANGED';exception when insufficient_privilege then null;end;
 begin
 update public.offer_document_reviews set finding='supported' where document_id=current_setting('test.doc')::uuid;
 raise exception 'IMMUTABLE_REVIEW_CHANGED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.offer_documents where id=current_setting('test.doc')::uuid) then raise exception 'DOCUMENT_LEAK';end if;
 if exists(select 1 from public.offer_document_reviews where document_id=current_setting('test.doc')::uuid) then raise exception 'REVIEW_LEAK';end if;
 if exists(select 1 from storage.objects where bucket_id='offer-evidence' and name like current_setting('test.owner')||'/%') then raise exception 'STORAGE_LEAK';end if;
 begin
 insert into public.offer_documents(offer_id,buyer_user_id,file_name,mime_type,byte_size,sha256,provenance,received_on) values(current_setting('test.offer')::uuid,auth.uid(),'intrusion.pdf','application/pdf',100,repeat('a',64),'Test intrusion',current_date);
 raise exception 'CROSS_OFFER_DOCUMENT';exception when foreign_key_violation or insufficient_privilege then null;end;
 begin
 insert into storage.objects(bucket_id,name) values('offer-evidence',current_setting('test.owner')||'/'||current_setting('test.offer')||'/'||gen_random_uuid()::text);
 raise exception 'CROSS_STORAGE_UPLOAD';exception when insufficient_privilege then null;end;
 begin
 insert into public.offer_document_reviews(document_id,buyer_user_id,criterion,finding,conclusion) values(current_setting('test.doc')::uuid,auth.uid(),'identity','supported','Test intrusion revue');
 raise exception 'CROSS_REVIEW';exception when insufficient_privilege or foreign_key_violation then null;end;
end $$;
select true as own_document_and_review_passed,true as missing_upload_rejected,true as review_before_upload_rejected,true as immutable_records_passed,true as cross_account_read_blocked,true as cross_account_write_blocked;
rollback;
