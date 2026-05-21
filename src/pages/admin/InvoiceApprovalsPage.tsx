import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function InvoiceApprovalsPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.email?.toLowerCase() === 'manassehudim@gmail.com';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data: requests } = await supabase
      .from('invoice_change_requests' as any)
      .select('*, invoices:invoice_id(invoice_number, enrollments(full_name, email))')
      .order('created_at', { ascending: false });

    const userIds = [...new Set((requests || []).map((r: any) => r.requested_by).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setRows((requests || []).map((r: any) => ({ ...r, requester: profileMap.get(r.requested_by) || null })));
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('approve_invoice_change' as any, { p_request_id: id });
      if (error) throw error;
      toast.success('Approved & applied');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const reject = async (id: string) => {
    const reason = prompt('Reason for rejection (optional)') || '';
    setBusy(id);
    try {
      const { error } = await supabase.rpc('reject_invoice_change' as any, { p_request_id: id, p_reason: reason });
      if (error) throw error;
      toast.success('Rejected');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (!isSuperadmin) return <div className="text-center py-12 text-muted-foreground">Superadmin access required</div>;

  const filterByStatus = (s: string) => rows.filter(r => r.status === s);

  const renderList = (items: any[]) => (
    items.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No requests</p> :
    <div className="space-y-3">
      {items.map(r => (
        <Card key={r.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {r.invoices?.invoice_number || '—'}
                  <Badge variant="outline" className="ml-2 capitalize">{r.action}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {r.invoices?.enrollments?.full_name} · {r.invoices?.enrollments?.email}
                </p>
              </div>
              <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'}>{r.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {r.action === 'edit' && r.payload && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 flex justify-between text-xs font-medium">
                  <span>Proposed Total</span>
                  <span>₦{Number(r.payload.total_amount || 0).toLocaleString()}</span>
                </div>
                {r.payload.installments?.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-t border-border bg-muted/20">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Due Date</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Paid At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payload.installments.map((inst: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5">{inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '—'}</td>
                          <td className="px-3 py-1.5 text-right font-mono">₦{Number(inst.amount || 0).toLocaleString()}</td>
                          <td className="px-3 py-1.5">
                            <span className={`capitalize font-medium ${inst.status === 'paid' ? 'text-success' : 'text-muted-foreground'}`}>
                              {inst.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {r.reason && <p className="text-xs text-destructive">Rejection reason: {r.reason}</p>}
            <p className="text-xs text-muted-foreground">
              Requested by <span className="font-medium text-foreground">{r.requester?.full_name || r.requester?.email || 'Unknown admin'}</span>
              {' · '}{new Date(r.created_at).toLocaleString()}
            </p>
            {r.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => reject(r.id)}>
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader title="Invoice Change Approvals" description="Review admin-submitted edit & delete requests" />
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({filterByStatus('pending').length})</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">{renderList(filterByStatus('pending'))}</TabsContent>
          <TabsContent value="approved" className="mt-4">{renderList(filterByStatus('approved'))}</TabsContent>
          <TabsContent value="rejected" className="mt-4">{renderList(filterByStatus('rejected'))}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
