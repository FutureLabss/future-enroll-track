import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentRiskPanel } from '@/components/classroom/StudentRiskPanel';

const dismiss = vi.fn().mockResolvedValue(undefined);
let flags: unknown[] = [];
let uncounted: unknown[] = [];

vi.mock('@/hooks/useStudentRiskFlags', () => ({
  useStudentRiskFlags: () => ({ data: { flags, uncountedSessions: uncounted }, loading: false, dismiss }),
}));

const flag = (over: Record<string, unknown>) => ({
  id: 'f1', cohort_id: 'c1', cohort_label: 'Python 5', student_id: 's1', student_name: 'Ada Obi',
  email: 'ada@example.com', phone: '08031234567', reason: 'missed_classes',
  detail: { sessions: [{ id: 'b', at: '2026-10-22T12:00:00Z' }, { id: 'a', at: '2026-10-20T12:00:00Z' }] },
  flagged_at: '2026-10-28T07:30:00Z', dismissed: false, ...over,
});

describe('StudentRiskPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); flags = []; uncounted = []; });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<StudentRiskPanel classroomId="r1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists flagged students with contact links and dismisses', () => {
    flags = [flag({}), flag({ id: 'f2', student_name: 'Bayo', phone: null, reason: 'missing_assignment',
      detail: { assignments: [{ id: 'x', title: 'Loops', due: '2026-10-25T10:00:00Z' }] } })];
    render(<StudentRiskPanel classroomId="r1" />);
    expect(screen.getByText('2 students need attention')).toBeInTheDocument();
    expect(screen.getByText(/Missed the last two classes \(20 Oct, 22 Oct\) · Python 5/)).toBeInTheDocument();
    expect(screen.getByText(/submitted “Loops”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp Ada Obi' })).toHaveAttribute('href', 'https://wa.me/2348031234567');
    expect(screen.queryByRole('link', { name: 'WhatsApp Bayo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Ada Obi' }));
    expect(dismiss).toHaveBeenCalledWith('f1');
  });

  it('keeps dismissed students out of the count and behind a toggle', () => {
    flags = [flag({ dismissed: true })];
    render(<StudentRiskPanel classroomId="r1" />);
    expect(screen.getByText('Nobody needs attention right now')).toBeInTheDocument();
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 dismissed' }));
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
  });

  it('warns about classes where most students did not mark attendance', () => {
    uncounted = [{ cohort_label: 'React 1', at: '2026-10-22T12:00:00Z', marked: 2, cohort_size: 12 }];
    render(<StudentRiskPanel classroomId="r1" />);
    expect(screen.getByText('Attendance looks incomplete')).toBeInTheDocument();
    expect(screen.getByText(/React 1: only 2 of 12 marked in/)).toBeInTheDocument();
  });
});
