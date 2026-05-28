import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CustomFieldsForm } from '@/components/enrollment/CustomFieldsForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, Save, UserCircle } from 'lucide-react';

const SOCIAL_MEDIA_DOMAINS = ['linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'github.com', 'youtube.com', 'threads.net'];

function isValidSocialMediaUrl(url: string): boolean {
  if (!url.trim()) return true;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return SOCIAL_MEDIA_DOMAINS.some(domain => parsed.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '' });
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingEnrollment, setSavingEnrollment] = useState(false);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    const [profileRes, enrollmentRes, fieldsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('enrollments')
        .select('id, enrollment_status, total_amount, amount_paid, outstanding_balance, created_at, programs(program_name), cohorts(cohort_label)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('custom_fields')
        .select('*')
        .eq('active', true)
        .eq('visible_to_student', true)
        .order('sort_order'),
    ]);

    if (profileRes.data) {
      setProfile({
        full_name: profileRes.data.full_name || '',
        email: profileRes.data.email || user.email || '',
        phone: profileRes.data.phone || '',
      });
    } else {
      setProfile({ full_name: '', email: user.email || '', phone: '' });
    }

    const enrollmentRows = enrollmentRes.data || [];
    const fields = fieldsRes.data || [];
    setEnrollments(enrollmentRows);
    setCustomFields(fields);

    if (enrollmentRows.length && fields.length) {
      const { data: values } = await supabase
        .from('field_values')
        .select('field_id, value')
        .eq('enrollment_id', enrollmentRows[0].id);

      const nextValues: Record<string, string> = {};
      (values || []).forEach((fieldValue: any) => {
        const field = fields.find((item: any) => item.id === fieldValue.field_id);
        if (field && fieldValue.value) nextValues[field.key] = fieldValue.value;
      });
      setCustomValues(nextValues);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, [user]);

  const requiredFields = useMemo(() => customFields.filter(field => field.required), [customFields]);
  const missingRequired = requiredFields.filter(field => !customValues[field.key]?.trim());
  const completedCount = customFields.filter(field => customValues[field.key]?.trim()).length;
  const completionPct = customFields.length ? Math.round((completedCount / customFields.length) * 100) : 100;
  const basicMissing = [
    !profile.full_name.trim() ? 'Full name' : null,
    !profile.phone.trim() ? 'Phone' : null,
  ].filter(Boolean);
  const ready = basicMissing.length === 0 && missingRequired.length === 0;

  const handleBasicSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!profile.full_name.trim()) {
      toast.error('Full name is required');
      return;
    }
    setSavingBasic(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        user_id: user.id,
        full_name: profile.full_name.trim(),
        email: profile.email || user.email,
        phone: profile.phone.trim() || null,
      }, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingBasic(false);
    }
  };

  const handleEnrollmentSave = async () => {
    if (!enrollments.length) {
      toast.error('No enrollment found');
      return;
    }
    const missing = requiredFields.filter(field => !customValues[field.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map(field => field.label).join(', ')}`);
      return;
    }
    const socialUrl = customValues.social_media_profile;
    if (socialUrl?.trim() && !isValidSocialMediaUrl(socialUrl)) {
      toast.error('Please enter a valid social media profile URL');
      return;
    }

    setSavingEnrollment(true);
    try {
      for (const enrollment of enrollments) {
        await supabase.from('field_values').delete().eq('enrollment_id', enrollment.id);

        const fieldValues = customFields
          .filter(field => customValues[field.key]?.trim())
          .map(field => ({
            enrollment_id: enrollment.id,
            field_id: field.id,
            value: customValues[field.key],
          }));

        if (fieldValues.length > 0) {
          const { error } = await supabase.from('field_values').insert(fieldValues);
          if (error) throw error;
        }
      }
      toast.success('Enrollment information saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save enrollment information');
    } finally {
      setSavingEnrollment(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Profile" description="Manage your student profile and enrollment information" />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Profile Status</p>
            {ready ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
          </div>
          <p className="mt-2 text-2xl font-semibold">{ready ? 'Ready' : 'Needs Info'}</p>
          <p className="text-xs text-muted-foreground">{basicMissing.length + missingRequired.length} required item{basicMissing.length + missingRequired.length === 1 ? '' : 's'} missing</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Enrollment Fields</p>
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{completedCount}/{customFields.length}</p>
          <Progress value={completionPct} className="mt-2 h-2" />
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Enrollments</p>
            <UserCircle className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{enrollments.length}</p>
          <p className="text-xs text-muted-foreground">Your saved enrollment records</p>
        </div>
      </div>

      {!ready && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-sm font-medium">Required information missing</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {basicMissing.map(item => <Badge key={String(item)} variant="outline" className="border-warning/30 text-warning">{item}</Badge>)}
            {missingRequired.map(field => <Badge key={field.id} variant="outline" className="border-warning/30 text-warning">{field.label}</Badge>)}
          </div>
        </div>
      )}

      <Tabs defaultValue="basic">
        <TabsList className="mb-6">
          <TabsTrigger value="basic">Basic Profile</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment Information</TabsTrigger>
          <TabsTrigger value="records">Enrollment Records</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <div className="glass-card rounded-2xl p-6 max-w-2xl">
            <form onSubmit={handleBasicSave} className="space-y-4">
              <div>
                <Label>Full Name *</Label>
                <Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={profile.email} disabled className="mt-1.5 opacity-60" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here.</p>
              </div>
              <div>
                <Label>Phone *</Label>
                <Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+234..." className="mt-1.5" />
              </div>
              <Button type="submit" disabled={savingBasic}>
                <Save className="h-4 w-4 mr-2" /> {savingBasic ? 'Saving...' : 'Save Basic Profile'}
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="enrollment">
          {customFields.length > 0 ? (
            <div className="glass-card rounded-2xl p-6">
              <CustomFieldsForm
                fields={customFields}
                values={customValues}
                onChange={(key, value) => setCustomValues(prev => ({ ...prev, [key]: value }))}
              />
              <div className="mt-6 flex justify-end border-t border-border pt-4">
                <Button onClick={handleEnrollmentSave} disabled={savingEnrollment}>
                  <Save className="h-4 w-4 mr-2" /> {savingEnrollment ? 'Saving...' : 'Save Enrollment Information'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12">No additional enrollment fields are required.</p>
          )}
        </TabsContent>

        <TabsContent value="records">
          <div className="space-y-3">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{enrollment.programs?.program_name || 'Program'}</p>
                  <p className="text-sm text-muted-foreground">
                    {enrollment.cohorts?.cohort_label || 'No cohort assigned'} · Enrolled {new Date(enrollment.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={enrollment.enrollment_status} />
                  <Badge variant="outline">
                    Balance ₦{Number(enrollment.outstanding_balance || 0).toLocaleString('en-NG')}
                  </Badge>
                </div>
              </div>
            ))}
            {enrollments.length === 0 && (
              <p className="text-center text-muted-foreground py-12">No enrollment records found.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
