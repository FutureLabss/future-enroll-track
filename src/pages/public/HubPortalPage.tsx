import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, Loader2, ArrowRight, ShieldAlert } from 'lucide-react';

export default function HubPortalPage() {
  const { hubSlug } = useParams<{ hubSlug: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [hub, setHub] = useState<{ name: string; slug: string; plan: string } | null>(null);
  const [hubLoading, setHubLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('hubs')
      .select('name, slug, plan, status')
      .eq('slug', hubSlug!)
      .maybeSingle()
      .then(({ data }) => {
        setHub(data);
        setHubLoading(false);
      });
  }, [hubSlug]);

  // Authenticated admins go straight to their dashboard
  useEffect(() => {
    if (!authLoading && !hubLoading && user && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [user, isAdmin, authLoading, hubLoading]);

  const isLoading = authLoading || hubLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-7 w-7 text-primary" />
      </div>
    );
  }

  if (!hub) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Hub not found</h1>
        <p className="text-muted-foreground">No hub exists at <code className="text-sm bg-muted px-1.5 py-0.5 rounded">/{hubSlug}</code>.</p>
        <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  // Logged in but not an admin (e.g. student or org role)
  if (user && !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <HubBranding hub={hub} />
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <ShieldAlert className="h-8 w-8 text-warning mx-auto" />
            <p className="font-semibold">No admin access</p>
            <p className="text-sm text-muted-foreground">
              Your account doesn't have admin access to <strong>{hub.name}</strong>. Contact your hub administrator.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Go to My Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated visitor
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <HubBranding hub={hub} />
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Sign in to {hub.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Access your hub's admin dashboard, programs, classrooms, and finance tools.
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={() => navigate(`/login?next=/${hubSlug}`)}>
            Sign In <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Powered by <span className="font-semibold">FutureLabs LMS</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function HubBranding({ hub }: { hub: { name: string; plan: string } }) {
  return (
    <div className="text-center space-y-3">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mx-auto">
        <GraduationCap className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">{hub.name}</h1>
        <Badge variant="outline" className="mt-1 text-xs capitalize">{hub.plan} Plan</Badge>
      </div>
    </div>
  );
}
