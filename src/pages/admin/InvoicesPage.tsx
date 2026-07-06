import { useState, useMemo, useEffect } from 'react';
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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 50;

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateMode, setDateMode] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { dbDateFrom, dbDateTo } = useMemo(() => {
    if (dateMode === 'custom') {
      return {
        dbDateFrom: dateFrom ? dateFrom.toISOString() : null,
        dbDateTo: dateTo ? new Date(dateTo.getTime() + 86400000).toISOString() : null,
      };
    }
    if (dateMode !== 'all') {
      return {
        dbDateFrom: startOfMonth(subMonths(new Date(), Number(dateMode) - 1)).toISOString(),
        dbDateTo: null,
      };
    }
    return { dbDateFrom: null, dbDateTo: null };
  }, [dateMode, dateFrom, dateTo]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['invoices', statusFilter, dbDateFrom, dbDateTo, debouncedSearch, page],
    queryFn: async () => {
      // Resolve name search to enrollment IDs before querying invoices
      let searchFilter: string | null = null;
      if (debouncedSearch) {
        const term = debouncedSearch.trim();
        const { data: nameMatches } = await supabase
          .from('enrollments')
          .select('id')
          .ilike('full_name', `%${term}%`)
          .limit(200);
        const ids = (nameMatches ?? []).map((e: any) => e.id);
        if (ids.length > 0) {
          searchFilter = `invoice_number.ilike.%${term}%,enrollment_id.in.(${ids.join(',')})`;
        } else {
          searchFilter = `invoice_number.ilike.%${term}%`;
        }
      }

      let query = supabase
        .from('invoices')
        .select('*, enrollments!invoices_enrollment_id_fkey(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dbDateFrom) query = query.gte('created_at', dbDateFrom);
      if (dbDateTo) query = query.lte('created_at', dbDateTo);
      if (searchFilter) query = query.or(searchFilter);

      const { data: rows, error, count } = await query;
      if (error) throw error;
      return { rows: rows || [], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const invoices = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const resetPage = () => setPage(0);

  const columns = useMemo(() => [
    { key: 'invoice_number', header: 'Invoice #' },
    { key: 'student', header: 'Student', render: (r: any) => r.enrollments?.full_name || '—' },
    { key: 'total_amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'currency', header: 'Currency' },
    { key: 'payment_plan_type', header: 'Plan', render: (r: any) => <span className="capitalize">{r.payment_plan_type}</span> },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: 'Created', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
  ], []);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={`${total.toLocaleString()} total`}
        actions={
          <Button onClick={() => navigate('/admin/invoices/new')}>
            <Plus className="h-4 w-4 mr-2" /> New Invoice
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or invoice #..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Period</Label>
          <Select value={dateMode} onValueChange={v => { setDateMode(v); resetPage(); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
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
                  <Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); resetPage(); }} initialFocus className="p-3 pointer-events-auto" />
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
                  <Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); resetPage(); }} disabled={d => (dateFrom ? d < dateFrom : false)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); resetPage(); }}>
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
        <>
          <DataTable columns={columns} data={invoices} onRowClick={(inv) => navigate(`/admin/invoices/${inv.id}`)} />
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {total.toLocaleString()} records
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
