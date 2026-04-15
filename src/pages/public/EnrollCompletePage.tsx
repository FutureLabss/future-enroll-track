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

export default function EnrollCompletePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, signUp } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [password, setPassword] = useState('');
  
  const [enrollment, setEnrollment] = useState<any>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    
    async function loadData() {
      try {
        // Fetch enrollment
        const { data: enrollData, error: enrollErr } = await supabase
          .from('enrollments')
          .select('*, programs(program_name)')
          .eq('id', id)
          .single();
          
        if (enrollErr || !enrollData) {
          toast.error("Enrollment not found");
          setLoading(false);
          return;
        }
        setEnrollment(enrollData);

        // Fetch custom fields
        const { data: fieldsData, error: fieldsErr } = await supabase
          .from('custom_fields')
          .select('*')
          .eq('active', true)
          .eq('visible_to_student', true)
          .order('sort_order', { ascending: true });
          
        if (fieldsErr) throw fieldsErr;
        setCustomFields(fieldsData || []);

        // Fetch any existing values if they partially filled it
        const { data: existingValues } = await supabase
          .from('field_values')
          .select('*, custom_fields(key)')
          .eq('enrollment_id', id);
          
        if (existingValues && existingValues.length > 0) {
          const map: Record<string, string> = {};
          existingValues.forEach((ev: any) => {
            if (ev.custom_fields?.key) {
              map[ev.custom_fields.key] = ev.value;
            }
          });
          setFormValues(map);
        }

      } catch (err: any) {
        toast.error("Error loading data: " + err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const handleFieldChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    // Validate required fields
    for (const field of customFields) {
      if (field.required && !formValues[field.key]) {
        toast.error(`Please fill in the required field: ${field.label}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!enrollment.user_id && !user) {
        if (!password || password.length < 6) {
          toast.error("Please provide a password of at least 6 characters.");
          setSubmitting(false);
          return;
        }
        const { error: signUpErr } = await signUp(enrollment.email, password, enrollment.full_name);
        if (signUpErr) {
          if (signUpErr.message.toLowerCase().includes("already registered")) {
            toast.error("An account with this email already exists. Please log in first.");
            navigate(`/login?next=/enroll/complete/${id}`);
            return;
          }
          throw signUpErr;
        }
      }

      if (!enrollment.user_id && user) {
        // Link enrollment securely immediately since they are logged in
        await supabase.rpc('link_enrollment_to_user' as any, { p_enrollment_id: id });
      }

      const { error } = await supabase.rpc('submit_enrollment_fields' as any, {
        p_enrollment_id: id,
        p_fields: formValues
      });

      if (error) throw error;
      
      toast.success("Profile completed successfully!");
      setSubmitted(true);
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
        <Button onClick={() => navigate('/login')}>
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
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-20 relative z-10">
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl shadow-lg p-6 md:p-8 space-y-6">
          <div className="mb-6 pb-6 border-b border-border">
            <p className="text-muted-foreground text-sm">
              Please provide the additional information below to finalize your enrollment records. All fields marked with an asterisk (*) are required.
            </p>
          </div>

          {!enrollment.user_id && !user && (
            <div className="mb-6 pb-6 border-b border-border space-y-4">
              <h2 className="font-heading font-semibold text-lg text-foreground">Create Your Account</h2>
              <p className="text-sm text-muted-foreground">Setup a password to access your student dashboard.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input value={enrollment.email} disabled className="mt-1.5" />
                </div>
                <div>
                  <Label>Password *</Label>
                  <Input 
                    type="password" 
                    required 
                    minLength={6} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="mt-1.5" 
                  />
                </div>
              </div>
            </div>
          )}

          {customFields.length > 0 ? (
            <CustomFieldsForm 
              fields={customFields}
              values={formValues}
              onChange={handleFieldChange}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 bg-muted/30 rounded-lg">
              No additional fields are required at this time.
            </p>
          )}

          <div className="pt-6 border-t border-border flex justify-end gap-3">
            <Button type="submit" disabled={submitting || customFields.length === 0} className="w-full sm:w-auto h-11 px-8">
              {submitting ? 'Submitting...' : 'Save & Complete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
