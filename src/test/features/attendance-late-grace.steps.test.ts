import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { renderHook } from '@testing-library/react';
import { vi, expect } from 'vitest';
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
  const self: any = {
    select: () => self,
    eq: () => self,
    in: () => self,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (fn: any, rej: any) => Promise.resolve(result).then(fn, rej),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  };
  return self;
}

import { useAttendance } from '@/hooks/useAttendance';

const feature = await loadFeature('src/test/features/attendance-late-grace.feature');

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  // vitest-cucumber runs each Given/When/Then as its own vitest test case
  // sharing state only through closures — a vitest `beforeEach` would fire
  // *between* When and Then and wipe the mock's call history before the
  // assertion ever runs. BeforeEachScenario fires once, before the whole
  // scenario, which is what we actually want.
  BeforeEachScenario(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue(makeChain([]));
    mockRpc.mockResolvedValue({ data: { id: 'session-1' }, error: null });
  });

  Scenario('Staff choose a grace window shorter than the session duration', ({ Given, When, Then }) => {
    let generateSession: ReturnType<typeof useAttendance>['generateSession'];
    let rpcArgs: any;

    Given('staff are starting a 30 minute attendance session', () => {
      const { result } = renderHook(() => useAttendance('classroom-1'), { wrapper: createQueryWrapper() });
      generateSession = result.current.generateSession;
    });

    When('they set the late-grace window to 15 minutes', async () => {
      await generateSession(null, 'cohort-1', 30, null, 15);
      rpcArgs = mockRpc.mock.calls[0]?.[1];
    });

    Then('the session is created with a 15 minute late-grace window', () => {
      expect(rpcArgs).toMatchObject({ p_duration_mins: 30, p_late_after_mins: 15 });
    });
  });

  Scenario('No grace window is chosen', ({ Given, When, Then }) => {
    let generateSession: ReturnType<typeof useAttendance>['generateSession'];
    let rpcArgs: any;

    Given('staff are starting a 30 minute attendance session', () => {
      const { result } = renderHook(() => useAttendance('classroom-1'), { wrapper: createQueryWrapper() });
      generateSession = result.current.generateSession;
    });

    When('they do not set a late-grace window', async () => {
      await generateSession(null, 'cohort-1', 30, null);
      rpcArgs = mockRpc.mock.calls[0]?.[1];
    });

    Then('the session is created with the default 10 minute late-grace window', () => {
      expect(rpcArgs).toMatchObject({ p_late_after_mins: 10 });
    });
  });
});
