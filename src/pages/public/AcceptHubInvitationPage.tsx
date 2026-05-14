import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'loading' | 'set-password' | 'sign-in' | 'accepting' | 'done' | 'error';

export default function AcceptHubInvitationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('loading');
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token');
  const isInviteRef = useRef(window.location.hash.includes('type=invite'));
  const handledRef = useRef(false);

  useEffect(() => {
    if (!token) { setError('Missing invitation token'); setStep('error'); return; }
    loadInvitation();
  }, []);

  const loadInvitation = async () => {
    const { data } = await supabase
      .from('hub_invitations')
      .select('*, hubs(name, slug)')
      .eq('token', token!)
      .maybeSingle();

    if (!data) { setError('Invitation not found or already used'); setStep('error'); return; }
    if (new Date(data.expires_at) < new Date()) { setError('This invitation has expired'); setStep('error'); return; }
    if (data.accepted_at) { setError('This invitation has already been accepted'); setStep('error'); return; }

    setInvitation(data);
    setEmail(data.email);

    // Check if user is already logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await doAccept(session.user.id);
      return;
    }

    // Check for Supabase invite hash
    if (isInviteRef.current) {
      setStep('set-password');
    } else {
      setStep('sign-in');
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (handledRef.current) return;
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        handledRef.current = true;
        if (isInviteRef.current) {
          // Supabase invite flow: user must set a password first
          setStep('set-password');
        } else {
          // Magic link / OTP flow: already authenticated, auto-accept
          await doAccept(session.user.id);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const doAccept = async (userId: string) => {
    setStep('accepting');
    const { error } = await supabase.rpc('accept_hub_invitation', {
      p_token: token,
      p_user_id: userId,
    });
    if (error) { setError(error.message); setStep('error'); return; }

    // Grant admin role in user_roles if not already present
    await supabase.from('user_roles').upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });

    setStep('done');
  };

  const handleSetPassword = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      const { data: { user }, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await doAccept(user!.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignIn = async () => {
    if (!signInPassword) { toast.error('Password required'); return; }
    setSaving(true);
    try {
      const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password: signInPassword });
      if (error) throw error;
      await doAccept(user!.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-primary">Future</span>Labs Hub Invitation
          </h1>
          {invitation && (
            <p className="text-muted-foreground mt-1">
              You've been invited to manage <strong>{invitation.hubs?.name}</strong>
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {step === 'loading' && (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin h-6 w-6 text-primary" />
            </div>
          )}

          {step === 'set-password' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-semibold text-lg">Set Your Password</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose a password to secure your hub admin account.</p>
              </div>
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="mt-1.5"
                  placeholder="At least 8 characters"
                  onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                />
              </div>
              <Button onClick={handleSetPassword} disabled={saving} className="w-full">
                {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Set Password & Join Hub
              </Button>
            </div>
          )}

          {step === 'sign-in' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-semibold text-lg">Sign In to Accept</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Sign in with <strong>{email}</strong> to accept the invitation.
                </p>
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={signInPassword}
                  onChange={e => setSignInPassword(e.target.value)}
                  className="mt-1.5"
                  onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                />
              </div>
              <Button onClick={handleSignIn} disabled={saving} className="w-full">
                {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Sign In & Join Hub
              </Button>
            </div>
          )}

          {step === 'accepting' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="animate-spin h-7 w-7 text-primary" />
              <p className="text-sm text-muted-foreground">Setting up your hub access…</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-success" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">You're in!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Welcome to <strong>{invitation?.hubs?.name}</strong>. You now have admin access to this hub.
                </p>
              </div>
              <Button className="w-full" onClick={() => navigate('/admin')}>Go to Dashboard</Button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-6 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Invitation Error</h2>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/login')}>Go to Login</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
