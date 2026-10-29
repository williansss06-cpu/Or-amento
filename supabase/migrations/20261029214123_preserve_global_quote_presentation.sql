begin;
create or replace function global_quotes.get_quote(quote_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 select (to_jsonb(q)-'request_payload') || jsonb_build_object('presentation',q.request_payload->'presentation','items',(
 select jsonb_agg(to_jsonb(i)-'quote_id' order by position) from global_quotes.quote_items i where i.quote_id=q.id
 )) into result from global_quotes.quotes q where q.id=quote_id and q.created_by=actor;
 if result is null then raise exception 'Proposta nao encontrada.' using errcode='42501'; end if;
 return result;
end $$;
alter table global_quotes.approval_links add column approver_role text,add column customer_reference text;
create function global_quotes.accept_approval_details(token text,approver_name text,approver_email text,accepted_terms boolean,approver_role text default '',customer_reference text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if length(coalesce(approver_role,''))>200 or length(coalesce(customer_reference,''))>200 then raise exception 'Cargo ou referencia acima do limite.' using errcode='22023'; end if;
 result:=global_quotes.accept_approval(token,approver_name,approver_email,accepted_terms);
 if (result->>'already_approved')::boolean=false then
 update global_quotes.approval_links set approver_role=accept_approval_details.approver_role,customer_reference=accept_approval_details.customer_reference where token_hash=encode(extensions.digest(token,'sha256'),'hex');
 end if;
 return result;
end $$;
create function public.global_accept_approval_details(token text,approver_name text,approver_email text,accepted_terms boolean,approver_role text default '',customer_reference text default '') returns jsonb
language sql security invoker set search_path='' as $$select global_quotes.accept_approval_details(token,approver_name,approver_email,accepted_terms,approver_role,customer_reference)$$;
revoke all on function global_quotes.accept_approval_details(text,text,text,boolean,text,text),public.global_accept_approval_details(text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function global_quotes.accept_approval_details(text,text,text,boolean,text,text),public.global_accept_approval_details(text,text,text,boolean,text,text) to anon,authenticated;
create or replace function global_quotes.claim_email(quote_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job global_quotes.email_outbox; approval global_quotes.approval_links;
begin
 select * into job from global_quotes.email_outbox where email_outbox.quote_id=claim_email.quote_id for update;
 if not found or job.status='sent' or (job.status='sending' and job.claimed_at>now()-interval '5 minutes') then return null; end if;
 update global_quotes.email_outbox set status='sending',claimed_at=now(),claim_id=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
 select * into approval from global_quotes.approval_links where id=job.approval_id;
 return jsonb_build_object('id',job.id,'claim_id',job.claim_id,'recipient',job.recipient,'snapshot',approval.snapshot,'snapshot_sha256',approval.snapshot_sha256,'approved_at',approval.approved_at,'approver_name',approval.approver_name,'approver_email',approval.approver_email,'approver_role',approval.approver_role,'customer_reference',approval.customer_reference);
end $$;
commit;
