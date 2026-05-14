import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, GraduationCap, Lock, LogIn } from 'lucide-react';

type Step = 'loading' | 'set-password' | 'needs-account' | 'sign-in' | 'accepting' | 'done' | 'error';

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  // Capture invite flag before Supabase JS clears the hash
  const isInviteRef = useRef(
    typeof window !== 'undefined' && window.location.hash.includes('type=invite')
  );

  const [step, setStep] = useState<Step>('loading');
  const [invitation, setInvitation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [processing, setProcessing] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStep('error');
      setErrorMsg('No invitation token provided.');
      return;
    }

    // Listen for auth events — Supabase processes hash tokens async
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session && !handledRef.current) {
          handledRef.current = true;
          const inv = await fetchInvitation();
          if (!inv) return;
          await doAccept(session.user.id, inv);
        }
      }
    );

    // Also check synchronously in case session is already set
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && !handledRef.current) {
        handledRef.current = true;
        const inv = await fetchInvitation();
        if (!inv) return;
        await doAccept(session.user.id, inv);
      } else if (!session && !isInviteRef.current) {
        // No session, no invite hash — show create-account form
        const inv = await fetchInvitation();
        if (!inv) return;
        setStep('needs-account');
      }
      // If isInviteRef.current is true, wait for onAuthStateChange
    });

    return () => subscription.unsubscribe();
  }, [token]);

  const fetchInvitation = async () => {
    const { data, error } = await supabase
      .from('staff_invitations')
      .select('*, staff!left(full_name, email), classrooms!left(name, location, programs!left(program_name))')
      .eq('token', token)
      .single();

    if (error || !data) {
      setStep('error');
      setErrorMsg('Invalid or expired invitation link.');
      return null;
    }
    if (data.status !== 'pending') {
      setStep('error');
      setErrorMsg(`This invitation has already been ${data.status}.`);
      return null;
    }
    if (new Date(data.expires_at) < new Date()) {
      setStep('error');
      setErrorMsg('This invitation has expired. Please ask your admin to resend it.');
      return null;
    }

    setInvitation(data);
    if (data.staff?.full_name) setFullName(data.staff.full_name);
    return data;
  };

  const doAccept = async (userId: string, inv: any) => {
    setStep('accepting');
    const { error } = await supabase.rpc('accept_staff_invitation', {
      p_token: token,
      p_user_id: userId,
    });
    if (error) { setStep('error'); setErrorMsg(error.message); return; }
    // Invite-flow users need to set a permanent password
    setStep(isInviteRef.current ? 'set-password' : 'done');
    setInvitation(inv);
  };

  const handleSetPassword = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setProcessing(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password set successfully!');
      setStep('done');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSignIn = async () => {
    if (!password) { toast.error('Enter your password'); return; }
    const email = invitation?.staff?.email;
    if (!email) { toast.error('Could not determine your email address'); return; }
    setProcessing(true);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!signInData.user) throw new Error('Sign in failed');
      handledRef.current = true;
      await doAccept(signInData.user.id, invitation);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!password || password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!fullName.trim()) { toast.error('Enter your full name'); return; }
    setProcessing(true);
    try {
      const email = invitation.staff?.email;
      if (!email) throw new Error('Could not determine your email address');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error('Account creation failed');

      await supabase.from('profiles').upsert({ user_id: signUpData.user.id, full_name: fullName, email });

      handledRef.current = true;
      await doAccept(signUpData.user.id, invitation);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin h-8 w-8 text-primary" />
    </div>
  );

  if (step === 'accepting') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary mx-auto mb-3" />
        <p className="text-muted-foreground">Setting up your classroom access...</p>
      </div>
    </div>
  );

  if (step === 'error') return (
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

  if (step === 'done') return (
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

  if (step === 'set-password') return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Set Your Password</h1>
          <p className="text-muted-foreground mt-2">
            You've joined <strong>{invitation?.classrooms?.name}</strong>.
            Set a password to complete your account setup.
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div>
            <Label>New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1.5"
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="mt-1.5"
              placeholder="Repeat your password"
            />
          </div>
          <Button onClick={handleSetPassword} disabled={processing} className="w-full">
            {processing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {processing ? 'Saving...' : 'Set Password & Continue'}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep('done')}>
            I already have a password — skip this step
          </Button>
        </div>
      </div>
    </div>
  );

  if (step === 'sign-in') return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Sign In to Accept</h1>
          <p className="text-muted-foreground mt-2">
            Sign in with your existing account to join <strong>{invitation?.classrooms?.name}</strong>.
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Email: <strong>{invitation?.staff?.email}</strong></p>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1.5"
              placeholder="Your password"
              onKeyDown={e => e.key === 'Enter' && handleSignIn()}
            />
          </div>
          <Button onClick={handleSignIn} disabled={processing} className="w-full">
            {processing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {processing ? 'Signing in...' : 'Sign In & Accept Invitation'}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { setPassword(''); setStep('needs-account'); }}>
            I don't have an account yet
          </Button>
        </div>
      </div>
    </div>
  );

  // needs-account — no session, no invite hash
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
            <p className="text-sm text-muted-foreground mt-1">
              Program: {invitation.classrooms.programs.program_name}
            </p>
          )}
        </div>

        {/* Existing account path */}
        <div className="glass-card rounded-2xl p-6 space-y-3 mb-4">
          <h2 className="font-semibold">Already have an account?</h2>
          <p className="text-sm text-muted-foreground">{invitation?.staff?.email}</p>
          <Button variant="outline" className="w-full" onClick={() => { setPassword(''); setStep('sign-in'); }}>
            <LogIn className="h-4 w-4 mr-2" /> Sign In to Accept
          </Button>
        </div>

        {/* New account path */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">New here? Create your account</h2>
          <div>
            <Label>Full Name</Label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="mt-1.5"
              placeholder="Your full name"
            />
          </div>
          <div>
            <Label>Create Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1.5"
              placeholder="Minimum 8 characters"
            />
          </div>
          <Button onClick={handleCreateAccount} disabled={processing} className="w-full">
            {processing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {processing ? 'Creating Account...' : 'Create Account & Join Classroom'}
          </Button>
        </div>
      </div>
    </div>
  );
}
