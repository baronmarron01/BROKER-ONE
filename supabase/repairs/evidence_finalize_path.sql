create or replace function private.check_document_upload() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.uploaded_at is not null or not exists(select 1 from storage.objects o where o.bucket_id='offer-evidence' and o.name=old.object_path and (o.metadata->>'size')::bigint=new.byte_size and o.metadata->>'mimetype'=new.mime_type) then
  raise exception 'Document absent ou métadonnées incompatibles';
 end if;
 new.uploaded_at=now();return new;
end $$;
