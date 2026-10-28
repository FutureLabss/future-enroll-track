import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const FUTURELABS_HUB_ID = '00000000-0000-0000-0000-000000000001';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [programId, setProgramId] = useState('');
  const [programs, setPrograms] = useState<{ id: string; program_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/';

  useEffect(() => {
    if (!isRegister || programs.length) return;
    (supabase as any).from('programs').select('id, program_name').eq('active', true).eq('hub_id', FUTURELABS_HUB_ID)
      .order('program_name').then(({ data }: { data: { id: string; program_name: string }[] | null }) => setPrograms(data || []));
  }, [isRegister, programs.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `https://admin.futurelabs.ng/reset-password`,
        });
        if (error) throw error;
        toast.success('Password reset email sent! Check your inbox.');
        setIsForgot(false);
      } else if (isRegister) {
        // Self-registration creates a CRM lead, not an account — the account is created from the
        // enrollment completion link once an admin converts the lead.
        const program = programs.find(p => p.id === programId);
        const { data, error } = await supabase.functions.invoke('capture-lead', {
          body: {
            hub_slug: 'futurelabs',
            full_name: fullName,
            email,
            phone,
            source: 'website',
            source_detail: program ? `LMS sign-up — interested in ${program.program_name}` : 'LMS sign-up',
          },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        toast.success("Thanks! We've received your details — our team will contact you to complete your enrollment.");
        setFullName(''); setPhone(''); setProgramId(''); setEmail('');
        setIsRegister(false);
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate(nextPath);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight">
            <span className="text-primary">Future</span>Labs
          </h1>
          <p className="text-muted-foreground mt-2">Invoicing & Enrollment System</p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-heading font-semibold mb-2">
            {isForgot ? 'Reset Password' : isRegister ? 'Register Interest' : 'Sign In'}
          </h2>
          {isRegister && (
            <p className="text-sm text-muted-foreground mb-6">
              Leave your details and our team will reach out to complete your enrollment and set up your account.
            </p>
          )}
          {!isRegister && <div className="mb-4" />}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required className="mt-1.5" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="mt-1.5" />
            </div>
            {isRegister && (
              <>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080..." required className="mt-1.5" />
                </div>
                <div>
                  <Label>Programme of interest (optional)</Label>
                  <Select value={programId} onValueChange={setProgramId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Not sure yet" /></SelectTrigger>
                    <SelectContent>
                      {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {!isForgot && !isRegister && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="mt-1.5" />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Loading...' : isForgot ? 'Send Reset Link' : isRegister ? 'Submit' : 'Sign In'}
            </Button>
          </form>

          {!isRegister && !isForgot && (
            <button type="button" onClick={() => setIsForgot(true)} className="text-sm text-primary hover:underline mt-4 block text-center w-full">
              Forgot your password?
            </button>
          )}

          <p className="text-sm text-center mt-4 text-muted-foreground">
            {isForgot ? (
              <button type="button" onClick={() => setIsForgot(false)} className="text-primary font-medium hover:underline">Back to Sign In</button>
            ) : (
              <>
                {isRegister ? 'Already have an account?' : 'New to FutureLabs?'}{' '}
                <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-primary font-medium hover:underline">
                  {isRegister ? 'Sign In' : 'Register interest'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
