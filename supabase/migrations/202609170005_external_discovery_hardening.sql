revoke all on public.external_search_results from anon;

comment on table public.external_search_results is
'Immutable discovery evidence visible only to its authenticated buyer or an administrator. A row is not a verified provider and cannot receive quotes until promoted through a controlled verification workflow.';
