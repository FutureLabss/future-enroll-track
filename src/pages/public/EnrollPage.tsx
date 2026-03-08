import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle, Upload, GraduationCap } from 'lucide-react';

export default function EnrollPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceFileName, setEvidenceFileName] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    program_id: '',
    cohort_id: '',
    total_amount: '',
  });

  useEffect(() => {
    supabase.from('programs').select('*').eq('active', true).then(({ data }) => setPrograms(data || []));
    supabase.from('cohorts').select('*').then(({ data }) => setCohorts(data || []));
  }, []);

  const filteredCohorts = cohorts.filter(c => c.program_id === form.program_id);
  const selectedProgram = programs.find(p => p.id === form.program_id);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('payment-evidence')
      .upload(fileName, file);

    if (error) {
      toast.error('Upload failed: ' + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('payment-evidence')
      .getPublicUrl(data.path);

    setEvidenceUrl(urlData.publicUrl);
    setEvidenceFileName(file.name);
    setUploading(false);
    toast.success('Receipt uploaded');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceUrl) {
      toast.error('Please upload your payment receipt');
      return;
    }

    setLoading(true);

    try {
      const totalAmount = parseFloat(form.total_amount);
      if (isNaN(totalAmount) || totalAmount <= 0) throw new Error('Invalid amount');

      const { data: enrollment, error } = await supabase.from('enrollments').insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        program_id: form.program_id,
        cohort_id: form.cohort_id || null,
        total_amount: totalAmount,
        payment_type: 'offline',
        payment_evidence_url: evidenceUrl,
        verification_status: 'pending',
        enrollment_status: 'pending',
      } as any).select().single();

      if (error) throw error;

      // Save custom field values
      if (enrollment && customFields.length > 0) {
        const fieldValues = customFields
          .filter(f => customValues[f.key])
          .map(f => ({
            enrollment_id: enrollment.id,
            field_id: f.id,
            value: customValues[f.key],
          }));

        if (fieldValues.length > 0) {
          const { error: fvError } = await supabase.from('field_values').insert(fieldValues);
          if (fvError) console.error('Field values error:', fvError);
        }
      }

      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ full_name: '', email: '', phone: '', program_id: '', cohort_id: '', total_amount: '' });
    setCustomValues({});
    setEvidenceUrl('');
    setEvidenceFileName('');
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Enrollment Submitted!</h1>
          <p className="text-muted-foreground">
            Your enrollment and payment evidence have been submitted successfully. 
            An admin will verify your payment and activate your enrollment.
          </p>
          <p className="text-sm text-muted-foreground">
            You'll receive a confirmation email once verified.
          </p>
          <Button onClick={resetForm}>Submit Another Enrollment</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-[hsl(var(--sidebar-background))] to-[hsl(var(--primary))] py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-white mb-3">
            Student Enrollment
          </h1>
          <p className="text-white/70 text-lg">
            Enroll in a program and submit your payment evidence
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 -mt-8">
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl shadow-lg p-6 md:p-8 space-y-6">
          
          <div>
            <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Full Name *</Label>
                <Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" placeholder="John Doe" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1.5" placeholder="john@example.com" />
              </div>
              <div className="sm:col-span-2">
                <Label>Phone (WhatsApp)</Label>
                <Input
                  value={form.phone}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\+?[0-9]*$/.test(val)) {
                      setForm({ ...form, phone: val });
                    }
                  }}
                  className="mt-1.5"
                  placeholder="+2347032400529"
                  pattern="^\+[1-9]\d{6,14}$"
                  title="Enter phone in international format, e.g. +2347032400529"
                />
                {form.phone && !/^\+[1-9]\d{6,14}$/.test(form.phone) && (
                  <p className="text-xs text-destructive mt-1">Use international format: +234...</p>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Custom Fields */}
          {customFields.length > 0 && (
            <CustomFieldsForm
              fields={customFields}
              values={customValues}
              onChange={(key, value) => setCustomValues(prev => ({ ...prev, [key]: value }))}
            />
          )}

          <div className="border-t border-border pt-6">
            <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Program Selection</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Program *</Label>
                <Select required value={form.program_id} onValueChange={v => setForm({ ...form, program_id: v, cohort_id: '' })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {filteredCohorts.length > 0 && (
                <div>
                  <Label>Cohort</Label>
                  <Select value={form.cohort_id} onValueChange={v => setForm({ ...form, cohort_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                    <SelectContent>
                      {filteredCohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedProgram?.description && (
                <p className="sm:col-span-2 text-sm text-muted-foreground">{selectedProgram.description}</p>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Payment</h2>
            <div className="space-y-4">
              <div>
                <Label>Amount Paid *</Label>
                <Input required type="number" step="0.01" min="0" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className="mt-1.5" placeholder="0.00" />
              </div>

              <div>
                <Label>Payment Receipt / Evidence *</Label>
                <div className="mt-1.5">
                  {evidenceUrl ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-accent/30 bg-accent/5">
                      <CheckCircle className="h-5 w-5 text-accent shrink-0" />
                      <span className="text-sm text-foreground truncate flex-1">{evidenceFileName}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setEvidenceUrl(''); setEvidenceFileName(''); }}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {uploading ? 'Uploading...' : 'Click to upload receipt (PNG, JPG, PDF — max 5MB)'}
                      </span>
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" disabled={loading || !evidenceUrl} className="w-full h-12 text-base">
              {loading ? 'Submitting...' : 'Submit Enrollment'}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Your enrollment will be activated once an admin verifies your payment.
            </p>
          </div>
        </form>
      </div>

      <div className="h-16" />
    </div>
  );
}
