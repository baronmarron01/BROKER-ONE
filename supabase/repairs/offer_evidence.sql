alter table public.procurement_offers add constraint procurement_offers_owner_unique unique(id,buyer_user_id);
create table public.offer_documents (
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null,
 buyer_user_id uuid not null references auth.users(id) on delete cascade,
 file_name text not null check(char_length(file_name) between 1 and 180 and file_name !~ '[[:cntrl:]/\\]'),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 provenance text not null check(char_length(provenance) between 3 and 2000),
 received_on date not null,
 object_path text generated always as (buyer_user_id::text || '/' || offer_id::text || '/' || id::text) stored unique,
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 unique(id,buyer_user_id),
 foreign key(offer_id,buyer_user_id) references public.procurement_offers(id,buyer_user_id) on delete cascade
);
alter table public.offer_documents enable row level security;
revoke all on public.offer_documents from anon,authenticated;
grant select on public.offer_documents to authenticated;
grant insert(id,offer_id,buyer_user_id,file_name,mime_type,byte_size,sha256,provenance,received_on) on public.offer_documents to authenticated;
grant update(uploaded_at) on public.offer_documents to authenticated;
create policy document_read on public.offer_documents for select to authenticated using(buyer_user_id=(select auth.uid()));
create policy document_create on public.offer_documents for insert to authenticated with check(buyer_user_id=(select auth.uid()));
create policy document_finalize on public.offer_documents for update to authenticated using(buyer_user_id=(select auth.uid()) and uploaded_at is null) with check(buyer_user_id=(select auth.uid()));
create index offer_documents_offer_owner_idx on public.offer_documents(offer_id,buyer_user_id);
create index offer_documents_buyer_idx on public.offer_documents(buyer_user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('offer-evidence','offer-evidence',false,5242880,array['application/pdf','image/png','image/jpeg']);
create policy evidence_upload on storage.objects for insert to authenticated with check (
 bucket_id='offer-evidence' and exists(select 1 from public.offer_documents d where d.object_path=name and d.buyer_user_id=(select auth.uid()) and d.uploaded_at is null)
);
create policy evidence_read on storage.objects for select to authenticated using (
 bucket_id='offer-evidence' and exists(select 1 from public.offer_documents d where d.object_path=name and d.buyer_user_id=(select auth.uid()))
);
create function private.check_document_upload() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.uploaded_at is not null or not exists(select 1 from storage.objects o where o.bucket_id='offer-evidence' and o.name=old.object_path and (o.metadata->>'size')::bigint=new.byte_size and o.metadata->>'mimetype'=new.mime_type) then
  raise exception 'Document absent ou métadonnées incompatibles';
 end if;
 new.uploaded_at=now();return new;
end $$;
create trigger document_upload_checked before update on public.offer_documents for each row execute function private.check_document_upload();
create table public.offer_document_reviews (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null,
 buyer_user_id uuid not null references auth.users(id) on delete cascade,
 criterion text not null check(criterion in ('identity','technical_fit','commercial_terms','compliance')),
 finding text not null check(finding in ('supported','insufficient','contradicted')),
 conclusion text not null check(char_length(conclusion) between 10 and 4000),
 created_at timestamptz not null default now(),
 foreign key(document_id,buyer_user_id) references public.offer_documents(id,buyer_user_id) on delete cascade
);
alter table public.offer_document_reviews enable row level security;
revoke all on public.offer_document_reviews from anon,authenticated;
grant select on public.offer_document_reviews to authenticated;
grant insert(document_id,buyer_user_id,criterion,finding,conclusion) on public.offer_document_reviews to authenticated;
create policy review_read on public.offer_document_reviews for select to authenticated using(buyer_user_id=(select auth.uid()));
create policy review_create on public.offer_document_reviews for insert to authenticated with check(buyer_user_id=(select auth.uid()) and exists(select 1 from public.offer_documents d where d.id=document_id and d.buyer_user_id=(select auth.uid()) and d.uploaded_at is not null));
create index offer_document_reviews_doc_idx on public.offer_document_reviews(document_id,buyer_user_id,created_at desc);
create index offer_document_reviews_buyer_idx on public.offer_document_reviews(buyer_user_id);
