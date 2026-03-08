import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from('invoices')
        .select('*, enrollments(full_name, email)')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data } = await query;
      setInvoices(data || []);
      setLoading(false);
    };
    fetch();
  }, [statusFilter]);

  const filtered = invoices.filter(i =>
    i.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    i.enrollments?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'invoice_number', header: 'Invoice #' },
    { key: 'student', header: 'Student', render: (r: any) => r.enrollments?.full_name || '—' },
    { key: 'total_amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'currency', header: 'Currency' },
    { key: 'payment_plan_type', header: 'Plan', render: (r: any) => <span className="capitalize">{r.payment_plan_type}</span> },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: 'Created', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Manage invoices and payment plans"
        actions={
          <Button onClick={() => navigate('/admin/invoices/new')}>
            <Plus className="h-4 w-4 mr-2" /> New Invoice
          </Button>
        }
      />

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <DataTable columns={columns} data={filtered} onRowClick={(inv) => navigate(`/admin/invoices/${inv.id}`)} />
      )}
    </div>
  );
}
