-- Candidato de homologacao; NAO aplicado. Executar atomicamente apos testes isolados.
-- Nao modifica objetos existentes da loja. Falha se o schema ja existir (evita drift silencioso).
begin;
create schema global_quotes;
revoke all on schema global_quotes from public, anon, authenticated;
create sequence global_quotes.quote_number_seq;
create table global_quotes.quotes (
 id uuid primary key,
 quote_number bigint not null unique default nextval('global_quotes.quote_number_seq'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 customer_name text not null check(length(customer_name) between 1 and 200),
 customer_tax_id text not null default '' check(length(customer_tax_id)<=30),
 customer_email text not null default '' check(length(customer_email)<=254),
 customer_phone text not null default '' check(length(customer_phone)<=30),
 contact_name text not null default '' check(length(contact_name)<=200),
 notes text not null default '' check(length(notes)<=5000),
 status text not null default 'draft' check(status in ('draft','sent','approved','rejected','expired','cancelled')),
 subtotal_cents bigint not null check(subtotal_cents between 0 and 100000000000),
 shipping_cents bigint not null check(shipping_cents between 0 and 100000000000),
 discount_cents bigint not null check(discount_cents between 0 and 100000000000),
 total_cents bigint not null check(total_cents between 0 and 100000000000),
 request_payload jsonb not null,
 constraint valid_totals check(total_cents=subtotal_cents+shipping_cents-discount_cents)
);
create index quotes_owner_date on global_quotes.quotes(created_by,created_at desc,id);
create table global_quotes.quote_items (
 quote_id uuid not null references global_quotes.quotes(id),
 position integer not null check(position between 1 and 100),
 description text not null check(length(description) between 1 and 500),
 quantity bigint not null check(quantity between 1 and 1000000),
 unit_price_cents bigint not null check(unit_price_cents between 0 and 100000000000),
 line_total_cents bigint not null check(line_total_cents between 0 and 100000000000),
 primary key(quote_id,position),
 check(line_total_cents=quantity*unit_price_cents)
);
alter table global_quotes.quotes enable row level security;
alter table global_quotes.quote_items enable row level security;
revoke all on all tables in schema global_quotes from public,anon,authenticated;
revoke all on all sequences in schema global_quotes from public,anon,authenticated;
-- Acesso somente por funcoes estreitas. Nenhum INSERT/UPDATE direto, inclusive staff.
create function global_quotes.require_staff() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and active and role::text in ('owner','admin')) then
   raise exception 'Acesso restrito a administradores ativos.' using errcode='42501';
 end if;
 return actor;
end $$;
create function global_quotes.save_quote(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := global_quotes.require_staff();
 q global_quotes.quotes;
 item jsonb; items jsonb := payload->'items';
 item_count integer; idx integer := 0; qty bigint; price bigint; line bigint;
 subtotal bigint := 0; shipping bigint; discount bigint; request_id uuid;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>100000 then
  raise exception 'Proposta invalida.' using errcode='22023';
 end if;
 request_id := (payload->>'request_id')::uuid;
 if request_id is null then raise exception 'Identificador obrigatorio.' using errcode='22023'; end if;
 -- Mesmo UUID concorrente serializa; retry nao emite outra proposta.
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into q from global_quotes.quotes where id=request_id;
 if found then
  if q.created_by<>actor then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if q.request_payload<>payload then raise exception 'Identificador reutilizado com outros dados.' using errcode='22023'; end if;
  return jsonb_build_object('id',q.id,'quote_number',q.quote_number,'total_cents',q.total_cents,'created_at',q.created_at);
 end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Produtos obrigatorios.' using errcode='22023'; end if;
 item_count := jsonb_array_length(items);
 if item_count<1 or item_count>100 then raise exception 'Informe de 1 a 100 produtos.' using errcode='22023'; end if;
 if coalesce(payload->>'shipping_cents','') !~ '^\d{1,12}$' or coalesce(payload->>'discount_cents','') !~ '^\d{1,12}$' then
  raise exception 'Frete ou desconto invalido.' using errcode='22023';
 end if;
 shipping := (payload->>'shipping_cents')::bigint;
 discount := (payload->>'discount_cents')::bigint;
 for item in select value from jsonb_array_elements(items) loop
  if coalesce(item->>'quantity','') !~ '^\d{1,7}$' or coalesce(item->>'unit_price_cents','') !~ '^\d{1,12}$' then
   raise exception 'Quantidade ou preco invalido.' using errcode='22023';
  end if;
  qty := (item->>'quantity')::bigint; price := (item->>'unit_price_cents')::bigint;
  if qty<1 or qty>1000000 or price>100000000000 or length(btrim(coalesce(item->>'description',''))) not between 1 and 500 then
   raise exception 'Produto invalido.' using errcode='22023';
  end if;
  line:=qty*price;
  if line>100000000000 then raise exception 'Subtotal excede limite.' using errcode='22023'; end if;
  subtotal:=subtotal+line;
 end loop;
 if subtotal+shipping-discount not between 0 and 100000000000 then raise exception 'Total ou desconto invalido.' using errcode='22023'; end if;
 insert into global_quotes.quotes(id,created_by,customer_name,customer_tax_id,customer_email,customer_phone,contact_name,notes,subtotal_cents,shipping_cents,discount_cents,total_cents,request_payload)
 values(request_id,actor,btrim(coalesce(payload->>'customer_name','')),coalesce(payload->>'customer_tax_id',''),coalesce(payload->>'customer_email',''),coalesce(payload->>'customer_phone',''),coalesce(payload->>'contact_name',''),coalesce(payload->>'notes',''),subtotal,shipping,discount,subtotal+shipping-discount,payload)
 returning * into q;
 for item in select value from jsonb_array_elements(items) loop
  idx:=idx+1;qty:=(item->>'quantity')::bigint;price:=(item->>'unit_price_cents')::bigint;
  insert into global_quotes.quote_items values(q.id,idx,btrim(item->>'description'),qty,price,qty*price);
 end loop;
 return jsonb_build_object('id',q.id,'quote_number',q.quote_number,'total_cents',q.total_cents,'created_at',q.created_at);
end $$;
create function global_quotes.list_quotes(page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 if page_offset is null or page_offset<0 then raise exception 'Pagina invalida.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) into result from (
  select id,quote_number,customer_name,status,total_cents,created_at from global_quotes.quotes
  where created_by=actor order by created_at desc,id limit 50 offset page_offset
 ) rows;
 return result;
end $$;
create function global_quotes.get_quote(quote_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 select (to_jsonb(q)-'request_payload') || jsonb_build_object('items',(
  select jsonb_agg(to_jsonb(i)-'quote_id' order by position) from global_quotes.quote_items i where i.quote_id=q.id
 )) into result from global_quotes.quotes q where q.id=quote_id and q.created_by=actor;
 if result is null then raise exception 'Proposta nao encontrada.' using errcode='42501'; end if;
 return result;
end $$;
-- Wrappers sem privilegios elevados no schema exposto.
create function public.global_save_quote(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select global_quotes.save_quote(payload)$$;
create function public.global_list_quotes(page_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select global_quotes.list_quotes(page_offset)$$;
create function public.global_get_quote(quote_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select global_quotes.get_quote(quote_id)$$;
revoke all on all functions in schema global_quotes from public,anon,authenticated;
grant usage on schema global_quotes to authenticated;
grant execute on function global_quotes.save_quote(jsonb),global_quotes.list_quotes(integer),global_quotes.get_quote(uuid) to authenticated;
revoke all on function public.global_save_quote(jsonb),public.global_list_quotes(integer),public.global_get_quote(uuid) from public,anon,authenticated;
grant execute on function public.global_save_quote(jsonb),public.global_list_quotes(integer),public.global_get_quote(uuid) to authenticated;
commit;
