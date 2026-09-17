drop policy if exists matches_buyer_write on public.matches;

create policy matches_buyer_insert on public.matches
for insert to authenticated
with check (
  private.is_admin()
  or exists (
    select 1 from public.requests r
    where r.id = request_id and r.buyer_user_id = (select auth.uid())
  )
);

create policy matches_buyer_update on public.matches
for update to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.requests r
    where r.id = request_id and r.buyer_user_id = (select auth.uid())
  )
)
with check (
  private.is_admin()
  or exists (
    select 1 from public.requests r
    where r.id = request_id and r.buyer_user_id = (select auth.uid())
  )
);

create policy matches_buyer_delete on public.matches
for delete to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.requests r
    where r.id = request_id and r.buyer_user_id = (select auth.uid())
  )
);
