import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function StaffInvoicesAdminPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.email?.toLowerCase() === 'manassehudim@gmail.com';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('staff_invoices' as any)
      .select('*')
      .order('created_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('approve_staff_invoice' as any, { p_id: id });
      if (error) throw error;
      toast.success('Approved — expense recorded');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const reject = async (id: string) => {
    const reason = prompt('Reason for rejection (optional)') || '';
    setBusy(id);
    try {
      const { error } = await supabase.rpc('reject_staff_invoice' as any, { p_id: id, p_reason: reason });
      if (error) throw error;
      toast.success('Rejected');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (!isSuperadmin) return <div className="text-center py-12 text-muted-foreground">Superadmin access required</div>;

  const filterByStatus = (s: string) => rows.filter(r => r.status === s);

  const renderList = (items: any[]) => (
    items.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No invoices</p> :
    <div className="space-y-3">
      {items.map(r => (
        <Card key={r.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{r.staff_name} · ₦{Number(r.amount).toLocaleString()}</p>
              </div>
              <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'}>{r.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {r.description && <p>{r.description}</p>}
            {r.evidence_url && <a className="text-primary underline text-xs flex items-center gap-1" href={r.evidence_url} target="_blank" rel="noreferrer"><FileText className="h-3 w-3" /> View attachment</a>}
            {r.rejection_reason && <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>}
            <p className="text-xs text-muted-foreground">Submitted {new Date(r.created_at).toLocaleString()}</p>
            {r.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                  <Check className="h-4 w-4 mr-1" /> Approve & record expense
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
      <PageHeader title="Staff Invoices" description="Review staff-submitted invoices to the company" />
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
