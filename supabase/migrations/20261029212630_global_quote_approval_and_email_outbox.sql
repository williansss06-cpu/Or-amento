begin;
-- Tokens de 256 bits: apenas SHA-256 fica persistido. Links de 7 dias.
create table global_quotes.approval_links (
 id uuid primary key default gen_random_uuid(),quote_id uuid not null references global_quotes.quotes(id),
 token_hash text not null unique, snapshot jsonb not null, snapshot_sha256 text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',
 revoked_at timestamptz,approved_at timestamptz,approver_name text,approver_email text,
 terms text not null default 'Confirmo que li a proposta e aprovo os produtos, valores e condições comerciais apresentados.',
 unique(quote_id,id)
);
create unique index one_active_quote_link on global_quotes.approval_links(quote_id) where revoked_at is null;
create table global_quotes.email_outbox (
 id uuid primary key default gen_random_uuid(),quote_id uuid not null unique references global_quotes.quotes(id),
 approval_id uuid not null unique references global_quotes.approval_links(id),
 recipient text not null default 'globalacessoriosemgeral@gmail.com' check(recipient='globalacessoriosemgeral@gmail.com'),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,claimed_at timestamptz,claim_id uuid,provider_id text,last_error text,
 created_at timestamptz not null default now(),sent_at timestamptz
);
alter table global_quotes.approval_links enable row level security;
alter table global_quotes.email_outbox enable row level security;
revoke all on global_quotes.approval_links,global_quotes.email_outbox from public,anon,authenticated;
create function global_quotes.issue_approval(quote_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); q global_quotes.quotes; token text; snapshot jsonb; link global_quotes.approval_links;
begin
 select * into q from global_quotes.quotes where id=quote_id and created_by=actor for update;
 if not found then raise exception 'Proposta nao encontrada.' using errcode='42501'; end if;
 if q.status not in ('draft','sent') then raise exception 'Proposta nao permite novo link.' using errcode='22023'; end if;
 snapshot:=global_quotes.get_quote(q.id)-'request_payload'-'created_by';
 -- Reemissao revoga o link anterior; nao modifica o conteudo comercial.
 update global_quotes.approval_links set revoked_at=now() where approval_links.quote_id=q.id and revoked_at is null;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into global_quotes.approval_links(quote_id,token_hash,snapshot,snapshot_sha256)
 values(q.id,encode(extensions.digest(token,'sha256'),'hex'),snapshot,encode(extensions.digest(snapshot::text,'sha256'),'hex')) returning * into link;
 update global_quotes.quotes set status='sent' where id=q.id;
 return jsonb_build_object('token',token,'expires_at',link.expires_at,'quote_number',q.quote_number);
end $$;
create function global_quotes.view_approval(token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link global_quotes.approval_links;
begin
 if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Link invalido ou indisponivel.' using errcode='22023'; end if;
 select * into link from global_quotes.approval_links where token_hash=encode(extensions.digest(token,'sha256'),'hex') and revoked_at is null;
 if not found or link.expires_at<=now() then raise exception 'Link invalido ou indisponivel.' using errcode='22023'; end if;
 return jsonb_build_object('quote',link.snapshot,'snapshot_sha256',link.snapshot_sha256,'expires_at',link.expires_at,'approved_at',link.approved_at,'terms',link.terms);
end $$;
create function global_quotes.accept_approval(token text,approver_name text,approver_email text,accepted_terms boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link global_quotes.approval_links; q global_quotes.quotes; name text:=btrim(approver_name); email text:=lower(btrim(approver_email)); qid uuid;
begin
 if accepted_terms is distinct from true or name is null or length(name) not between 2 and 200 or email is null or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 raise exception 'Preencha nome, e-mail e confirme o aceite.' using errcode='22023'; end if;
 if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Link invalido ou indisponivel.' using errcode='22023'; end if;
 select quote_id into qid from global_quotes.approval_links where token_hash=encode(extensions.digest(token,'sha256'),'hex');
 -- Mesma ordem de locks de issue_approval: proposta, depois link.
 select * into q from global_quotes.quotes where id=qid for update;
 select * into link from global_quotes.approval_links where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
 if not found or link.revoked_at is not null then raise exception 'Link invalido ou indisponivel.' using errcode='22023'; end if;
 if link.approved_at is not null then
  return jsonb_build_object('quote_id',link.quote_id,'approved_at',link.approved_at,'already_approved',true);
 end if;
 if link.expires_at<=now() or q.status<>'sent' then raise exception 'Link expirado ou proposta indisponivel.' using errcode='22023'; end if;
 update global_quotes.approval_links set approved_at=now(),approver_name=name,approver_email=email where id=link.id;
 update global_quotes.quotes set status='approved' where id=link.quote_id;
 insert into global_quotes.email_outbox(quote_id,approval_id) values(link.quote_id,link.id);
 return jsonb_build_object('quote_id',link.quote_id,'approved_at',now(),'already_approved',false);
end $$;
create function global_quotes.approval_status(quote_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=global_quotes.require_staff(); result jsonb;
begin
 if not exists(select 1 from global_quotes.quotes where id=quote_id and created_by=actor) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select jsonb_build_object('approved_at',a.approved_at,'approver_name',a.approver_name,'approver_email',a.approver_email,'expires_at',a.expires_at,'email_status',e.status,'email_error',e.last_error,'sent_at',e.sent_at)
 into result from global_quotes.approval_links a left join global_quotes.email_outbox e on e.approval_id=a.id where a.quote_id=approval_status.quote_id and a.revoked_at is null;
 return coalesce(result,'{}'::jsonb);
end $$;
-- Worker server-side: nenhuma chave de provedor no navegador.
create function global_quotes.claim_email(quote_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job global_quotes.email_outbox; approval global_quotes.approval_links;
begin
 select * into job from global_quotes.email_outbox where email_outbox.quote_id=claim_email.quote_id for update;
 if not found or job.status='sent' or (job.status='sending' and job.claimed_at>now()-interval '5 minutes') then return null; end if;
 update global_quotes.email_outbox set status='sending',claimed_at=now(),claim_id=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
 select * into approval from global_quotes.approval_links where id=job.approval_id;
 return jsonb_build_object('id',job.id,'claim_id',job.claim_id,'recipient',job.recipient,'snapshot',approval.snapshot,'snapshot_sha256',approval.snapshot_sha256,'approved_at',approval.approved_at,'approver_name',approval.approver_name,'approver_email',approval.approver_email);
end $$;
create function global_quotes.finish_email(job_id uuid,lease_id uuid,provider_id text,error_message text) returns void
language sql security invoker set search_path='' as $$
 update global_quotes.email_outbox set status=case when error_message is null then 'sent' else 'failed' end,
 sent_at=case when error_message is null then now() else null end,provider_id=finish_email.provider_id,last_error=left(error_message,500),claim_id=null
 where id=job_id and status='sending' and claim_id=lease_id;
$$;
create function public.global_issue_approval(quote_id uuid) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.issue_approval(quote_id)$$;
create function public.global_view_approval(token text) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.view_approval(token)$$;
create function public.global_accept_approval(token text,approver_name text,approver_email text,accepted_terms boolean) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.accept_approval(token,approver_name,approver_email,accepted_terms)$$;
create function public.global_approval_status(quote_id uuid) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.approval_status(quote_id)$$;
create function public.global_claim_email(quote_id uuid) returns jsonb language sql security invoker set search_path='' as $$select global_quotes.claim_email(quote_id)$$;
create function public.global_finish_email(job_id uuid,lease_id uuid,provider_id text,error_message text) returns void language sql security invoker set search_path='' as $$select global_quotes.finish_email(job_id,lease_id,provider_id,error_message)$$;
revoke all on all functions in schema global_quotes from public,anon,authenticated;
-- Restaura grants estreitos da etapa anterior.
grant execute on function global_quotes.save_quote(jsonb),global_quotes.list_quotes(integer),global_quotes.get_quote(uuid),global_quotes.issue_approval(uuid),global_quotes.approval_status(uuid) to authenticated;
grant usage on schema global_quotes to anon,service_role;
grant execute on function global_quotes.view_approval(text),global_quotes.accept_approval(text,text,text,boolean) to anon,authenticated;
grant select,update on global_quotes.email_outbox to service_role;
grant select on global_quotes.approval_links to service_role;
grant execute on function global_quotes.claim_email(uuid),global_quotes.finish_email(uuid,uuid,text,text) to service_role;
revoke all on function public.global_issue_approval(uuid),public.global_view_approval(text),public.global_accept_approval(text,text,text,boolean),public.global_approval_status(uuid),public.global_claim_email(uuid),public.global_finish_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.global_issue_approval(uuid),public.global_approval_status(uuid) to authenticated;
grant execute on function public.global_view_approval(text),public.global_accept_approval(text,text,text,boolean) to anon,authenticated;
grant execute on function public.global_claim_email(uuid),public.global_finish_email(uuid,uuid,text,text) to service_role;
commit;
