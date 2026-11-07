begin;
insert into auth.users(id,email) values
('de000000-0000-4000-8000-000000000001','market-a@example.invalid'),
('de000000-0000-4000-8000-000000000002','market-b@example.invalid'),
('de000000-0000-4000-8000-000000000003','market-c@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000001',true);
with x as (insert into public.market_listings(owner_id,direction,title,description,category,business_name,status)
values(auth.uid(),'sell','Laser offer','Laser equipment sale','test-market','Seller','active') returning id)
select set_config('test.offer',(select id::text from x),true);
with x as (insert into public.market_listings(owner_id,direction,title,description,category,business_name,status)
values(auth.uid(),'buy','Laser need','Laser equipment wanted','test-market','Buyer','active') returning id)
select set_config('test.need',(select id::text from x),true);
insert into public.market_listings(owner_id,direction,title,description,category,business_name,status)
values(auth.uid(),'buy','Private need','Laser equipment wanted','test-market','Private','draft');
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000002',true);
do $$
declare l uuid;t uuid;n int;dir text;
begin
select count(*) into n from public.search_market_registry('buy','test-market','',20); if n<>1 then raise exception 'buy lookup wrong';end if;
select count(*) into n from public.search_market_registry('sell','test-market','',20);if n<>1 then raise exception 'sell lookup wrong';end if;
select count(*) into n from public.market_listings where category='test-market';if n<>2 then raise exception 'draft leaked';end if;
foreach dir in array array['buy','sell'] loop
l:=current_setting(case when dir='buy' then 'test.offer' else 'test.need' end)::uuid;
insert into public.market_threads(listing_id,initiator_id,recipient_id,initiator_direction,subject)
values(l,auth.uid(),'de000000-0000-4000-8000-000000000001',dir,'Test exchange') returning id into t;
insert into public.market_messages(thread_id,sender_id,body,amount_minor,currency,valid_until)
values(t,auth.uid(),'First proposal',100000,'CAD','2099-01-01');
begin
insert into public.market_messages(thread_id,sender_id,body)values(t,'de000000-0000-4000-8000-000000000001','Spoof');
raise exception 'spoof accepted';
exception when insufficient_privilege then null;end;
end loop;
end $$;
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000001',true);
do $$ declare t uuid;n int;begin
for t in select id from public.market_threads where recipient_id=auth.uid() loop
insert into public.market_messages(thread_id,sender_id,body)values(t,auth.uid(),'Reply from recipient');
end loop;
select count(*) into n from public.market_messages where body in ('First proposal','Reply from recipient');if n<>4 then raise exception 'reply roundtrip wrong';end if;
begin update public.market_messages set body='Changed';raise exception 'immutable update accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000003',true);
do $$ declare n int;begin
select count(*) into n from public.market_threads where subject='Test exchange';if n<>0 then raise exception 'threads leaked';end if;
select count(*) into n from public.market_messages where body in ('First proposal','Reply from recipient');if n<>0 then raise exception 'messages leaked';end if;
begin
insert into public.market_threads(listing_id,initiator_id,recipient_id,initiator_direction,subject)
values(current_setting('test.offer')::uuid,auth.uid(),'de000000-0000-4000-8000-000000000001','sell','Wrong side');
raise exception 'same side accepted';
exception when insufficient_privilege then null;end;
begin
insert into public.market_threads(listing_id,initiator_id,recipient_id,initiator_direction,subject)
values(current_setting('test.offer')::uuid,auth.uid(),'de000000-0000-4000-8000-000000000002','buy','Wrong recipient');
raise exception 'wrong recipient accepted';
exception when insufficient_privilege then null;end;
end $$;
select 'PASS: both directions, replies, privacy, spoofing, immutable messages, private drafts' as result;
rollback;
