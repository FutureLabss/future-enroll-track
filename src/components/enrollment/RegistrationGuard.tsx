import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getRegistrationProgress } from '@/lib/registration';

export function RegistrationGuard() {
  const { user, rolesReady, isAdmin, isStaff, isOrganization, isMarketing } = useAuth();
  const bypass = isAdmin || isStaff || isOrganization || isMarketing;
  const { data, isPending, error } = useQuery({
    queryKey: ['registration-progress', user?.id], queryFn: getRegistrationProgress,
    enabled: !!user && rolesReady && !bypass, staleTime: 0,
  });
  if (!rolesReady) return <p className="p-8">Loading account…</p>;
  if (bypass) return <Outlet />;
  if (error) return <p role="alert" className="p-8">Unable to check registration. Please reload to try again.</p>;
  if (isPending) return <p className="p-8">Checking registration…</p>;
  return data?.dashboard_access ? <Outlet /> : <Navigate to="/enroll" replace />;
}
