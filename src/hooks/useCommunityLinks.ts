import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';

export interface CommunityLinks {
  hub_name?: string;
  whatsapp_group_url: string | null;
  slack_invite_url: string | null;
}

// Links for the hubs where the signed-in student has a live enrollment.
export function useMyCommunityLinks() {
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['my-community-links'],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_my_community_links');
      if (error) throw error;
      return (data as unknown as CommunityLinks[]) || [];
    },
  });
  return { data: data ?? [], loading, error, refetch };
}

// The admin's own hub links, for editing.
export function useHubCommunityLinks() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['hub-community-links'],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_hub_community_links');
      if (error) throw error;
      return (data as unknown as CommunityLinks | null) ?? { whatsapp_group_url: null, slack_invite_url: null };
    },
  });
  const save = async (whatsapp: string, slack: string) => {
    const { error } = await untypedRpc('set_hub_community_links', { p_whatsapp_group_url: whatsapp, p_slack_invite_url: slack });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['hub-community-links'] });
  };
  return { data, loading, error, refetch, save };
}
