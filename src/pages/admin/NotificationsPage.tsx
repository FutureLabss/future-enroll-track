import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function NotificationsPage() {
  const { data: notifications = [], isLoading: loading } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, message, channel, read, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    staleTime: 30_000,
  });

  const columns = useMemo(() => [
    { key: 'type', header: 'Type', render: (r: any) => <span className="capitalize">{r.type?.replace(/_/g, ' ')}</span> },
    { key: 'title', header: 'Title' },
    { key: 'message', header: 'Message', render: (r: any) => <span className="text-muted-foreground truncate max-w-[300px] block">{r.message}</span> },
    { key: 'channel', header: 'Channel', render: (r: any) => <StatusBadge status={r.channel === 'email' ? 'active' : 'pending'} /> },
    { key: 'read', header: 'Read', render: (r: any) => r.read ? 'Yes' : 'No' },
    { key: 'created_at', header: 'Date', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
  ], []);

  return (
    <div>
      <PageHeader title="Notifications" description="View all system notifications" />
      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : <DataTable columns={columns} data={notifications} emptyMessage="No notifications yet" />
      }
    </div>
  );
}
