create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null default 'buyer' check (account_type in ('buyer','provider')),
  display_name text not null default '',
  company_name text not null default '',
  locale text not null default 'fr-CA',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 160),
  description text not null default '',
  categories text[] not null default '{}',
  service_zones text[] not null default '{}',
  website text,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','suspended')),
  reliability_score numeric(5,4) not null default 0 check (reliability_score between 0 and 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_offerings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  category text not null,
  description text not null default '',
  min_price_minor bigint check (min_price_minor is null or min_price_minor >= 0),
  max_price_minor bigint check (max_price_minor is null or max_price_minor >= coalesce(min_price_minor, 0)),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  description text not null check (char_length(description) between 10 and 4000),
  category text not null,
  location text not null default '',
  min_budget_minor bigint check (min_budget_minor is null or min_budget_minor >= 0),
  max_budget_minor bigint check (max_budget_minor is null or max_budget_minor >= coalesce(min_budget_minor, 0)),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  constraints jsonb not null default '{}'::jsonb,
  risk_axes jsonb not null default '{}'::jsonb,
  approval_gates text[] not null default '{}',
  pipeline_class text check (pipeline_class in ('A','B','C')),
  processing_mode text,
  status text not null default 'draft' check (status in ('draft','classified','matching','quoted','closed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  rank integer not null check (rank > 0),
  score numeric(5,4) not null check (score between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  eligible boolean not null default true,
  explanation text not null default '',
  score_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '',
  status text not null default 'sent' check (status in ('sent','viewed','accepted','declined','expired','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, provider_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null unique references public.quote_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  terms text not null default '',
  valid_until date,
  status text not null default 'draft' check (status in ('draft','submitted','accepted','rejected','withdrawn','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index providers_owner_idx on public.providers(owner_user_id);
create index providers_categories_idx on public.providers using gin(categories);
create index offerings_provider_idx on public.provider_offerings(provider_id);
create index requests_buyer_created_idx on public.requests(buyer_user_id, created_at desc);
create index matches_request_rank_idx on public.matches(request_id, rank);
create index matches_provider_idx on public.matches(provider_id);
create index quote_requests_buyer_idx on public.quote_requests(buyer_user_id, created_at desc);
create index quote_requests_provider_idx on public.quote_requests(provider_id, created_at desc);
create index quotes_provider_idx on public.quotes(provider_id);
create index conversations_buyer_idx on public.conversations(buyer_user_id);
create index conversations_provider_idx on public.conversations(provider_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_sender_idx on public.messages(sender_user_id);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index audit_actor_created_idx on public.audit_events(actor_user_id, created_at desc);
create index audit_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger providers_updated_at before update on public.providers for each row execute function private.set_updated_at();
create trigger offerings_updated_at before update on public.provider_offerings for each row execute function private.set_updated_at();
create trigger requests_updated_at before update on public.requests for each row execute function private.set_updated_at();
create trigger quote_requests_updated_at before update on public.quote_requests for each row execute function private.set_updated_at();
create trigger quotes_updated_at before update on public.quotes for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, company_name, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'company_name', ''),
    case when new.raw_user_meta_data ->> 'account_type' = 'provider' then 'provider' else 'buyer' end
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.provider_offerings enable row level security;
alter table public.requests enable row level security;
alter table public.matches enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (user_id = (select auth.uid()) or private.is_admin()) with check (user_id = (select auth.uid()) or private.is_admin());

create policy providers_public_select on public.providers for select to anon, authenticated using ((active and verification_status = 'verified') or owner_user_id = (select auth.uid()) or private.is_admin());
create policy providers_insert on public.providers for insert to authenticated with check (owner_user_id = (select auth.uid()) or private.is_admin());
create policy providers_update on public.providers for update to authenticated using (owner_user_id = (select auth.uid()) or private.is_admin()) with check (owner_user_id = (select auth.uid()) or private.is_admin());
create policy providers_delete on public.providers for delete to authenticated using (owner_user_id = (select auth.uid()) or private.is_admin());

create policy offerings_public_select on public.provider_offerings for select to anon, authenticated using (
  exists (select 1 from public.providers p where p.id = provider_id and ((p.active and p.verification_status = 'verified') or p.owner_user_id = (select auth.uid()) or private.is_admin()))
);
create policy offerings_owner_insert on public.provider_offerings for insert to authenticated with check (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));
create policy offerings_owner_update on public.provider_offerings for update to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin()))) with check (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));
create policy offerings_owner_delete on public.provider_offerings for delete to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));

create policy requests_select on public.requests for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin() or exists (select 1 from public.quote_requests qr join public.providers p on p.id = qr.provider_id where qr.request_id = public.requests.id and p.owner_user_id = (select auth.uid())));
create policy requests_insert on public.requests for insert to authenticated with check (buyer_user_id = (select auth.uid()) or private.is_admin());
create policy requests_update on public.requests for update to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin()) with check (buyer_user_id = (select auth.uid()) or private.is_admin());
create policy requests_delete on public.requests for delete to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());

create policy matches_select on public.matches for select to authenticated using (private.is_admin() or exists (select 1 from public.requests r where r.id = request_id and r.buyer_user_id = (select auth.uid())) or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())));
create policy matches_buyer_write on public.matches for all to authenticated using (private.is_admin() or exists (select 1 from public.requests r where r.id = request_id and r.buyer_user_id = (select auth.uid()))) with check (private.is_admin() or exists (select 1 from public.requests r where r.id = request_id and r.buyer_user_id = (select auth.uid())));

create policy quote_requests_select on public.quote_requests for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())));
create policy quote_requests_insert on public.quote_requests for insert to authenticated with check (buyer_user_id = (select auth.uid()) and exists (select 1 from public.requests r where r.id = request_id and r.buyer_user_id = (select auth.uid())));
create policy quote_requests_buyer_update on public.quote_requests for update to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid()))) with check (buyer_user_id = (select auth.uid()) or private.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())));

create policy quotes_select on public.quotes for select to authenticated using (private.is_admin() or exists (select 1 from public.quote_requests qr where qr.id = quote_request_id and qr.buyer_user_id = (select auth.uid())) or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())));
create policy quotes_provider_insert on public.quotes for insert to authenticated with check (exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())) or private.is_admin());
create policy quotes_provider_update on public.quotes for update to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())) or private.is_admin()) with check (exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())) or private.is_admin());

create policy conversations_select on public.conversations for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_user_id = (select auth.uid())));
create policy conversations_insert on public.conversations for insert to authenticated with check (buyer_user_id = (select auth.uid()) and exists (select 1 from public.requests r where r.id = request_id and r.buyer_user_id = (select auth.uid())));

create policy messages_select on public.messages for select to authenticated using (private.is_admin() or exists (select 1 from public.conversations c left join public.providers p on p.id = c.provider_id where c.id = conversation_id and (c.buyer_user_id = (select auth.uid()) or p.owner_user_id = (select auth.uid()))));
create policy messages_insert on public.messages for insert to authenticated with check (sender_user_id = (select auth.uid()) and exists (select 1 from public.conversations c left join public.providers p on p.id = c.provider_id where c.id = conversation_id and (c.buyer_user_id = (select auth.uid()) or p.owner_user_id = (select auth.uid()))));
create policy messages_update_read on public.messages for update to authenticated using (exists (select 1 from public.conversations c left join public.providers p on p.id = c.provider_id where c.id = conversation_id and (c.buyer_user_id = (select auth.uid()) or p.owner_user_id = (select auth.uid())))) with check (exists (select 1 from public.conversations c left join public.providers p on p.id = c.provider_id where c.id = conversation_id and (c.buyer_user_id = (select auth.uid()) or p.owner_user_id = (select auth.uid()))));

create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid()) or private.is_admin()) with check (user_id = (select auth.uid()) or private.is_admin());

create policy audit_select on public.audit_events for select to authenticated using (actor_user_id = (select auth.uid()) or private.is_admin());
create policy audit_insert on public.audit_events for insert to authenticated with check (actor_user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.providers, public.provider_offerings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into public.providers (business_name, description, categories, service_zones, verification_status, reliability_score)
values
  ('NordMach Solutions', 'Machines d’emballage industriel et intégration de lignes.', array['industrial'], array['Québec','Ontario'], 'verified', 0.92),
  ('Emballage Laurentien', 'Équipements et services d’emballage alimentaire.', array['industrial'], array['Montréal','Québec'], 'verified', 0.87),
  ('Atlas Industrial Demo', 'Catalogue industriel de démonstration.', array['industrial'], array['Canada'], 'verified', 0.60);

insert into public.provider_offerings (provider_id, name, category, description, min_price_minor, max_price_minor)
select id, business_name || ' — solution d’emballage', 'industrial', description, 500000, 1500000
from public.providers;
