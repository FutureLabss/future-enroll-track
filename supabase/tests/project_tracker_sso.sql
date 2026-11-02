-- Run only against a migrated local/test LMS database with at least one auth user.
begin;
do $$
declare
  uid uuid;
  result_count integer;
begin
  select id into uid from auth.users limit 1;
  if uid is null then raise exception 'Create a test auth user first'; end if;
  if has_table_privilege('authenticated', 'public.project_tracker_sso_codes', 'SELECT')
    or has_table_privilege('anon', 'public.project_tracker_sso_codes', 'INSERT')
    or has_function_privilege('authenticated', 'public.consume_project_tracker_sso_code(text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.consume_project_tracker_sso_code(text,text)', 'EXECUTE')
  then raise exception 'Browser privileges must be denied'; end if;

  insert into public.project_tracker_sso_codes(code_hash, user_id, redirect_uri)
  values (repeat('a',64), uid, 'https://tracker.example.com/auth/callback');
  if not exists (select 1 from public.project_tracker_sso_codes where code_hash=repeat('a',64)
    and expires_at-created_at=interval '90 seconds')
  then raise exception 'Wrong default lifetime'; end if;
  select count(*) into result_count from public.consume_project_tracker_sso_code(repeat('a',64), 'https://evil.example');
  if result_count <> 0 then raise exception 'Wrong callback accepted'; end if;
  select count(*) into result_count from public.consume_project_tracker_sso_code(repeat('a',64), 'https://tracker.example.com/auth/callback') where user_id=uid;
  if result_count <> 1 then raise exception 'Valid consumption failed'; end if;
  select count(*) into result_count from public.consume_project_tracker_sso_code(repeat('a',64), 'https://tracker.example.com/auth/callback');
  if result_count <> 0 then raise exception 'Replay accepted'; end if;

  insert into public.project_tracker_sso_codes(code_hash,user_id,redirect_uri,created_at,expires_at)
  values(repeat('b',64),uid,'https://tracker.example.com/auth/callback',now()-interval '3 minutes',now()-interval '90 seconds');
  select count(*) into result_count from public.consume_project_tracker_sso_code(repeat('b',64), 'https://tracker.example.com/auth/callback');
  if result_count <> 0 then raise exception 'Expired code accepted'; end if;
end $$;
rollback;
