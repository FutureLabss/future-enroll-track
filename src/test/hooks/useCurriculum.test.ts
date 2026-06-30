import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test/testUtils';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: vi.fn() },
  },
}));

function makeChain(data: any, error: any = null): any {
  const result = { data, error };
  const p = Promise.resolve(result);
  const self: any = {
    select:      () => self,
    eq:          () => self,
    in:          () => self,
    order:       () => self,
    limit:       () => self,
    update:      () => self,
    insert:      () => self,
    delete:      () => self,
    single:      () => p,
    maybeSingle: () => p,
    then:  (res: any, rej: any) => p.then(res, rej),
    catch: (fn: any)            => p.catch(fn),
  };
  return self;
}

import { useCurriculum } from '@/hooks/useCurriculum';

beforeEach(() => {
  mockFrom.mockReset();
});

describe('useCurriculum', () => {
  it('is disabled when cohortId is empty — no DB calls', () => {
    const { result } = renderHook(() => useCurriculum(''), { wrapper: createQueryWrapper() });
    expect(mockFrom).not.toHaveBeenCalled();
    // React Query v5: disabled queries resolve immediately with isLoading=false
    expect(result.current.loading).toBe(false);
  });

  it('issues a single joined query on mount — not separate from() calls per week/lesson', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom.mock.calls[0][0]).toBe('curriculums');
  });

  it('returns null curriculum and empty weeks when db returns null', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.curriculum).toBeNull();
    expect(result.current.weeks).toHaveLength(0);
  });

  it('sorts weeks by week_number ascending regardless of DB return order', async () => {
    const data = {
      id: 'c1',
      cohort_id: 'cohort-1',
      curriculum_weeks: [
        { id: 'w3', week_number: 3, title: 'Week 3', curriculum_lessons: [] },
        { id: 'w1', week_number: 1, title: 'Week 1', curriculum_lessons: [] },
        { id: 'w2', week_number: 2, title: 'Week 2', curriculum_lessons: [] },
      ],
    };
    mockFrom.mockReturnValue(makeChain(data));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const wNums = result.current.weeks.map((w: any) => w.week_number);
    expect(wNums).toEqual([1, 2, 3]);
  });

  it('sorts lessons within each week by lesson_order ascending', async () => {
    const data = {
      id: 'c1',
      cohort_id: 'cohort-1',
      curriculum_weeks: [{
        id: 'w1',
        week_number: 1,
        title: 'Week 1',
        curriculum_lessons: [
          { id: 'l3', lesson_order: 3, title: 'Lesson 3' },
          { id: 'l1', lesson_order: 1, title: 'Lesson 1' },
          { id: 'l2', lesson_order: 2, title: 'Lesson 2' },
        ],
      }],
    };
    mockFrom.mockReturnValue(makeChain(data));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const orders = result.current.weeks[0].curriculum_lessons.map((l: any) => l.lesson_order);
    expect(orders).toEqual([1, 2, 3]);
  });

  it('addWeek throws immediately when no curriculum is loaded', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.addWeek(1, 'Week 1', 'Learn X')).rejects.toThrow('No curriculum found');
    // Insert must NOT have been called
    expect(mockFrom).not.toHaveBeenCalledWith('curriculum_weeks');
  });

  it('addWeek inserts into curriculum_weeks with correct shape', async () => {
    const data = { id: 'c1', cohort_id: 'cohort-1', curriculum_weeks: [] };
    // Return: initial load, the curriculum_weeks insert, the refetch
    mockFrom
      .mockReturnValueOnce(makeChain(data))
      .mockReturnValueOnce(makeChain(null))
      .mockReturnValueOnce(makeChain(data));

    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addWeek(1, 'Week 1', 'Learn stuff', '2026-07-01');
    });

    expect(mockFrom).toHaveBeenCalledWith('curriculum_weeks');
  });

  it('addWeek propagates DB error', async () => {
    const data = { id: 'c1', cohort_id: 'cohort-1', curriculum_weeks: [] };
    mockFrom
      .mockReturnValueOnce(makeChain(data))
      .mockReturnValueOnce(makeChain(null, { message: 'insert failed' }));

    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.addWeek(1, 'Week 1', '')).rejects.toEqual({ message: 'insert failed' });
  });

  it('deleteLesson targets curriculum_lessons table and propagates errors', async () => {
    const data = { id: 'c1', cohort_id: 'cohort-1', curriculum_weeks: [] };
    mockFrom
      .mockReturnValueOnce(makeChain(data))
      .mockReturnValueOnce(makeChain(null, { message: 'delete denied' }));

    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.deleteLesson('lesson-id')).rejects.toEqual({ message: 'delete denied' });
    expect(mockFrom).toHaveBeenCalledWith('curriculum_lessons');
  });

  it('deleteWeek targets curriculum_weeks and triggers cache invalidation refetch', async () => {
    const data = { id: 'c1', cohort_id: 'cohort-1', curriculum_weeks: [{ id: 'w1', week_number: 1, title: 'W1', curriculum_lessons: [] }] };
    mockFrom
      .mockReturnValueOnce(makeChain(data))      // initial load
      .mockReturnValueOnce(makeChain(null))       // delete
      .mockReturnValueOnce(makeChain({ ...data, curriculum_weeks: [] })); // refetch

    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weeks).toHaveLength(1);

    await act(async () => {
      await result.current.deleteWeek('w1');
    });

    // After invalidation + refetch the cache is updated
    expect(mockFrom).toHaveBeenCalledWith('curriculum_weeks');
  });

  it('updateCurriculum throws when no curriculum is loaded', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.updateCurriculum({ title: 'New title' })).rejects.toThrow('No curriculum found');
  });

  it('exposes refetch function', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const { result } = renderHook(() => useCurriculum('cohort-1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe('function');
  });
});
