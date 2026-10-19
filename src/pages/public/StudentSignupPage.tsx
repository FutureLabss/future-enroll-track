import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CustomFieldsForm } from '@/components/enrollment/CustomFieldsForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle, GraduationCap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getRegistrationProgress, registrationError } from '@/lib/registration';
import { useQueryClient } from '@tanstack/react-query';
import { missingProfileDefinitions, V2_REQUIRED_PROFILE_FIELDS } from '@/lib/registrationProfile';

export default function EnrollCompletePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [enrollment, setEnrollment] = useState<any>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id || authLoading) return;
    if (!user) { navigate(`/login?next=/students/${id}`, { replace: true }); return; }
    
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        // Fetch enrollment via security-definer RPC (works for both anon and auth users)
        const { data: enrollRows, error: enrollErr } = await supabase
          .rpc('get_enrollment_for_completion' as any, { p_enrollment_id: id });

        const enrollData = Array.isArray(enrollRows) ? enrollRows[0] : null;

        if (enrollErr || !enrollData) {
          toast.error("Enrollment not found");
          setLoading(false);
          return;
        }
        setEnrollment({
          ...enrollData,
          programs: { program_name: enrollData.program_name },
        });
        const progress = await getRegistrationProgress();
        const registration = progress.registrations.find(r => r.id === id);
        if (registration?.registration_flow_version === 2 && !registration.profile_available) {
          navigate(`/enroll?registration=${id}`, { replace: true }); return;
        }
        if (registration) setEnrollment((previous: Record<string, unknown>) => ({ ...previous, registration_number: registration.registration_number, registration_flow_version: registration.registration_flow_version }));

        // Fetch custom fields visible to students
        const { data: fieldsData, error: fieldsErr } = await supabase
          .from('custom_fields')
          .select('*')
          .eq('active', true)
          .eq('visible_to_student', true)
          .or(enrollData.hub_id ? `hub_id.is.null,hub_id.eq.${enrollData.hub_id}` : 'hub_id.is.null')
          .order('sort_order', { ascending: true });

        if (fieldsErr) throw fieldsErr;
        setCustomFields(fieldsData || []);
        if (missingProfileDefinitions(fieldsData || [], enrollData.profile_requirements_version, registration?.registration_flow_version || 1).length) {
          throw new Error('The registration form is not ready yet. Please contact admissions to complete the form setup.');
        }

        // Fetch any existing values via RPC (works for anon flow too)
        const { data: existingValues, error: valuesError } = await supabase
          .rpc('get_enrollment_field_values' as any, { p_enrollment_id: id });
        if (valuesError) throw valuesError;

        if (existingValues && existingValues.length > 0) {
          const map: Record<string, string> = {};
          (existingValues as any[]).forEach((ev: any) => {
            if (ev.field_key) map[ev.field_key] = ev.value;
          });
          setFormValues(map);
        }

      } catch (err: any) {
        setLoadError(registrationError(err, 'Unable to load your registration form. Please try again.'));
        toast.error("Error loading data: " + err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user?.id, authLoading, navigate]);

  const handleFieldChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || loadError) return;

    // New enrollments use the expanded profile requirements; existing completed records are grandfathered.
    const requiredKeys = new Set([
      ...customFields.filter(field => field.required).map(field => field.key),
      ...(enrollment.profile_requirements_version >= 2 ? V2_REQUIRED_PROFILE_FIELDS : []),
    ]);
    for (const field of customFields) {
      if (field.key === 'current_academic_level' && formValues['highest_education'] !== 'SIWES/IT (Internship)') continue;
      if (requiredKeys.has(field.key) && !formValues[field.key]?.trim()) {
        toast.error(`Please fill in the required field: ${field.label}`);
        return;
      }
    }

    // Validate DOB: must be at least 8 years old
    if (formValues['date_of_birth']) {
      const dobMax = new Date(); dobMax.setFullYear(dobMax.getFullYear() - 8);
      if (new Date(formValues['date_of_birth']) > dobMax) {
        toast.error('Date of birth: must be at least 8 years old');
        return;
      }
    }

    // Validate social media URL
    const socialUrl = formValues['social_media_profile'];
    if (socialUrl?.trim()) {
      try {
        const u = new URL(socialUrl.startsWith('http') ? socialUrl : `https://${socialUrl}`);
        const SOCIAL = ['linkedin.com','twitter.com','x.com','instagram.com','facebook.com','tiktok.com','github.com','youtube.com','threads.net'];
        if (!SOCIAL.some(d => u.hostname.endsWith(d))) throw new Error();
      } catch {
        toast.error('Please enter a valid social media profile URL (LinkedIn, Twitter, Instagram, etc.)');
        return;
      }
    }

    setSubmitting(true);
    try {
      // Link enrollment to current user (idempotent)
      const { error: linkError } = await supabase.rpc('link_enrollment_to_user' as any, { p_enrollment_id: id });
      if (linkError) throw linkError;

      const { error } = await supabase.rpc('submit_enrollment_fields' as any, {
        p_enrollment_id: id,
        p_fields: formValues
      });

      if (error) throw error;
      
      const progress = await getRegistrationProgress();
      queryClient.setQueryData(['registration-progress', user?.id], progress);
      toast.success("Profile completed successfully!");
      setSubmitted(true);
      navigate(progress.dashboard_access ? '/student' : `/enroll?registration=${id}`);
    } catch (err: any) {
      toast.error("Failed to submit: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 p-4 text-center">
        <h1 className="text-2xl font-bold font-heading">Enrollment Not Found</h1>
        <p className="text-muted-foreground max-w-md">The enrollment link may be invalid or has expired.</p>
        <Button onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading mb-2">Profile Completed!</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Thank you for completing your enrollment details. Your profile is now up to date.
          </p>
        </div>
        <Button onClick={() => navigate(user ? '/student' : '/login')}>
          Proceed to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-br from-[hsl(var(--sidebar-background))] to-[hsl(var(--primary))] py-12 px-4 shadow-md relative">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">
              Complete Your Profile
            </h1>
            <p className="text-white/80 text-sm md:text-base mt-1">
              {enrollment.programs?.program_name} — Welcome, {enrollment.full_name}!
            </p>
            {enrollment.registration_number && <p className="text-white/80 font-mono text-sm mt-2">{enrollment.registration_number} · Segment 2</p>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-20 relative z-10">
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl shadow-lg p-6 md:p-8 space-y-6">
          <div className="mb-6 pb-6 border-b border-border">
            <p className="text-muted-foreground text-sm">
              Review your name below and complete the remaining details to finalize your registration. You can correct your name if needed. All fields marked with an asterisk (*) are required.
            </p>
          </div>

          {loadError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 p-5 space-y-3">
              <p className="font-semibold">Registration form unavailable</p>
              <p className="text-sm">{loadError}</p>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload form</Button>
            </div>
          ) : customFields.length > 0 ? (
            <CustomFieldsForm 
              fields={customFields.map(field => ({
                ...field,
                required: field.required || (
                  enrollment.profile_requirements_version >= 2 && V2_REQUIRED_PROFILE_FIELDS.includes(field.key)
                ),
              }))}
              values={formValues}
              onChange={handleFieldChange}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 bg-muted/30 rounded-lg">
              No additional fields are required at this time.
            </p>
          )}

          <div className="pt-6 border-t border-border flex justify-end gap-3">
            <Button type="submit" disabled={submitting || !!loadError} className="w-full sm:w-auto h-11 px-8">
              {submitting ? 'Submitting...' : 'Save & Complete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
