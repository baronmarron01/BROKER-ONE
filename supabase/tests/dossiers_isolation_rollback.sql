begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.dossier',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.owner')::uuid,'dossier-owner-test@example.invalid'),(current_setting('test.other')::uuid,'dossier-other-test@example.invalid');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
insert into public.procurement_dossiers(id,buyer_user_id,title,request_snapshot) values(current_setting('test.dossier')::uuid,auth.uid(),'Dossier de test','{"description":"Besoin synthétique de test"}');
insert into public.procurement_offers(dossier_id,buyer_user_id,supplier_name,currency,base_minor,shipping_minor) values(current_setting('test.dossier')::uuid,auth.uid(),'Entreprise de test','CAD',10000,null);
do $$ begin
 if (select count(*) from public.procurement_offers where dossier_id=current_setting('test.dossier')::uuid)<>1 then raise exception 'OWN_OFFER_NOT_VISIBLE'; end if;
 if not exists(select 1 from public.procurement_offers where dossier_id=current_setting('test.dossier')::uuid and shipping_minor is null) then raise exception 'UNKNOWN_COST_LOST'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.procurement_dossiers where id=current_setting('test.dossier')::uuid) then raise exception 'DOSSIER_LEAK'; end if;
 if exists(select 1 from public.procurement_offers where dossier_id=current_setting('test.dossier')::uuid) then raise exception 'OFFER_LEAK'; end if;
 update public.procurement_offers set notes='forbidden' where dossier_id=current_setting('test.dossier')::uuid;
 if found then raise exception 'CROSS_ACCOUNT_UPDATE'; end if;
 begin
  insert into public.procurement_offers(dossier_id,buyer_user_id,supplier_name,currency) values(current_setting('test.dossier')::uuid,auth.uid(),'Intrusion test','CAD');
  raise exception 'CROSS_ACCOUNT_INSERT';
 exception when foreign_key_violation or insufficient_privilege then null; end;
 begin
  insert into public.procurement_dossiers(buyer_user_id,title,request_snapshot) values(current_setting('test.owner')::uuid,'Intrusion test','{}');
  raise exception 'OWNER_SPOOF';
 exception when insufficient_privilege then null; end;
end $$;
select true as own_read_passed,true as unknown_cost_preserved,true as cross_account_read_blocked,true as cross_account_update_blocked,true as cross_account_insert_blocked,true as owner_spoof_blocked;
rollback;
