-- AuthProvider hydrates these records immediately after sign-in. PostgreSQL
-- privileges must permit the query before each table's RLS policies can apply.
GRANT SELECT ON TABLE public.superadmins TO authenticated;
GRANT SELECT ON TABLE public.hub_members TO authenticated;

-- Keep privileged server-side account workflows explicit.
GRANT ALL ON TABLE public.superadmins TO service_role;
GRANT ALL ON TABLE public.hub_members TO service_role;
