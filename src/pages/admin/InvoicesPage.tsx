import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, startOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateMode, setDateMode] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: invoices = [], isLoading: loading } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, enrollments(full_name, email)')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const presetFrom = dateMode !== 'all' && dateMode !== 'custom'
      ? startOfMonth(subMonths(new Date(), Number(dateMode) - 1))
      : null;
    const customFrom = dateMode === 'custom' ? dateFrom : null;
    const customTo = dateMode === 'custom' ? dateTo : null;

    return invoices.filter((i: any) => {
      if (
        !i.invoice_number?.toLowerCase().includes(search.toLowerCase()) &&
        !i.enrollments?.full_name?.toLowerCase().includes(search.toLowerCase())
      ) return false;
      const created = i.created_at ? new Date(i.created_at) : null;
      if (presetFrom && created && created < presetFrom) return false;
      if (customFrom && created && created < customFrom) return false;
      if (customTo && created && created > customTo) return false;
      return true;
    });
  }, [invoices, search, dateMode, dateFrom, dateTo]);

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

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Period</Label>
          <Select value={dateMode} onValueChange={v => { setDateMode(v); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
            <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="1">This month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateMode === 'custom' && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-36 mt-1 justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-36 mt-1 justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd MMM yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} disabled={d => (dateFrom ? d < dateFrom : false)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}

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
