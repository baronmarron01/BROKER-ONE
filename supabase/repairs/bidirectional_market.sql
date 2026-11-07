-- Additive: existing private dossiers, offers and attachments are preserved.
create table public.market_listings (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 direction text not null check(direction in ('buy','sell')),
 title text not null check(char_length(title) between 3 and 160),
 description text not null check(char_length(description) between 10 and 4000),
 category text not null check(char_length(category) between 1 and 80),
 location text not null default '' check(char_length(location)<=200),
 business_name text not null check(char_length(business_name) between 2 and 160),
 website text not null default '' check(website='' or (website ~ '^https://' and char_length(website)<=2000)),
 status text not null default 'draft' check(status in ('draft','active','closed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.market_listings enable row level security;
revoke all on public.market_listings from anon,authenticated;
grant select on public.market_listings to anon,authenticated;
grant insert(owner_id,direction,title,description,category,location,business_name,website,status) on public.market_listings to authenticated;
grant update(title,description,category,location,business_name,website,status) on public.market_listings to authenticated;
create policy listing_read on public.market_listings for select to anon,authenticated using(status='active' or owner_id=(select auth.uid()));
create policy listing_insert on public.market_listings for insert to authenticated with check(owner_id=(select auth.uid()));
create policy listing_update on public.market_listings for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create index market_listing_owner_idx on public.market_listings(owner_id);
create index market_listing_search_idx on public.market_listings(direction,category,status,created_at desc);
create trigger market_listing_updated before update on public.market_listings for each row execute function private.set_updated_at();

create table public.market_threads (
 id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.market_listings(id),
 initiator_id uuid not null references auth.users(id),recipient_id uuid not null references auth.users(id),
 initiator_direction text not null check(initiator_direction in ('buy','sell')),
 subject text not null check(char_length(subject) between 3 and 160),created_at timestamptz not null default now(),
 check(initiator_id<>recipient_id),unique(listing_id,initiator_id)
);
alter table public.market_threads enable row level security;
revoke all on public.market_threads from anon,authenticated;
grant select on public.market_threads to authenticated;
grant insert(listing_id,initiator_id,recipient_id,initiator_direction,subject) on public.market_threads to authenticated;
create policy thread_read on public.market_threads for select to authenticated using((select auth.uid()) in (initiator_id,recipient_id));
create policy thread_insert on public.market_threads for insert to authenticated with check(initiator_id=(select auth.uid()) and exists(select 1 from public.market_listings l where l.id=listing_id and l.owner_id=recipient_id and l.status='active' and l.direction<>initiator_direction));
create index market_thread_initiator_idx on public.market_threads(initiator_id);
create index market_thread_recipient_idx on public.market_threads(recipient_id);

create table public.market_messages (
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references public.market_threads(id),
 sender_id uuid not null references auth.users(id),body text not null check(char_length(body) between 1 and 6000),
 amount_minor bigint check(amount_minor between 0 and 100000000000),currency text check(currency in ('CAD','USD','EUR')),
 valid_until date,created_at timestamptz not null default now(),
 check((amount_minor is null and currency is null and valid_until is null) or (amount_minor is not null and currency is not null and valid_until is not null))
);
alter table public.market_messages enable row level security;
revoke all on public.market_messages from anon,authenticated;
grant select on public.market_messages to authenticated;
grant insert(thread_id,sender_id,body,amount_minor,currency,valid_until) on public.market_messages to authenticated;
create policy message_read on public.market_messages for select to authenticated using(exists(select 1 from public.market_threads t where t.id=thread_id and (select auth.uid()) in (t.initiator_id,t.recipient_id)));
create policy message_insert on public.market_messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.market_threads t where t.id=thread_id and (select auth.uid()) in (t.initiator_id,t.recipient_id)));
create index market_message_thread_idx on public.market_messages(thread_id,created_at);
create index market_message_sender_idx on public.market_messages(sender_id);

create function public.search_market_registry(search_direction text, search_category text, search_text text default '', max_results integer default 20)
returns setof public.market_listings language sql stable security invoker set search_path='' as $$
 select l.* from public.market_listings l
 where l.status='active' and l.direction=case when search_direction='sell' then 'buy' when search_direction='buy' then 'sell' else null end
 and l.category=search_category
 and (coalesce(search_text,'')='' or to_tsvector('simple',l.title||' '||l.description) @@ websearch_to_tsquery('simple',left(search_text,300)))
 order by l.created_at desc limit least(100,greatest(1,max_results));
$$;
revoke all on function public.search_market_registry(text,text,text,integer) from public;
grant execute on function public.search_market_registry(text,text,text,integer) to anon,authenticated;
