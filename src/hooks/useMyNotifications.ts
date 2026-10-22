import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface MyNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export function useMyNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['my-notifications', user?.id];

  const { data = [], isLoading: loading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as MyNotification[]) || [];
    },
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const setRead = (ids: string[] | 'all') =>
    queryClient.setQueryData<MyNotification[]>(queryKey, prev =>
      (prev || []).map(n => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n)));

  const markRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) throw error;
    setRead([id]);
  };

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (error) throw error;
    setRead('all');
  };

  const unreadCount = data.filter(n => !n.read).length;

  return { data, loading, error, refetch, markRead, markAllRead, unreadCount };
}
