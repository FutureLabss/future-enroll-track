import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

function logAuthEvent(action: 'user_login' | 'user_logout', userId: string, email?: string) {
  supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: 'auth',
    entity_id: userId,
    details: { email: email ?? null },
  }).then(() => {});
}

type AppRole = 'admin' | 'student' | 'organization' | 'staff';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesReady: boolean;
  isAdmin: boolean;
  isOrganization: boolean;
  isStaff: boolean;
  isSuperadmin: boolean;
  isHubManager: boolean;
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
  const [isHubManager, setIsHubManager] = useState(false);
  const [demoExpiresAt, setDemoExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesReady, setRolesReady] = useState(false);
  const currentUserRef = useRef<{ id: string; email?: string } | null>(null);

  const fetchRoles = async (userId: string) => {
    try {
      const [rolesRes, saRes, memberRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('superadmins').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.from('hub_members').select('hub_role, demo_expires_at').eq('user_id', userId).maybeSingle(),
      ]);
      if (!rolesRes.error && rolesRes.data) {
        setRoles(rolesRes.data.map(r => r.role as AppRole));
      }
      setIsSuperadmin(!!saRes.data);
      setIsHubManager(memberRes.data?.hub_role === 'manager');
      const exp = memberRes.data?.demo_expires_at;
      setDemoExpiresAt(exp ? new Date(exp) : null);
    } catch (_e) {
    }
  };

  useEffect(() => {
    let initialised = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      initialised = true;
      if (session?.user) {
        currentUserRef.current = { id: session.user.id, email: session.user.email };
        await fetchRoles(session.user.id);
      }
      setRolesReady(true);
    }).catch(() => { setLoading(false); setRolesReady(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!initialised) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (event === 'SIGNED_IN') {
            logAuthEvent('user_login', session.user.id, session.user.email);
          }
          currentUserRef.current = { id: session.user.id, email: session.user.email };
          setRolesReady(false);
          await fetchRoles(session.user.id);
          setRolesReady(true);
        } else {
          if (event === 'SIGNED_OUT' && currentUserRef.current) {
            logAuthEvent('user_logout', currentUserRef.current.id, currentUserRef.current.email);
          }
          currentUserRef.current = null;
          setRoles([]);
          setIsSuperadmin(false);
          setIsHubManager(false);
          setRolesReady(true);
        }
      }
    );

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
        rolesReady,
        isAdmin: roles.includes('admin') || isSuperadmin,
        isOrganization: roles.includes('organization'),
        isStaff: roles.includes('staff') && !roles.includes('admin') && !isSuperadmin,
        isSuperadmin,
        isHubManager,
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
