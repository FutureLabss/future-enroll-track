export interface EngagementStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}

export function engagementSummary(s: EngagementStats | undefined): string | null {
  if (!s || s.sent === 0) return null;
  const pct = (n: number) => `${Math.round((n / s.sent) * 100)}%`;
  const parts = [`${s.opened} opened (${pct(s.opened)})`, `${s.clicked} clicked`];
  if (s.bounced) parts.push(`${s.bounced} bounced`);
  if (s.complained) parts.push(`${s.complained} marked as spam`);
  return parts.join(' · ');
}
