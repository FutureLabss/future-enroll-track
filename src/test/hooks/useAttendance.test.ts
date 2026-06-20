import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test/testUtils';

// ---------------------------------------------------------------------------
// Supabase mock — every chain method returns `self` (thenable),
// so the hook can do either: `await chain.eq()` or `await chain.order()`.
// ---------------------------------------------------------------------------
const { mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}));

function makeChain(data: any, error: any = null): any {
  const result = { data, error };
  const promise = Promise.resolve(result);
  const self: any = {
    select: () => self,
    eq:     () => self,
    in:     () => self,
    order:  () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    // thenable — so `await self.eq(...)` resolves to { data, error }
    then:  (fn: any, rej: any) => promise.then(fn, rej),
    catch: (fn: any)           => promise.catch(fn),
  };
  return self;
}

import { useMarkAttendance, useAttendanceSession } from '@/hooks/useAttendance';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

// ---------------------------------------------------------------------------
// useMarkAttendance
// ---------------------------------------------------------------------------
describe('useMarkAttendance', () => {
  it('calls mark_attendance RPC with correct args', async () => {
    mockRpc.mockResolvedValue({ data: { attendance_status: 'present' }, error: null });
    const { result } = renderHook(() => useMarkAttendance());
    await result.current.markAttendance('ABC123', 6.5244, 3.3792);

    expect(mockRpc).toHaveBeenCalledWith('mark_attendance', {
      p_code: 'ABC123',
      p_student_lat: 6.5244,
      p_student_lng: 3.3792,
    });
  });

  it('uppercases the code before sending', async () => {
    mockRpc.mockResolvedValue({ data: { attendance_status: 'present' }, error: null });
    const { result } = renderHook(() => useMarkAttendance());
    await result.current.markAttendance('abc123');

    expect(mockRpc).toHaveBeenCalledWith('mark_attendance', expect.objectContaining({ p_code: 'ABC123' }));
  });

  it('passes null for lat/lng when not provided', async () => {
    mockRpc.mockResolvedValue({ data: { attendance_status: 'present' }, error: null });
    const { result } = renderHook(() => useMarkAttendance());
    await result.current.markAttendance('XYZ999');

    expect(mockRpc).toHaveBeenCalledWith('mark_attendance', {
      p_code: 'XYZ999',
      p_student_lat: null,
      p_student_lng: null,
    });
  });

  it('returns the RPC data on success', async () => {
    mockRpc.mockResolvedValue({ data: { attendance_status: 'late', distance_metres: 45 }, error: null });
    const { result } = renderHook(() => useMarkAttendance());
    const data = await result.current.markAttendance('CODE01');

    expect(data).toEqual({ attendance_status: 'late', distance_metres: 45 });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session expired' } });
    const { result } = renderHook(() => useMarkAttendance());

    await expect(result.current.markAttendance('BADCD')).rejects.toEqual({ message: 'session expired' });
  });
});

// ---------------------------------------------------------------------------
// useAttendanceSession
// ---------------------------------------------------------------------------
describe('useAttendanceSession', () => {
  it('starts in loading state', () => {
    // minimal stubs so the hook doesn't crash
    mockFrom.mockReturnValue(makeChain([]));
    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('loads present records with enriched profiles', async () => {
    // Call order: attendance_records, attendance_sessions, profiles (records), classroom_students, profiles (enrolled)
    mockFrom
      .mockReturnValueOnce(makeChain([
        { id: 'rec-1', student_id: 'stu-a', attendance_status: 'present', marked_at: '2026-06-01T10:00:00Z', lat: null },
      ]))
      .mockReturnValueOnce(makeChain({ cohort_id: null, classroom_id: 'cls-1' }))
      .mockReturnValueOnce(makeChain([{ user_id: 'stu-a', full_name: 'Alice', email: 'alice@test.com' }]))
      .mockReturnValueOnce(makeChain([{ student_id: 'stu-a' }]))
      .mockReturnValueOnce(makeChain([{ user_id: 'stu-a', full_name: 'Alice', email: 'alice@test.com' }]));

    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].attendance_status).toBe('present');
    expect(result.current.records[0].profiles?.full_name).toBe('Alice');
  });

  it('correctly identifies absent students (enrolled but no record)', async () => {
    // Alice attended; Bob did not
    mockFrom
      .mockReturnValueOnce(makeChain([
        { id: 'rec-1', student_id: 'stu-a', attendance_status: 'present', marked_at: '2026-06-01T10:00:00Z', lat: null },
      ]))
      .mockReturnValueOnce(makeChain({ cohort_id: null, classroom_id: 'cls-1' }))
      .mockReturnValueOnce(makeChain([{ user_id: 'stu-a', full_name: 'Alice', email: 'alice@test.com' }]))
      .mockReturnValueOnce(makeChain([{ student_id: 'stu-a' }, { student_id: 'stu-b' }]))
      .mockReturnValueOnce(makeChain([
        { user_id: 'stu-a', full_name: 'Alice', email: 'alice@test.com' },
        { user_id: 'stu-b', full_name: 'Bob',   email: 'bob@test.com'   },
      ]));

    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(1);
    expect(result.current.absentStudents).toHaveLength(1);
    expect(result.current.absentStudents[0].student_id).toBe('stu-b');
    expect(result.current.absentStudents[0].profiles?.full_name).toBe('Bob');
  });

  it('uses cohort_students when session has a cohort_id', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain({ cohort_id: 'coh-1', classroom_id: 'cls-1' }))
      .mockReturnValueOnce(makeChain([{ student_id: 'stu-a' }]))
      .mockReturnValueOnce(makeChain([]));

    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fromCalls = mockFrom.mock.calls.map(([table]: [string]) => table);
    expect(fromCalls).toContain('cohort_students');
    expect(fromCalls).not.toContain('classroom_students');
  });

  it('uses classroom_students when session has no cohort_id', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain({ cohort_id: null, classroom_id: 'cls-1' }))
      .mockReturnValueOnce(makeChain([{ student_id: 'stu-a' }]))
      .mockReturnValueOnce(makeChain([]));

    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fromCalls = mockFrom.mock.calls.map(([table]: [string]) => table);
    expect(fromCalls).toContain('classroom_students');
    expect(fromCalls).not.toContain('cohort_students');
  });

  it('sets loading to false even when session is not found', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain(null));  // session not found

    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(0);
    expect(result.current.absentStudents).toHaveLength(0);
  });

  it('does nothing when sessionId is empty', () => {
    const { result } = renderHook(() => useAttendanceSession(''), { wrapper: createQueryWrapper() });
    // Should not call from() at all
    expect(mockFrom).not.toHaveBeenCalled();
    // React Query v5: disabled queries resolve immediately with isLoading=false
    expect(result.current.loading).toBe(false);
  });

  it('exposes a refetch function', async () => {
    mockFrom.mockReturnValue(makeChain([]));
    const { result } = renderHook(() => useAttendanceSession('session-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe('function');
  });
});
