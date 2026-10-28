import { useMemo, useRef, useState } from 'react';
import { useEmailContacts, type EmailContact, type EmailSuppression } from '@/hooks/useEmailContacts';
import { parseCSV, type CSVContact } from '@/lib/csv';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Upload, UserX } from 'lucide-react';
import { toast } from 'sonner';

export function EmailContactsPanel() {
  const { data, loading, importContacts, removeContact, removeList } = useEmailContacts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [listName, setListName] = useState('Past students');
  const [pending, setPending] = useState<CSVContact[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [confirmList, setConfirmList] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(String(ev.target?.result || ''));
      if (!rows.length) {
        toast.error('No email addresses found. The file needs an "email" column (and optionally "name").');
        return;
      }
      setPending(rows);
      setFileName(file.name);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await importContacts(listName.trim(), pending);
      toast.success(`${r.added} added to “${listName.trim()}”${r.already_listed ? ` · ${r.already_listed} already on it` : ''}`);
      setPending([]);
      setFileName('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const suppressed = useMemo(() => new Set(data.suppressions.map(s => s.normalized_email)), [data.suppressions]);
  const shown = listFilter === 'all' ? data.contacts : data.contacts.filter(c => c.list_name === listFilter);

  const contactColumns = useMemo(() => [
    { key: 'full_name', header: 'Name', render: (r: EmailContact) => r.full_name || <span className="text-muted-foreground">—</span> },
    { key: 'email', header: 'Email', render: (r: EmailContact) => (
      <span className="flex items-center gap-2">
        {r.email}
        {suppressed.has(r.email.trim().toLowerCase()) && <Badge variant="outline" className="text-xs">unsubscribed</Badge>}
      </span>
    ) },
    { key: 'list_name', header: 'List' },
    { key: 'created_at', header: 'Added', render: (r: EmailContact) => new Date(r.created_at).toLocaleDateString('en-NG') },
    { key: 'actions', header: '', render: (r: EmailContact) => (
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove ${r.email}`}
        onClick={() => removeContact(r.id).then(() => toast.success('Removed')).catch(e => toast.error(e.message))}>
        <Trash2 className="h-4 w-4" />
      </Button>
    ) },
  ], [suppressed, removeContact]);

  const suppressionColumns = useMemo(() => [
    { key: 'normalized_email', header: 'Email' },
    { key: 'reason', header: 'Reason', render: (r: EmailSuppression) => <span className="capitalize">{r.reason}</span> },
    { key: 'created_at', header: 'Since', render: (r: EmailSuppression) => new Date(r.created_at).toLocaleDateString('en-NG') },
  ], []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" />Import contacts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Add to list</Label>
              <Input value={listName} onChange={e => setListName(e.target.value)} list="email-list-names" className="mt-1.5" placeholder="e.g. Past students 2025" />
              <datalist id="email-list-names">{data.lists.map(l => <option key={l.name} value={l.name} />)}</datalist>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />Choose CSV file
            </Button>
            <p className="text-xs text-muted-foreground">Columns: <code>email</code> (required) and <code>name</code>. Duplicates are skipped.</p>
            {pending.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm"><span className="font-medium">{pending.length}</span> addresses in {fileName}</p>
                <Button className="w-full" disabled={importing || !listName.trim()} onClick={doImport}>
                  {importing ? 'Importing…' : `Import to “${listName.trim() || '…'}”`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Lists</CardTitle></CardHeader>
          <CardContent>
            {data.lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts imported yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.lists.map(l => (
                  <li key={l.name} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium">{l.name}</span>
                    <span className="flex items-center gap-3">
                      <Badge variant="secondary">{l.count}</Badge>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmList(l.name)}>Delete list</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-semibold">Contacts</h2>
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {data.lists.map(l => <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading
          ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          : <DataTable columns={contactColumns} data={shown} searchable searchPlaceholder="Search contacts…" emptyMessage="No contacts" />}
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold"><UserX className="h-4 w-4" />Unsubscribed</h2>
        <p className="mb-3 text-sm text-muted-foreground">These addresses opted out and are never sent the digest or newsletters, whichever list or lead record they're on.</p>
        <DataTable columns={suppressionColumns} data={data.suppressions} emptyMessage="Nobody has unsubscribed" />
      </section>

      <AlertDialog open={confirmList !== null} onOpenChange={o => !o && setConfirmList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmList}”?</AlertDialogTitle>
            <AlertDialogDescription>Removes every contact on this list. People who unsubscribed stay unsubscribed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmList && removeList(confirmList).then(() => toast.success('List deleted')).catch(e => toast.error(e.message))}>
              Delete list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
