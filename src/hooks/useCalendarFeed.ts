import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';

export function calendarFeedUrls(token: string, supabaseUrl: string) {
  const https = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar-feed/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('FutureLabs Classes')}`,
  };
}

// The token is created on first use, so only fetch it once the user asks to sync.
export function useCalendarFeed(enabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['calendar-feed-token', user?.id];

  const { data: token = null, isLoading: loading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_calendar_feed_token', { p_rotate: false });
      if (error) throw error;
      return data as unknown as string;
    },
    enabled: enabled && Boolean(user),
    staleTime: Infinity,
  });

  const rotate = async () => {
    const { data, error } = await untypedRpc('get_calendar_feed_token', { p_rotate: true });
    if (error) throw error;
    queryClient.setQueryData(queryKey, data);
  };

  const urls = token ? calendarFeedUrls(token, import.meta.env.VITE_SUPABASE_URL) : null;

  return { data: urls, token, loading, error, refetch: () => queryClient.invalidateQueries({ queryKey }), rotate };
}
