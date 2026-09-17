alter table public.providers add column search_document tsvector;

create or replace function private.refresh_provider_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document :=
    setweight(to_tsvector('pg_catalog.french', coalesce(new.business_name, '')), 'A') ||
    setweight(to_tsvector('pg_catalog.french', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('pg_catalog.simple', array_to_string(coalesce(new.categories, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('pg_catalog.french', array_to_string(coalesce(new.service_zones, '{}'), ' ')), 'C');
  return new;
end;
$$;

create trigger providers_search_document
before insert or update of business_name, description, categories, service_zones
on public.providers for each row execute function private.refresh_provider_search_document();

update public.providers set business_name = business_name;
alter table public.providers alter column search_document set not null;
create index providers_search_document_idx on public.providers using gin(search_document);
create index offerings_category_active_idx on public.provider_offerings(category, active, provider_id);

create table public.provider_sources (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  source_type text not null check (source_type in ('registry','provider_website','government_registry','certification','marketplace','manual_review','external_api')),
  source_url text,
  source_label text not null,
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','stale','rejected')),
  created_at timestamptz not null default now()
);

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.requests(id) on delete set null,
  query_text text not null check (char_length(query_text) between 1 and 4000),
  filters jsonb not null default '{}'::jsonb,
  connector text not null default 'internal_registry',
  result_count integer not null default 0 check (result_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create table public.search_results (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid not null references public.search_runs(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  position integer not null check (position > 0),
  lexical_score numeric(8,6) not null default 0 check (lexical_score >= 0),
  filter_score numeric(5,4) not null default 0 check (filter_score between 0 and 1),
  provenance_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(search_run_id, provider_id)
);

create index provider_sources_provider_checked_idx on public.provider_sources(provider_id, checked_at desc);
create index provider_sources_status_expiry_idx on public.provider_sources(status, expires_at);
create index search_runs_buyer_created_idx on public.search_runs(buyer_user_id, created_at desc);
create index search_runs_request_idx on public.search_runs(request_id);
create index search_results_run_position_idx on public.search_results(search_run_id, position);
create index search_results_buyer_idx on public.search_results(buyer_user_id);
create index search_results_provider_idx on public.search_results(provider_id);

alter table public.provider_sources enable row level security;
alter table public.search_runs enable row level security;
alter table public.search_results enable row level security;

create policy provider_sources_select on public.provider_sources
for select to anon, authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_id
      and ((p.active and p.verification_status = 'verified') or p.owner_user_id = (select auth.uid()) or private.is_admin())
  )
);
create policy provider_sources_owner_insert on public.provider_sources
for insert to authenticated
with check (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));
create policy provider_sources_owner_update on public.provider_sources
for update to authenticated
using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())))
with check (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));
create policy provider_sources_owner_delete on public.provider_sources
for delete to authenticated
using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_user_id = (select auth.uid()) or private.is_admin())));

create policy search_runs_own_select on public.search_runs for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());
create policy search_runs_own_insert on public.search_runs for insert to authenticated with check (buyer_user_id = (select auth.uid()));
create policy search_runs_own_delete on public.search_runs for delete to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());

create policy search_results_own_select on public.search_results for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());
create policy search_results_own_insert on public.search_results for insert to authenticated with check (
  buyer_user_id = (select auth.uid())
  and exists (select 1 from public.search_runs sr where sr.id = search_run_id and sr.buyer_user_id = (select auth.uid()))
);
create policy search_results_own_delete on public.search_results for delete to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());

grant select on public.provider_sources to anon;
grant select, insert, update, delete on public.provider_sources, public.search_runs, public.search_results to authenticated;

create or replace function public.search_provider_registry(
  search_query text,
  search_category text default null,
  search_location text default null,
  min_budget_minor bigint default null,
  max_budget_minor bigint default null,
  max_results integer default 20
)
returns table (
  provider_id uuid,
  business_name text,
  description text,
  categories text[],
  service_zones text[],
  reliability_score numeric,
  lexical_score real,
  location_match boolean,
  price_match boolean,
  estimated_min_price_minor bigint,
  estimated_max_price_minor bigint,
  currency text,
  provenance jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select case when btrim(coalesce(search_query, '')) = '' then null else websearch_to_tsquery('pg_catalog.french', search_query) end as query
  )
  select
    p.id,
    p.business_name,
    p.description,
    p.categories,
    p.service_zones,
    p.reliability_score,
    case when params.query is null then 0::real else ts_rank_cd(p.search_document, params.query, 32) end,
    case when nullif(btrim(search_location), '') is null then true else exists (
      select 1 from unnest(p.service_zones) zone where lower(search_location) like '%' || lower(zone) || '%' or lower(zone) like '%' || lower(search_location) || '%'
    ) end,
    case when min_budget_minor is null and max_budget_minor is null then true else exists (
      select 1 from public.provider_offerings po
      where po.provider_id = p.id and po.active
        and (max_budget_minor is null or po.min_price_minor is null or po.min_price_minor <= max_budget_minor)
        and (min_budget_minor is null or po.max_price_minor is null or po.max_price_minor >= min_budget_minor)
    ) end,
    prices.min_price,
    prices.max_price,
    coalesce(prices.currency, 'CAD'),
    jsonb_build_object(
      'source_count', (select count(*) from public.provider_sources ps where ps.provider_id = p.id and ps.status = 'active'),
      'latest_checked_at', (select max(ps.checked_at) from public.provider_sources ps where ps.provider_id = p.id and ps.status = 'active'),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('type', ps.source_type, 'label', ps.source_label, 'url', ps.source_url, 'checked_at', ps.checked_at) order by ps.checked_at desc) from public.provider_sources ps where ps.provider_id = p.id and ps.status = 'active'), '[]'::jsonb)
    )
  from public.providers p
  cross join params
  left join lateral (
    select min(po.min_price_minor) as min_price, max(po.max_price_minor) as max_price, min(po.currency) as currency
    from public.provider_offerings po where po.provider_id = p.id and po.active
  ) prices on true
  where p.active and p.verification_status = 'verified'
    and (params.query is null or p.search_document @@ params.query)
    and (search_category is null or search_category = '' or search_category = any(p.categories) or exists (select 1 from public.provider_offerings po where po.provider_id = p.id and po.active and po.category = search_category))
  order by
    (case when params.query is null then 0 else ts_rank_cd(p.search_document, params.query, 32) end) desc,
    p.reliability_score desc,
    p.business_name
  limit least(greatest(coalesce(max_results, 20), 1), 100)
$$;

revoke all on function public.search_provider_registry(text,text,text,bigint,bigint,integer) from public;
grant execute on function public.search_provider_registry(text,text,text,bigint,bigint,integer) to anon, authenticated;

insert into public.provider_sources (provider_id, source_type, source_label, evidence)
select id, 'registry', 'Registre interne de démonstration', jsonb_build_object('classification', 'demo_seed', 'verified_by', 'system_seed')
from public.providers
where owner_user_id is null;
