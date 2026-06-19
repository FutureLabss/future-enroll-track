import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Lock, LogIn } from 'lucide-react';

type Step = 'loading' | 'set-password' | 'sign-in' | 'accepting' | 'error';

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
  const [processing, setProcessing] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStep('error');
      setErrorMsg('No invitation token provided.');
      return;
    }

    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session && !handledRef.current) {
        // Already logged in — go straight to the RPC, no subscription needed
        handledRef.current = true;
        await doAccept(session.user.id);
        return;
      }

      if (!session && !isInviteRef.current) {
        // Existing user, not logged in — show sign-in form
        const inv = await fetchInvitation();
        if (!inv) return;
        setStep('sign-in');
        return;
      }

      // New user arriving via Supabase invite hash — Supabase processes the
      // hash async, so we wait for the resulting session via onAuthStateChange.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, sess) => {
          if (sess && !handledRef.current) {
            handledRef.current = true;
            const inv = await fetchInvitation();
            if (!inv) return;
            await doAccept(sess.user.id, inv);
          }
        }
      );
      cleanup = () => subscription.unsubscribe();
    };

    init();
    return () => cleanup?.();
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
    return data;
  };

  const doAccept = async (userId: string, inv?: any) => {
    setStep('accepting');
    const { error } = await supabase.rpc('accept_staff_invitation', {
      p_token: token,
      p_user_id: userId,
    });
    if (error) { setStep('error'); setErrorMsg(error.message); return; }
    if (isInviteRef.current && inv) {
      setInvitation(inv);
      setStep('set-password');
    } else {
      const name = inv?.classrooms?.name;
      toast.success(name ? `Welcome! You've joined ${name}.` : 'Classroom access confirmed!');
      navigate('/staff/classrooms', { replace: true });
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setProcessing(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(`Password set — welcome to ${invitation?.classrooms?.name}!`);
      navigate('/staff/classrooms', { replace: true });
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
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => navigate('/staff/classrooms', { replace: true })}>
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

}
