create table public.project_tracker_sso_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null default (now() + interval '90 seconds'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '120 seconds')
);
alter table public.project_tracker_sso_codes enable row level security;
revoke all on public.project_tracker_sso_codes from public, anon, authenticated;
grant select, insert, update, delete on public.project_tracker_sso_codes to service_role;
create index project_tracker_sso_expiry_idx on public.project_tracker_sso_codes(expires_at);

-- Concurrent consumption attempts can update at most one row.
create function public.consume_project_tracker_sso_code(p_code_hash text, p_redirect_uri text)
returns table (user_id uuid)
language sql security invoker set search_path = ''
as $$
  update public.project_tracker_sso_codes
  set used_at = clock_timestamp()
  where code_hash = p_code_hash and redirect_uri = p_redirect_uri
    and used_at is null and expires_at > clock_timestamp()
  returning user_id;
$$;
revoke all on function public.consume_project_tracker_sso_code(text, text) from public, anon, authenticated;
grant execute on function public.consume_project_tracker_sso_code(text, text) to service_role;
