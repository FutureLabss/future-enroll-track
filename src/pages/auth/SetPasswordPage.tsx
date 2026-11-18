import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  useEffect(() => {
    // Supabase puts a failed link's error in the hash (implicit) or query (PKCE).
    // Read it before the client clears the URL.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const urlError = hashParams.get('error_code') || hashParams.get('error') || queryParams.get('error_code') || queryParams.get('error');
    const urlErrorDescription = hashParams.get('error_description') || queryParams.get('error_description');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    // getSession() resolves only after the client has processed the link, so no
    // session here means the link failed: without this the spinner never ends.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setReady(true); return; }
      setLinkError(
        urlError === 'otp_expired' || !urlErrorDescription
          ? 'This link has expired or has already been used. Ask your admin to resend your invitation.'
          : urlErrorDescription
      );
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password set — welcome aboard!');
      navigate(next, { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (linkError && !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Link no longer valid</h1>
          <p className="text-muted-foreground mb-6">{linkError}</p>
          <p className="text-sm text-muted-foreground mb-4">
            Already set a password? Sign in instead.
          </p>
          <Button variant="outline" onClick={() => navigate('/login', { replace: true })}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight">
            <span className="text-primary">Future</span>Labs
          </h1>
        </div>
        <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-heading font-semibold">Set Your Password</h2>
              <p className="text-sm text-muted-foreground">Choose a password to secure your account.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" required minLength={8}
                className="mt-1.5" autoFocus
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password" required minLength={8}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up…' : 'Set Password & Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
