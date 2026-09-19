-- Protect trust attributes at the database API boundary.
revoke insert, update on public.providers from authenticated;
grant insert (owner_user_id,business_name,description,categories,service_zones,website) on public.providers to authenticated;
grant update (owner_user_id,business_name,description,categories,service_zones,website) on public.providers to authenticated;
-- Preserve decisions if their original search result or search run is deleted.
alter table public.external_verification_cases alter column external_result_id drop not null;
alter table public.external_verification_cases drop constraint external_verification_cases_external_result_id_fkey;
alter table public.external_verification_cases add constraint external_verification_cases_external_result_id_fkey foreign key(external_result_id) references public.external_search_results(id) on delete set null;
alter table public.external_verification_events drop constraint external_verification_events_case_id_fkey;
alter table public.external_verification_events add constraint external_verification_events_case_id_fkey foreign key(case_id) references public.external_verification_cases(id) on delete restrict;
-- New client-submitted discoveries cannot assert an administrative decision.
drop policy external_search_results_own_insert on public.external_search_results;
create policy external_search_results_own_insert on public.external_search_results for insert to authenticated with check (
buyer_user_id=(select auth.uid()) and verification_status='unverified_candidate'
and exists(select 1 from public.search_runs sr where sr.id=search_run_id and sr.buyer_user_id=(select auth.uid())));
