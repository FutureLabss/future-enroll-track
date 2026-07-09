import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ReactNode } from 'react';

const mocks = vi.hoisted(() => {
  const state = {
    session: null as unknown,
    tables: {} as Record<string, { data: unknown; error: unknown }>,
  };
  const from = vi.fn((table: string) => {
    const result = () => Promise.resolve(state.tables[table] ?? { data: null, error: null });
    const eqResult = result() as Promise<unknown> & { maybeSingle: () => Promise<unknown> };
    eqResult.maybeSingle = result;
    return {
      select: () => ({ eq: () => eqResult }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
  });
  return {
    state,
    supabase: {
      from,
      auth: {
        getSession: vi.fn(async () => ({ data: { session: state.session } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: mocks.supabase }));

import { AuthProvider, useAuth } from '@/hooks/useAuth';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const sessionFor = (email: string) => ({ user: { id: 'u1', email } });

const rolesOk = () => {
  mocks.state.tables = {
    user_roles: { data: [{ role: 'admin' }], error: null },
    superadmins: { data: { user_id: 'u1' }, error: null },
    hub_members: { data: null, error: null },
  };
};

const rolesFailing = () => {
  const err = { data: null, error: { message: 'canceling statement due to statement timeout' } };
  mocks.state.tables = { user_roles: err, superadmins: err, hub_members: err };
};

beforeEach(() => {
  mocks.state.session = null;
  mocks.state.tables = {};
});

describe('useAuth role fetching', () => {
  it('sets roles and no error when queries succeed', async () => {
    mocks.state.session = sessionFor('staffer@futurelabs.ng');
    rolesOk();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.rolesReady).toBe(true));
    expect(result.current.roles).toEqual(['admin']);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSuperadmin).toBe(true);
    expect(result.current.rolesError).toBe(false);
  });

  it('flags rolesError instead of treating a failed fetch as "no roles"', async () => {
    mocks.state.session = sessionFor('staffer@futurelabs.ng');
    rolesFailing();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.rolesReady).toBe(true));
    expect(result.current.rolesError).toBe(true);
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
  });

  it('keeps superadmin routing via email fallback even when the role fetch fails', async () => {
    mocks.state.session = sessionFor('manassehudim@gmail.com');
    rolesFailing();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.rolesReady).toBe(true));
    expect(result.current.rolesError).toBe(true);
    expect(result.current.isSuperadmin).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });

  it('retryRoles recovers after the database comes back', async () => {
    mocks.state.session = sessionFor('staffer@futurelabs.ng');
    rolesFailing();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.rolesError).toBe(true));

    rolesOk();
    await act(() => result.current.retryRoles());

    await waitFor(() => expect(result.current.rolesReady).toBe(true));
    expect(result.current.rolesError).toBe(false);
    expect(result.current.isAdmin).toBe(true);
  });
});
