import { describe, it, expect } from 'vitest';
import { engagementSummary } from '@/lib/engagement';

describe('engagementSummary', () => {
  it('shows opens as a share of what was sent, and only mentions problems that happened', () => {
    expect(engagementSummary({ sent: 4, delivered: 4, opened: 1, clicked: 0, bounced: 0, complained: 0 })).toBe('1 opened (25%) · 0 clicked');
  });

  it('has nothing to say before anything is sent', () => {
    expect(engagementSummary(undefined)).toBeNull();
    expect(engagementSummary({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 })).toBeNull();
  });
});
