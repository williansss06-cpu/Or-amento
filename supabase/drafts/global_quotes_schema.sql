-- RASCUNHO PARA HOMOLOGACAO. NAO EXECUTAR EM PRODUCAO SEM REVISAO.
-- Estrutura isolada: nao altera public.proposals nem outras tabelas da loja.
create schema if not exists global_quotes;

create sequence if not exists global_quotes.quote_number_seq start with 1 increment by 1;

create table if not exists global_quotes.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint not null unique default nextval('global_quotes.quote_number_seq'),
  customer_name text not null,
  customer_tax_id text,
  customer_email text,
  customer_phone text,
  contact_name text,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','expired','cancelled')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  calculation_inputs jsonb not null default '{}'::jsonb,
  calculation_results jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_quote_totals check (total_cents = subtotal_cents + shipping_cents - discount_cents)
);
create table if not exists global_quotes.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references global_quotes.quotes(id) on delete cascade,
  position integer not null check (position > 0),
  product_id bigint references public.products(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  unique(quote_id,position)
);
create table if not exists global_quotes.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references global_quotes.quotes(id),
  version integer not null check (version > 0),
  snapshot jsonb not null,
  snapshot_sha256 text not null,
  issued_at timestamptz not null default now(),
  unique(quote_id,version)
);
create table if not exists global_quotes.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null unique references global_quotes.quote_versions(id),
  approver_name text not null,
  approver_email text not null,
  approver_role text,
  accepted_terms boolean not null check (accepted_terms),
  approved_at timestamptz not null default now(),
  source text not null default 'public_link',
  evidence jsonb not null default '{}'::jsonb
);
create table if not exists global_quotes.quote_events (
  id bigint generated always as identity primary key,
  quote_id uuid not null references global_quotes.quotes(id),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
-- Isolamento: schema NAO exposto a Data API; acessos futuros via Edge Functions autenticadas.
revoke all on schema global_quotes from public, anon, authenticated;
revoke all on all tables in schema global_quotes from public, anon, authenticated;
revoke all on all sequences in schema global_quotes from public, anon, authenticated;
alter table global_quotes.quotes enable row level security;
alter table global_quotes.quote_items enable row level security;
alter table global_quotes.quote_versions enable row level security;
alter table global_quotes.quote_approvals enable row level security;
alter table global_quotes.quote_events enable row level security;
-- Nao ha policies publicas: acesso negado por padrao.
-- Implementar emissao de numero e aceite por endpoints server-side com autorizacao,
-- token de aprovacao aleatorio, hash em repouso, expiração e protecao anti-replay.
-- NOTA: quote_number exibido como 'GL' || lpad(quote_number::text,4,'0').
-- A sequencia pode ter lacunas em rollback: unicidade garantida, continuidade sem lacunas nao.
