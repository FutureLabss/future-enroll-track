import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, GraduationCap } from 'lucide-react';

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [step, setStep] = useState<'loading' | 'needs-account' | 'accepting' | 'done' | 'error'>('loading');
  const [invitation, setInvitation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('No invitation token provided.'); return; }
    checkInvitation();
  }, [token]);

  const checkInvitation = async () => {
    const { data, error } = await supabase
      .from('staff_invitations')
      .select('*, staff(full_name, email), classrooms(name, location, programs(program_name))')
      .eq('token', token)
      .single();

    if (error || !data) { setStep('error'); setErrorMsg('Invalid or expired invitation link.'); return; }
    if (data.status !== 'pending') { setStep('error'); setErrorMsg(`This invitation has already been ${data.status}.`); return; }
    if (new Date(data.expires_at) < new Date()) { setStep('error'); setErrorMsg('This invitation has expired. Please ask your admin to resend it.'); return; }

    setInvitation(data);

    // Check if user already has an account
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Logged in — accept directly
      acceptInvitation(session.user.id);
    } else {
      setStep('needs-account');
    }
  };

  const acceptInvitation = async (userId: string) => {
    setStep('accepting');
    const { error } = await supabase.rpc('accept_staff_invitation', {
      p_token: token,
      p_user_id: userId,
    });
    if (error) { setStep('error'); setErrorMsg(error.message); return; }
    setStep('done');
  };

  const handleCreateAccount = async () => {
    if (!password || password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!fullName.trim()) { toast.error('Enter your full name'); return; }
    setProcessing(true);
    try {
      const email = invitation.staff.email;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error('Account creation failed');

      // Update profile
      await supabase.from('profiles').upsert({ user_id: signUpData.user.id, full_name: fullName, email });

      await acceptInvitation(signUpData.user.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold mb-2">Invitation Error</h1>
          <p className="text-muted-foreground">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-xl font-bold mb-2">Welcome aboard!</h1>
          <p className="text-muted-foreground mb-2">
            You now have access to <strong>{invitation?.classrooms?.name}</strong> as{' '}
            {invitation?.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}.
          </p>
          <Button className="mt-4" onClick={() => navigate('/staff/classrooms')}>
            Go to My Classrooms
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Setting up your classroom access...</p>
        </div>
      </div>
    );
  }

  // needs-account
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Classroom Invitation</h1>
          <p className="text-muted-foreground mt-2">
            You've been invited to join <strong>{invitation?.classrooms?.name}</strong> as{' '}
            <strong>{invitation?.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}</strong>.
          </p>
          {invitation?.classrooms?.programs && (
            <p className="text-sm text-muted-foreground mt-1">Program: {invitation.classrooms.programs.program_name}</p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Create your account</h2>
          <p className="text-sm text-muted-foreground">Email: <strong>{invitation?.staff?.email}</strong></p>
          <div>
            <Label>Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1.5" defaultValue={invitation?.staff?.full_name} placeholder="Your full name" />
          </div>
          <div>
            <Label>Create Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5" placeholder="Minimum 8 characters" />
          </div>
          <Button onClick={handleCreateAccount} disabled={processing} className="w-full">
            {processing ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
            {processing ? 'Creating Account...' : 'Accept Invitation & Join Classroom'}
          </Button>
        </div>
      </div>
    </div>
  );
}
