begin;
alter table global_quotes.quotes add column source_lead_id uuid references public.leads(id);
create index quotes_source_lead on global_quotes.quotes(source_lead_id,created_at desc);
create function global_quotes.shop_leads() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
 select l.id,l.company_name,l.tax_id,l.contact_name,l.email,l.phone,l.quantity,l.stage,l.source,l.created_at,
 p.name product_name,p.short_description,p.base_price_cents,p.promotional_price_cents,p.promotion_starts_at,p.promotion_ends_at,
 (select q.id from global_quotes.quotes q where q.source_lead_id=l.id and q.created_by=actor order by q.created_at desc limit 1) quote_id
 from public.leads l left join public.products p on p.id=l.product_id
 where l.source='commercial_calculator' order by l.created_at desc limit 100
 ) x;
 return result;
end $$;
create function global_quotes.save_shop_quote(payload jsonb, lead_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 perform 1 from public.leads where id=lead_id and source='commercial_calculator' for update;
 if not found then raise exception 'Solicitação da loja não encontrada.'; end if;
 result:=global_quotes.save_quote(payload);
 if exists(select 1 from global_quotes.quotes where id=(result->>'id')::uuid and source_lead_id is not null and source_lead_id<>lead_id) then raise exception 'Orçamento já vinculado a outra solicitação.'; end if;
 update global_quotes.quotes set source_lead_id=lead_id where id=(result->>'id')::uuid and created_by=actor;
 return result;
end $$;
create function global_quotes.sync_shop_stage() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source_lead_id is not null and new.status is distinct from old.status and new.status in ('sent','approved') then
  update public.leads set stage=(case when new.status='approved' then 'won' else 'proposal_sent' end)::public.lead_stage,
   won_at=case when new.status='approved' then coalesce(won_at,now()) else won_at end, updated_at=now()
  where id=new.source_lead_id and (new.status='approved' or stage not in ('won','lost'));
 end if;
 return new;
end $$;
create trigger shop_quote_stage after update of status on global_quotes.quotes for each row execute function global_quotes.sync_shop_stage();
create function public.global_shop_leads() returns jsonb language sql security invoker set search_path='' as $$select global_quotes.shop_leads()$$;
create function public.global_save_shop_quote(payload jsonb,lead_id uuid) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.save_shop_quote(payload,lead_id)$$;
revoke all on function global_quotes.shop_leads(),global_quotes.save_shop_quote(jsonb,uuid),global_quotes.sync_shop_stage(),public.global_shop_leads(),public.global_save_shop_quote(jsonb,uuid) from public,anon,authenticated;
grant execute on function global_quotes.shop_leads(),global_quotes.save_shop_quote(jsonb,uuid),public.global_shop_leads(),public.global_save_shop_quote(jsonb,uuid) to authenticated;
commit;
