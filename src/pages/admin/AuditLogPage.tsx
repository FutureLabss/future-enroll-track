import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc('list_audit_logs' as any, { p_limit: 300 }).then(({ data, error }) => {
      if (!error) setLogs(data || []);
      setLoading(false);
    });
  }, []);

  const columns = [
    {
      key: 'user_email',
      header: 'User',
      render: (r: any) => (
        <span className="text-sm text-foreground">{r.user_email || <span className="text-muted-foreground italic">system</span>}</span>
      ),
    },
    { key: 'action', header: 'Action', render: (r: any) => <span className="capitalize font-medium">{r.action?.replace(/_/g, ' ')}</span> },
    { key: 'entity_type', header: 'Entity', render: (r: any) => <span className="capitalize">{r.entity_type}</span> },
    { key: 'entity_id', header: 'Entity ID', render: (r: any) => <span className="text-xs font-mono text-muted-foreground">{r.entity_id?.slice(0, 8) || '—'}</span> },
    { key: 'details', header: 'Details', render: (r: any) => <span className="text-sm text-muted-foreground truncate max-w-[260px] block">{r.details ? JSON.stringify(r.details).slice(0, 80) : '—'}</span> },
    { key: 'created_at', header: 'When', render: (r: any) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" description="System activity and change history with the user who took each action" />
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <DataTable columns={columns} data={logs} emptyMessage="No audit logs yet" />}
    </div>
  );
}
