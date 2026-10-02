-- RLS decides which role rows an authenticated user may see, but PostgreSQL
-- table privileges are still required before those policies are evaluated.
GRANT SELECT ON TABLE public.user_roles TO authenticated;

-- Keep server-side account and invitation workflows explicit as well.
GRANT ALL ON TABLE public.user_roles TO service_role;
