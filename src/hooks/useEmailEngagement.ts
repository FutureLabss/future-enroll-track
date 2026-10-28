import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';
import type { EngagementStats } from '@/lib/engagement';

// Opens and clicks per digest issue and per onboarding step, from Resend's webhook.
export function useEmailEngagement() {
  const { hubId } = useAuth();
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['email-engagement', hubId],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_email_engagement');
      if (error) throw error;
      return data as { digests: Record<string, EngagementStats>; steps: Record<string, EngagementStats> };
    },
    enabled: Boolean(hubId),
    staleTime: 60_000,
  });
  return { data: { digests: data?.digests ?? {}, steps: data?.steps ?? {} }, loading, error, refetch };
}
