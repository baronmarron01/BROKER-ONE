-- Break recursive INSERT checks while exposing only an ownership boolean.
create or replace function private.owns_procurement_request(request_uuid uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists(select 1 from public.requests r where r.id=request_uuid and r.buyer_user_id=auth.uid()); $$;
revoke all on function private.owns_procurement_request(uuid) from public,anon;
grant execute on function private.owns_procurement_request(uuid) to authenticated;
drop policy quote_requests_insert on public.quote_requests;
create policy quote_requests_insert on public.quote_requests for insert to authenticated with check (
 buyer_user_id=(select auth.uid()) and private.owns_procurement_request(request_id)
 and exists(select 1 from public.providers p where p.id=quote_requests.provider_id and p.active and p.verification_status='verified' and p.owner_user_id is not null)
 and status='sent'
);
