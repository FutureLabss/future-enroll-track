import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, Users } from 'lucide-react';

export default function BulkEmailPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [sending, setSending] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    program_id: 'all',
    cohort_id: 'all',
    enrollment_status: 'all',
    audience: 'all' as 'all' | 'outstanding' | 'paid',
  });

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('id, program_name').order('program_name'),
      supabase.from('cohorts').select('id, cohort_label').order('cohort_label'),
    ]).then(([p, c]) => {
      setPrograms(p.data || []);
      setCohorts(c.data || []);
    });
  }, []);

  useEffect(() => {
    let q = supabase.from('enrollments').select('id, email, total_amount, amount_paid, outstanding_balance', { count: 'exact', head: false });
    if (filters.program_id !== 'all') q = q.eq('program_id', filters.program_id);
    if (filters.cohort_id !== 'all') q = q.eq('cohort_id', filters.cohort_id);
    if (filters.enrollment_status !== 'all') q = q.eq('enrollment_status', filters.enrollment_status);
    q.then(({ data }) => {
      let list = (data || []).filter(e => e.email);
      if (filters.audience === 'outstanding') {
        list = list.filter(e => Number(e.outstanding_balance ?? (Number(e.total_amount) - Number(e.amount_paid))) > 0);
      } else if (filters.audience === 'paid') {
        list = list.filter(e => Number(e.outstanding_balance ?? (Number(e.total_amount) - Number(e.amount_paid))) <= 0);
      }
      const unique = new Set(list.map(e => e.email!.toLowerCase()));
      setRecipientCount(unique.size);
    });
  }, [filters]);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    if (recipientCount === 0) {
      toast.error('No recipients match these filters');
      return;
    }
    if (!confirm(`Send "${subject}" to ${recipientCount} recipient(s)?`)) return;

    setSending(true);
    try {
      const payload = {
        subject,
        message,
        filters: {
          program_id: filters.program_id === 'all' ? undefined : filters.program_id,
          cohort_id: filters.cohort_id === 'all' ? undefined : filters.cohort_id,
          enrollment_status: filters.enrollment_status === 'all' ? undefined : filters.enrollment_status,
          audience: filters.audience,
        },
      };
      const { data, error } = await supabase.functions.invoke('send-bulk-email', { body: payload });
      if (error) throw error;
      toast.success(`Sent ${data.sent} email${data.sent === 1 ? '' : 's'}${data.failed ? ` · ${data.failed} failed` : ''}`);
      if (data.failed && data.errors?.length) {
        console.error('Failed emails:', data.errors);
      }
      setSubject('');
      setMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Bulk Email" description="Send announcements to enrolled students" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Compose</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Important: Resumption update" className="mt-1.5" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={10}
                placeholder="Hello {{name}},&#10;&#10;Your outstanding balance is {{outstanding}}.&#10;..."
                className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-1.5">
                Available placeholders: <code className="text-foreground">{'{{name}}'}</code>, <code className="text-foreground">{'{{outstanding}}'}</code>
              </p>
            </div>
            <Button onClick={handleSend} disabled={sending} size="lg">
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending…' : `Send to ${recipientCount}`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <p className="text-2xl font-bold font-heading text-foreground">{recipientCount}</p>
                <p className="text-xs text-muted-foreground">recipients selected</p>
              </div>
            </div>
            <div>
              <Label>Program</Label>
              <Select value={filters.program_id} onValueChange={v => setFilters({ ...filters, program_id: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cohort</Label>
              <Select value={filters.cohort_id} onValueChange={v => setFilters({ ...filters, cohort_id: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cohorts</SelectItem>
                  {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Enrollment status</Label>
              <Select value={filters.enrollment_status} onValueChange={v => setFilters({ ...filters, enrollment_status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment audience</Label>
              <Select value={filters.audience} onValueChange={v => setFilters({ ...filters, audience: v as any })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="outstanding">With outstanding balance</SelectItem>
                  <SelectItem value="paid">Fully paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
