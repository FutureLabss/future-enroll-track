-- "Hub owners manage members" queries hub_members from inside a hub_members RLS
-- policy, creating infinite recursion on every request that touches get_my_hub_id()
-- (which reads hub_members). This broke list_outstanding_invoices, list_audit_logs,
-- get_finance_summary, and every other hub-scoped RPC.
--
-- All hub_members writes go through SECURITY DEFINER RPCs that bypass RLS:
--   switch_hub_context  — superadmin hub switcher
--   promote_staff_to_admin — admin promotion
-- So this policy is both harmful and unnecessary.
DROP POLICY IF EXISTS "Hub owners manage members" ON public.hub_members;
