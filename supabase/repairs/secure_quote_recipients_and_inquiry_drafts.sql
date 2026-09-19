
-- Require a real, active, qualified recipient for portal inquiries.
drop policy quote_requests_insert on public.quote_requests;
create policy quote_requests_insert on public.quote_requests for insert to authenticated with check (
 buyer_user_id=(select auth.uid())
 and exists(select 1 from public.requests r where r.id=quote_requests.request_id and r.buyer_user_id=(select auth.uid()))
 and exists(select 1 from public.providers p where p.id=quote_requests.provider_id and p.active and p.verification_status='verified' and p.owner_user_id is not null)
 and status='sent'
);
-- Prevent clients from changing a recipient, buyer or linked request after creation.
revoke update on public.quote_requests from authenticated;
grant update(status) on public.quote_requests to authenticated;
drop policy quotes_provider_insert on public.quotes;
create policy quotes_provider_insert on public.quotes for insert to authenticated with check (
 status in ('draft','submitted')
 and exists(select 1 from public.providers p join public.quote_requests qr on qr.provider_id=p.id where p.id=quotes.provider_id and qr.id=quotes.quote_request_id and p.owner_user_id=(select auth.uid()) and qr.status not in ('cancelled','expired','declined'))
);
revoke update on public.quotes from authenticated;
grant update(amount_minor,currency,terms,valid_until,status) on public.quotes to authenticated;
drop policy quotes_provider_update on public.quotes;
create policy quotes_provider_update on public.quotes for update to authenticated using (
 exists(select 1 from public.providers p where p.id=quotes.provider_id and p.owner_user_id=(select auth.uid()))
) with check (
 status in ('draft','submitted','withdrawn')
 and exists(select 1 from public.providers p join public.quote_requests qr on qr.provider_id=p.id where p.id=quotes.provider_id and qr.id=quotes.quote_request_id and p.owner_user_id=(select auth.uid()))
);
create table public.inquiry_drafts(
 id uuid primary key default gen_random_uuid(),
 buyer_user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 12000),
 created_at timestamptz not null default now()
);
alter table public.inquiry_drafts enable row level security;
revoke all on public.inquiry_drafts from anon,authenticated;
grant select,insert,delete on public.inquiry_drafts to authenticated;
create policy inquiry_drafts_select on public.inquiry_drafts for select to authenticated using(buyer_user_id=(select auth.uid()));
create policy inquiry_drafts_insert on public.inquiry_drafts for insert to authenticated with check(buyer_user_id=(select auth.uid()));
create policy inquiry_drafts_delete on public.inquiry_drafts for delete to authenticated using(buyer_user_id=(select auth.uid()));
create index inquiry_drafts_buyer_idx on public.inquiry_drafts(buyer_user_id,created_at desc);

