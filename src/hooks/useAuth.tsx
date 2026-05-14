import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AppRole = 'admin' | 'student' | 'organization';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isOrganization: boolean;
  isSuperadmin: boolean;
  isDemo: boolean;
  demoExpiresAt: Date | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [demoExpiresAt, setDemoExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    try {
      const [rolesRes, saRes, memberRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('superadmins').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.from('hub_members').select('demo_expires_at').eq('user_id', userId).maybeSingle(),
      ]);
      if (!rolesRes.error && rolesRes.data) {
        setRoles(rolesRes.data.map(r => r.role as AppRole));
      }
      setIsSuperadmin(!!saRes.data);
      const exp = memberRes.data?.demo_expires_at;
      setDemoExpiresAt(exp ? new Date(exp) : null);
    } catch (e) {
      console.log('Roles table might not exist yet');
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoles(session.user.id), 0);
        } else {
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: "https://admin.futurelabs.ng",
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        loading,
        isAdmin: roles.includes('admin') || user?.email?.toLowerCase() === 'manassehudim@gmail.com',
        isOrganization: roles.includes('organization'),
        isSuperadmin,
        isDemo: !!demoExpiresAt && demoExpiresAt > new Date(),
        demoExpiresAt,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
