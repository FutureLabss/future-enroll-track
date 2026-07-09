import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
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
  rolesError: boolean;
  hubId: string | null;
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
  retryRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isHubManager, setIsHubManager] = useState(false);
  const [hubId, setHubId] = useState<string | null>(null);
  const [demoExpiresAt, setDemoExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesReady, setRolesReady] = useState(false);
  const [rolesError, setRolesError] = useState(false);
  const currentUserRef = useRef<{ id: string; email?: string } | null>(null);

  // Returns false when the role lookups failed (DB down/timeout) — callers must
  // surface that instead of treating the user as role-less. See docs/database-change-policy.md.
  const fetchRoles = async (userId: string): Promise<boolean> => {
    try {
      const [rolesRes, saRes, memberRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('superadmins').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.from('hub_members').select('hub_id, hub_role, demo_expires_at').eq('user_id', userId).maybeSingle(),
      ]);
      if (!rolesRes.error && rolesRes.data) {
        setRoles(rolesRes.data.map(r => r.role as AppRole));
      }
      if (!saRes.error) setIsSuperadmin(!!saRes.data);
      if (!memberRes.error) {
        setIsHubManager(memberRes.data?.hub_role === 'manager');
        setHubId(memberRes.data?.hub_id ?? null);
        const exp = memberRes.data?.demo_expires_at;
        setDemoExpiresAt(exp ? new Date(exp) : null);
      }
      // hub_members failure only degrades hub scoping; roles/superadmin decide routing
      return !rolesRes.error && !saRes.error;
    } catch (_e) {
      return false;
    }
  };

  const retryRoles = async () => {
    const userId = currentUserRef.current?.id;
    if (!userId) return;
    setRolesReady(false);
    const ok = await fetchRoles(userId);
    setRolesError(!ok);
    setRolesReady(true);
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
        const ok = await fetchRoles(session.user.id);
        setRolesError(!ok);
      }
      setRolesReady(true);
    }).catch(() => { setLoading(false); setRolesReady(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!initialised) return;
        setSession(session);
        setUser(session?.user ?? null);

        const prevUserId = currentUserRef.current?.id;
        const newUserId = session?.user?.id;

        if (newUserId && newUserId !== prevUserId) {
          if (event === 'SIGNED_IN') {
            logAuthEvent('user_login', newUserId, session!.user.email);
          }
          currentUserRef.current = { id: newUserId, email: session!.user.email };
          setRolesReady(false);
          const ok = await fetchRoles(newUserId);
          setRolesError(!ok);
          setRolesReady(true);
        } else if (!newUserId && prevUserId) {
          if (event === 'SIGNED_OUT') {
            logAuthEvent('user_logout', prevUserId, currentUserRef.current?.email);
          }
          currentUserRef.current = null;
          setRoles([]);
          setIsSuperadmin(false);
          setIsHubManager(false);
          setHubId(null);
          setRolesError(false);
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

  const value = useMemo<AuthContextType>(() => {
    // Synchronous fallback so a failed superadmins lookup (DB timeout/outage)
    // can't demote the superadmin to the student view. Display-only; RLS still
    // decides what data any session can actually read.
    const isSA = isSuperadmin || user?.email?.toLowerCase() === 'manassehudim@gmail.com';
    return {
      user,
      session,
      roles,
      loading,
      rolesReady,
      rolesError,
      hubId,
      isAdmin: roles.includes('admin') || isSA,
      isOrganization: roles.includes('organization'),
      isStaff: roles.includes('staff') && !roles.includes('admin') && !isSA,
      isSuperadmin: isSA,
      isHubManager,
      isDemo: !!demoExpiresAt && demoExpiresAt > new Date(),
      demoExpiresAt,
      signIn,
      signOut,
      signUp,
      retryRoles,
    };
  // signIn/signOut/signUp/retryRoles are defined once and never change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session, roles, loading, rolesReady, rolesError, hubId, isSuperadmin, isHubManager, demoExpiresAt]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
