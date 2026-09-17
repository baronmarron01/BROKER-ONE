create table public.external_verification_cases (
  id uuid primary key default gen_random_uuid(),
  external_result_id uuid not null unique references public.external_search_results(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_review','approved','rejected')),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision_reason text not null default '',
  checks jsonb not null default '{}'::jsonb,
  promoted_provider_id uuid references public.providers(id) on delete set null,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.external_verification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.external_verification_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('opened','approved','rejected')),
  reason text not null default '',
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index external_verification_cases_status_updated_idx on public.external_verification_cases(status, updated_at desc);
create index external_verification_events_case_created_idx on public.external_verification_events(case_id, created_at desc);
create trigger external_verification_cases_updated_at before update on public.external_verification_cases for each row execute function private.set_updated_at();

alter table public.external_verification_cases enable row level security;
alter table public.external_verification_events enable row level security;

create policy external_verification_cases_select on public.external_verification_cases for select to authenticated
using (private.is_admin() or exists (select 1 from public.external_search_results r where r.id = external_result_id and r.buyer_user_id = (select auth.uid())));
create policy external_verification_events_select on public.external_verification_events for select to authenticated
using (private.is_admin() or exists (select 1 from public.external_verification_cases c join public.external_search_results r on r.id = c.external_result_id where c.id = case_id and r.buyer_user_id = (select auth.uid())));

revoke all on public.external_verification_cases, public.external_verification_events from anon, authenticated;
grant select on public.external_verification_cases, public.external_verification_events to authenticated;

create or replace function public.review_external_candidate(
  candidate_result_id uuid, decision text, reason text,
  reviewed_business_name text default null, reviewed_categories text[] default '{}',
  reviewed_service_zones text[] default '{}', reviewed_website text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate public.external_search_results%rowtype;
  verification_case public.external_verification_cases%rowtype;
  provider_id uuid;
  source_url text;
  normalized_decision text := lower(btrim(decision));
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if normalized_decision not in ('approved','rejected') then raise exception 'INVALID_DECISION' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(reason, ''))) < 10 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;

  select * into candidate from public.external_search_results where id = candidate_result_id for update;
  if not found then raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into verification_case from public.external_verification_cases where external_result_id = candidate.id for update;
  if verification_case.status = 'approved' and verification_case.promoted_provider_id is not null then
    return jsonb_build_object('case_id', verification_case.id, 'status', verification_case.status, 'provider_id', verification_case.promoted_provider_id, 'idempotent', true);
  end if;

  insert into public.external_verification_cases (external_result_id, status, reviewer_user_id, decision_reason, checks, decided_at)
  values (candidate.id, normalized_decision, (select auth.uid()), btrim(reason), jsonb_build_object('identity_reviewed', true, 'source_rights_reviewed', true, 'human_decision', true), now())
  on conflict (external_result_id) do update set status=excluded.status, reviewer_user_id=excluded.reviewer_user_id, decision_reason=excluded.decision_reason, checks=excluded.checks, decided_at=excluded.decided_at
  returning * into verification_case;

  if normalized_decision = 'approved' then
    insert into public.providers (business_name, description, categories, service_zones, website, verification_status, reliability_score, active)
    values (left(coalesce(nullif(btrim(reviewed_business_name), ''), candidate.display_name), 160), 'Fournisseur issu de la découverte externe et approuvé par vérification humaine.', case when cardinality(reviewed_categories)=0 then array['other'] else reviewed_categories end, reviewed_service_zones, nullif(btrim(reviewed_website), ''), 'verified', 0.4500, true)
    returning id into provider_id;
    source_url := candidate.provenance_snapshot #>> '{sources,0,url}';
    insert into public.provider_sources (provider_id, source_type, source_url, source_label, evidence, status) values
      (provider_id, 'external_api', source_url, upper(candidate.source_id), candidate.provenance_snapshot, 'active'),
      (provider_id, 'manual_review', null, 'Vérification humaine BROKER-ONE', jsonb_build_object('case_id', verification_case.id, 'reason', btrim(reason), 'reviewer_user_id', (select auth.uid())), 'active');
    update public.external_search_results set verification_status='promoted' where id=candidate.id;
    update public.external_verification_cases set promoted_provider_id=provider_id where id=verification_case.id;
  else
    update public.external_search_results set verification_status='rejected' where id=candidate.id;
  end if;

  insert into public.external_verification_events (case_id, actor_user_id, event_type, reason, evidence_snapshot)
  values (verification_case.id, (select auth.uid()), normalized_decision, btrim(reason), candidate.provenance_snapshot);
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), 'external_candidate.'||normalized_decision, 'external_verification_case', verification_case.id, jsonb_build_object('external_result_id',candidate.id,'provider_id',provider_id));
  return jsonb_build_object('case_id',verification_case.id,'status',normalized_decision,'provider_id',provider_id,'idempotent',false);
end; $$;

revoke all on function public.review_external_candidate(uuid,text,text,text,text[],text[],text) from public, anon;
grant execute on function public.review_external_candidate(uuid,text,text,text,text[],text[],text) to authenticated;
comment on function public.review_external_candidate(uuid,text,text,text,text[],text[],text) is 'Atomic admin-only human verification with immutable evidence and append-only decision history.';
