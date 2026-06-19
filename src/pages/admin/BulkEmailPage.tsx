import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Send, Users, Upload, X, FileText } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { parseCSV, type CSVContact } from '@/lib/csv';

type AudienceType = 'students' | 'staff' | 'students_and_staff';
type ImportedContact = CSVContact;

export default function BulkEmailPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [audienceType, setAudienceType] = useState<AudienceType>('students');
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Student count
  useEffect(() => {
    if (audienceType === 'staff') { setStudentCount(0); return; }
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
      setStudentCount(new Set(list.map(e => e.email!.toLowerCase())).size);
    });
  }, [filters, audienceType]);

  // Staff count
  useEffect(() => {
    if (audienceType === 'students') { setStaffCount(0); return; }
    supabase.from('staff').select('id, email').eq('active', true).then(({ data }) => {
      const emails = (data || []).filter(s => s.email).map(s => s.email!.toLowerCase());
      setStaffCount(new Set(emails).size);
    });
  }, [audienceType]);

  const importedUnique = new Set(importedContacts.map(c => c.email)).size;
  const recipientCount = studentCount + staffCount + importedUnique;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const contacts = parseCSV(ev.target?.result as string);
        if (!contacts.length) {
          setImportError('No valid email addresses found. Ensure the file has an "email" column.');
          return;
        }
        setImportedContacts(contacts);
        toast.success(`Imported ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`);
      } catch {
        setImportError('Could not parse file. Use CSV format with email and name columns.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendClick = () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    if (recipientCount === 0) {
      toast.error('No recipients match these filters');
      return;
    }
    setConfirmOpen(true);
  };

  const doSend = async () => {
    setSending(true);
    try {
      const payload = {
        subject,
        message,
        audience_type: audienceType,
        imported_contacts: importedContacts,
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
      if (data.failed) toast.error(`${data.failed} email(s) failed to send`);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <div>
      <PageHeader title="Bulk Email" description="Send announcements to students, staff, or imported contacts" />

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
            <Button onClick={handleSendClick} disabled={sending} size="lg">
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending…' : `Send to ${recipientCount}`}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold font-heading text-foreground">{recipientCount}</p>
                  <p className="text-xs text-muted-foreground">recipients selected</p>
                  {(studentCount > 0 || staffCount > 0 || importedUnique > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {studentCount > 0 && <Badge variant="outline" className="text-xs">{studentCount} students</Badge>}
                      {staffCount > 0 && <Badge variant="outline" className="text-xs">{staffCount} staff</Badge>}
                      {importedUnique > 0 && <Badge variant="outline" className="text-xs">{importedUnique} imported</Badge>}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Recipient type</Label>
                <Select value={audienceType} onValueChange={v => setAudienceType(v as AudienceType)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="students">Students only</SelectItem>
                    <SelectItem value="staff">Staff only</SelectItem>
                    <SelectItem value="students_and_staff">Students & Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {audienceType !== 'staff' && (
                <>
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
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Import Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Upload a CSV with <code>email</code> and optional <code>name</code> columns to add external contacts (e.g. marketing leads).</p>

              {importedContacts.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{importedContacts.length} contacts imported</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {importedContacts.slice(0, 2).map(c => c.name || c.email).join(', ')}
                        {importedContacts.length > 2 && ` +${importedContacts.length - 2} more`}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => setImportedContacts([])}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />

              {importError && <p className="text-xs text-destructive">{importError}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Bulk Email?</AlertDialogTitle>
          <AlertDialogDescription>
            Send "<strong>{subject}</strong>" to {recipientCount} recipient{recipientCount === 1 ? '' : 's'}? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={doSend}>
            <Send className="h-4 w-4 mr-1.5" /> Send
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
