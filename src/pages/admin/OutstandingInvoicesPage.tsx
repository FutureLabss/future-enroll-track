import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Wallet, Clock } from 'lucide-react';
import { usePaymentFollowups } from '@/hooks/usePaymentFollowups';
import { PaymentFollowupDialog, type FollowupTarget } from '@/components/finance/PaymentFollowupDialog';
import { FOLLOWUP_LABELS, daysAgo, followupBucket, followupSummary } from '@/lib/followups';

const FOLLOWUP_COLOURS: Record<string, string> = {
  promised: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  broken: 'bg-warning/15 text-warning border-warning/30',
  written_off: 'bg-muted text-muted-foreground border-muted',
};

type Row = {
  invoice_id: string;
  invoice_number: string;
  enrollment_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  program_name: string | null;
  cohort_label: string | null;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  next_due_date: string | null;
  earliest_overdue_date: string | null;
  days_overdue: number;
  is_overdue: boolean;
  invoice_status: string;
};

type Collection = {
  enrollment_id: string;
  access_paused: boolean;
  pause_date: string | null;
  on_hold: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  messages_sent: number;
};

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

export default function OutstandingInvoicesPage() {
  const [tab, setTab] = useState<'all' | 'overdue' | 'promised' | 'written_off'>('overdue');
  const [followup, setFollowup] = useState<FollowupTarget | null>(null);
  const { data: followups, log } = usePaymentFollowups();
  const [q, setQ] = useState('');

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['outstanding-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_outstanding_invoices' as any, { p_only_overdue: false });
      if (error) throw error;
      return (data as Row[]) || [];
    },
    staleTime: 30_000,
  });

  const { data: collection = new Map<string, Collection>() } = useQuery({
    queryKey: ['collection-details'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collection_details' as any);
      if (error) throw error;
      return new Map(((data as Collection[]) || []).map(c => [c.enrollment_id, c]));
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const bucket = (r: Row) => followupBucket(followups.get(r.enrollment_id));
    const base = (tab === 'written_off' ? rows.filter(r => bucket(r) === 'written_off')
      : tab === 'promised' ? rows.filter(r => bucket(r) === 'promised')
      : rows.filter(r => bucket(r) !== 'written_off' && (tab === 'all' || r.is_overdue)))
      .slice().sort((a, b) => (b.days_overdue - a.days_overdue) || (Number(b.outstanding) - Number(a.outstanding)));
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter(r =>
      r.full_name?.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.invoice_number?.toLowerCase().includes(s) ||
      r.program_name?.toLowerCase().includes(s)
    );
  }, [rows, tab, q, followups]);

  const counts = rows.reduce((a, r) => {
    a[followupBucket(followups.get(r.enrollment_id))]++;
    return a;
  }, { promised: 0, broken: 0, written_off: 0, none: 0 });

  const totals = rows.filter(r => !followups.get(r.enrollment_id)?.written_off).reduce((a, r) => {
    a.outstanding += Number(r.outstanding);
    if (r.is_overdue) { a.overdueAmt += Number(r.outstanding); a.overdueCount++; }
    return a;
  }, { outstanding: 0, overdueAmt: 0, overdueCount: 0 });

  return (
    <div>
      <PageHeader title="Outstanding & Overdue" description="Unpaid balances, most overdue first. Log calls and promises to pay; overdue emails pause while a promise stands." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Outstanding" value={fmt(totals.outstanding)} icon={Wallet} />
        <StatCard title="Overdue Amount" value={fmt(totals.overdueAmt)} icon={AlertTriangle} />
        <StatCard title="Overdue Invoices" value={totals.overdueCount} icon={Clock} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
              <TabsList>
                <TabsTrigger value="overdue">Overdue ({totals.overdueCount})</TabsTrigger>
                <TabsTrigger value="all">All Outstanding ({rows.length - counts.written_off})</TabsTrigger>
                <TabsTrigger value="promised">Promised ({counts.promised})</TabsTrigger>
                <TabsTrigger value="written_off">Written off ({counts.written_off})</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input placeholder="Search name, email, invoice…" value={q} onChange={e => setQ(e.target.value)} className="sm:max-w-xs" />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No invoices</TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.invoice_id}>
                      <TableCell className="font-medium">{r.invoice_number}</TableCell>
                      <TableCell>
                        <Link to={`/admin/enrollments/${r.enrollment_id}`} className="font-medium hover:underline text-foreground">
                          {r.full_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <div>{r.program_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.cohort_label || ''}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmt(r.total_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount_paid)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.outstanding)}</TableCell>
                      <TableCell>{r.next_due_date ? new Date(r.next_due_date).toLocaleDateString('en-NG') : '—'}</TableCell>
                      <TableCell>
                        {r.is_overdue ? (
                          <div className="space-y-1">
                            <Badge variant="destructive">Overdue {r.days_overdue}d</Badge>
                            {(() => {
                              const c = collection.get(r.enrollment_id);
                              if (!c || c.on_hold) return null;
                              if (c.access_paused) return <div className="text-xs font-medium text-destructive">Access paused</div>;
                              if (c.pause_date && r.days_overdue >= 7) return <div className="text-xs text-muted-foreground">Access pauses {new Date(`${c.pause_date}T00:00:00`).toLocaleDateString('en-NG')}</div>;
                              return null;
                            })()}
                          </div>
                        ) : (
                          <Badge variant="secondary">Outstanding</Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-40">
                        {(() => {
                          const st = followups.get(r.enrollment_id);
                          const bucket = followupBucket(st);
                          const summary = followupSummary(st);
                          return (
                            <div className="space-y-1">
                              {summary && <Badge variant="outline" className={FOLLOWUP_COLOURS[bucket]}>{summary}</Badge>}
                              <div className="text-xs text-muted-foreground">
                                {st ? `${FOLLOWUP_LABELS[st.last_kind]} ${daysAgo(st.last_at)}` : 'Not contacted'}
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setFollowup({
                            enrollment_id: r.enrollment_id, full_name: r.full_name, email: r.email, phone: r.phone,
                            outstanding: Number(r.outstanding), days_overdue: r.days_overdue,
                            guardian_name: collection.get(r.enrollment_id)?.guardian_name,
                            guardian_phone: collection.get(r.enrollment_id)?.guardian_phone,
                          })}>Follow up</Button>
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/admin/invoices/${r.invoice_id}`}>View</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {followup && (
        <PaymentFollowupDialog
          target={followup}
          state={followups.get(followup.enrollment_id)}
          onClose={() => setFollowup(null)}
          onLog={input => log(followup.enrollment_id, input)}
        />
      )}
    </div>
  );
}
