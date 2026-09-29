import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test/testUtils';

const { mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}));

function makeChain(data: any, error: any = null): any {
  const result = { data, error };
  const p = Promise.resolve(result);
  const self: any = {
    select: () => self,
    eq:     () => self,
    update: () => self,
    insert: () => self,
    delete: () => self,
    single: () => p,
    then:  (res: any, rej: any) => p.then(res, rej),
    catch: (fn: any)            => p.catch(fn),
  };
  return self;
}

import { useCurriculumV2 } from '@/hooks/useCurriculumV2';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('useCurriculumV2', () => {
  it('is disabled when classroomId is empty — no RPC calls', () => {
    const { result } = renderHook(() => useCurriculumV2(''), { wrapper: createQueryWrapper() });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('fetches all curricula via a single get_classroom_curricula_trees RPC (not N+1)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only one RPC call — no separate get_curriculum_tree call per curriculum
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_classroom_curricula_trees', { p_classroom_id: 'cls-1' });
  });

  it('returns empty array when RPC returns null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.curricula).toEqual([]);
    expect(result.current.fetchError).toBeNull();
  });

  it('maps RPC payload to curricula array preserving shape', async () => {
    const trees = [
      { id: 'c1', classroom_id: 'cls-1', title: 'JS Fundamentals', description: null, created_at: '2026-01-01', tracks: [] },
      { id: 'c2', classroom_id: 'cls-1', title: 'React Basics',    description: null, created_at: '2026-02-01', tracks: [] },
    ];
    mockRpc.mockResolvedValue({ data: trees, error: null });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.curricula).toHaveLength(2);
    expect(result.current.curricula[0].title).toBe('JS Fundamentals');
    expect(result.current.curricula[1].title).toBe('React Basics');
  });

  it('exposes fetchError message and empty curricula on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fetchError).toBe('permission denied');
    expect(result.current.curricula).toEqual([]);
  });

  it('createCurriculum inserts into curricula table with classroom_id', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(makeChain({ id: 'new-id' }));

    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCurriculum('New Curriculum');
    });

    expect(mockFrom).toHaveBeenCalledWith('curricula');
  });

  it('createCurriculum propagates insert errors', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(makeChain(null, { message: 'insert failed', code: '23505' }));

    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.createCurriculum('Dupe')).rejects.toMatchObject({ message: 'insert failed' });
  });

  it('deleteCurriculum targets curricula table and propagates errors', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(makeChain(null, { message: 'delete denied' }));

    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.deleteCurriculum('c1')).rejects.toMatchObject({ message: 'delete denied' });
    expect(mockFrom).toHaveBeenCalledWith('curricula');
  });

  it('exposes refetch function', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe('function');
  });

  it('exposes all CRUD methods', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCurriculumV2('cls-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const methods = [
      'createCurriculum', 'updateCurriculum', 'deleteCurriculum', 'cloneCurriculum',
      'addTrack', 'updateTrack', 'deleteTrack',
      'addModule', 'updateModule', 'deleteModule',
      'addUnit', 'updateUnit', 'deleteUnit',
      'addLesson', 'updateLesson', 'deleteLesson',
      'refreshCurriculum', 'refetch',
    ];
    for (const m of methods) {
      expect(typeof (result.current as any)[m], `${m} should be a function`).toBe('function');
    }
  });
});
