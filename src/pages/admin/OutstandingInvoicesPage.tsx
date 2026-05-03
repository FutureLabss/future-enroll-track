import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

export default function OutstandingInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'overdue'>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    supabase.rpc('list_outstanding_invoices' as any, { p_only_overdue: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setRows((data as any) || []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const base = tab === 'overdue' ? rows.filter(r => r.is_overdue) : rows;
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter(r =>
      r.full_name?.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.invoice_number?.toLowerCase().includes(s) ||
      r.program_name?.toLowerCase().includes(s)
    );
  }, [rows, tab, q]);

  const totals = rows.reduce((a, r) => {
    a.outstanding += Number(r.outstanding);
    if (r.is_overdue) { a.overdueAmt += Number(r.outstanding); a.overdueCount++; }
    return a;
  }, { outstanding: 0, overdueAmt: 0, overdueCount: 0 });

  return (
    <div>
      <PageHeader title="Outstanding & Overdue" description="Invoices with unpaid balances" />

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
                <TabsTrigger value="all">All Outstanding ({rows.length})</TabsTrigger>
                <TabsTrigger value="overdue">Overdue ({totals.overdueCount})</TabsTrigger>
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
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No invoices</TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.invoice_id}>
                      <TableCell className="font-medium">{r.invoice_number}</TableCell>
                      <TableCell>
                        <div>{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <div>{r.program_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.cohort_label || ''}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmt(r.total_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount_paid)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.outstanding)}</TableCell>
                      <TableCell>{r.next_due_date ? new Date(r.next_due_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        {r.is_overdue ? (
                          <Badge variant="destructive">Overdue {r.days_overdue}d</Badge>
                        ) : (
                          <Badge variant="secondary">Outstanding</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/invoices/${r.invoice_id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
