create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  name text not null,
  email text unique not null,
  categories text[] not null default '{}',
  cities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  trigger text not null,          -- cron | manual | signup
  status text not null,           -- ok | empty | failed
  events jsonb not null default '[]',
  stats jsonb not null default '{}',
  email_status text,
  created_at timestamptz not null default now()
);
create index digests_created_idx on public.digests (created_at desc);
create index digests_subscriber_idx on public.digests (subscriber_id, created_at desc);

alter table public.subscribers enable row level security;
alter table public.digests enable row level security;
-- The API key is only used from server-side route handlers.
create policy "server access" on public.subscribers for all to anon using (true) with check (true);
create policy "server access" on public.digests for all to anon using (true) with check (true);
grant all on public.subscribers to anon;
grant all on public.digests to anon;
