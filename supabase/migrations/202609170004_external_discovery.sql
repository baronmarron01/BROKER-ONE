create table public.external_search_results (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid not null references public.search_runs(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  external_key text not null check (char_length(external_key) between 3 and 300),
  source_id text not null check (source_id in ('gleif','wikidata','overture_places')),
  display_name text not null check (char_length(display_name) between 1 and 500),
  position integer not null check (position > 0),
  score numeric(8,6) not null default 0 check (score between 0 and 1),
  verification_status text not null default 'unverified_candidate' check (verification_status in ('unverified_candidate','rejected','promoted')),
  provenance_snapshot jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(search_run_id, external_key)
);

create index external_search_results_run_position_idx on public.external_search_results(search_run_id, position);
create index external_search_results_buyer_created_idx on public.external_search_results(buyer_user_id, created_at desc);
create index external_search_results_source_key_idx on public.external_search_results(source_id, external_key);

alter table public.external_search_results enable row level security;

create policy external_search_results_own_select on public.external_search_results
for select to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());

create policy external_search_results_own_insert on public.external_search_results
for insert to authenticated with check (
  buyer_user_id = (select auth.uid())
  and exists (
    select 1 from public.search_runs sr
    where sr.id = search_run_id and sr.buyer_user_id = (select auth.uid())
  )
);

create policy external_search_results_own_delete on public.external_search_results
for delete to authenticated using (buyer_user_id = (select auth.uid()) or private.is_admin());

revoke all on public.external_search_results from anon;
revoke all on public.external_search_results from authenticated;
grant select, insert, delete on public.external_search_results to authenticated;

comment on table public.external_search_results is
'Immutable discovery evidence. A row is not a verified provider and cannot receive quotes until promoted through a controlled verification workflow.';
