create table public.procurement_dossiers (
 id uuid primary key default gen_random_uuid(),
 buyer_user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 160),
 request_snapshot jsonb not null check(jsonb_typeof(request_snapshot)='object' and octet_length(request_snapshot::text)<=25000),
 research_text text not null default '' check(char_length(research_text)<=30000),
 sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=50 and octet_length(sources::text)<=30000),
 created_at timestamptz not null default now(),
 unique(id,buyer_user_id)
);
alter table public.procurement_dossiers enable row level security;
revoke all on public.procurement_dossiers from anon,authenticated;
grant select,insert on public.procurement_dossiers to authenticated;
create policy dossiers_read on public.procurement_dossiers for select to authenticated using(buyer_user_id=(select auth.uid()));
create policy dossiers_create on public.procurement_dossiers for insert to authenticated with check(buyer_user_id=(select auth.uid()));
create index procurement_dossiers_buyer_idx on public.procurement_dossiers(buyer_user_id,created_at desc);

create table public.procurement_offers (
 id uuid primary key default gen_random_uuid(),
 dossier_id uuid not null,
 buyer_user_id uuid not null references auth.users(id) on delete cascade,
 supplier_name text not null check(char_length(supplier_name) between 2 and 160),
 source_url text not null default '' check(char_length(source_url)<=2000 and (source_url='' or source_url ~ '^https://')),
 currency text not null check(currency in ('CAD','USD','EUR')),
 base_minor bigint check(base_minor between 0 and 100000000000),
 tax_minor bigint check(tax_minor between 0 and 100000000000),
 shipping_minor bigint check(shipping_minor between 0 and 100000000000),
 installation_minor bigint check(installation_minor between 0 and 100000000000),
 valid_until date,
 delivery_days integer check(delivery_days between 0 and 3650),
 stage text not null default 'candidate' check(stage in ('candidate','contacted_by_user','response_received','excluded')),
 notes text not null default '' check(char_length(notes)<=6000),
 qualification_notes text not null default '' check(char_length(qualification_notes)<=6000),
 evidence_kind text not null default 'buyer_entered' check(evidence_kind='buyer_entered'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(dossier_id,buyer_user_id) references public.procurement_dossiers(id,buyer_user_id) on delete cascade
);
alter table public.procurement_offers enable row level security;
revoke all on public.procurement_offers from anon,authenticated;
grant select,insert on public.procurement_offers to authenticated;
grant update(supplier_name,source_url,currency,base_minor,tax_minor,shipping_minor,installation_minor,valid_until,delivery_days,stage,notes,qualification_notes) on public.procurement_offers to authenticated;
create policy offers_read on public.procurement_offers for select to authenticated using(buyer_user_id=(select auth.uid()));
create policy offers_create on public.procurement_offers for insert to authenticated with check(buyer_user_id=(select auth.uid()));
create policy offers_edit on public.procurement_offers for update to authenticated using(buyer_user_id=(select auth.uid())) with check(buyer_user_id=(select auth.uid()));
create index procurement_offers_dossier_idx on public.procurement_offers(dossier_id,buyer_user_id);
create index procurement_offers_buyer_idx on public.procurement_offers(buyer_user_id);
create trigger procurement_offers_updated_at before update on public.procurement_offers for each row execute function private.set_updated_at();
