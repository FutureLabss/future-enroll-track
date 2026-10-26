// Weekly digests go out Mondays at 07:00 WAT. Lagos is UTC+1 all year (no DST),
// so the slot is Monday 06:00 UTC.
export function nextDigestSlot(now: Date = new Date()): Date {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
  const daysUntilMonday = (1 - slot.getUTCDay() + 7) % 7;
  slot.setUTCDate(slot.getUTCDate() + daysUntilMonday);
  if (slot.getTime() <= now.getTime()) slot.setUTCDate(slot.getUTCDate() + 7);
  return slot;
}

export function formatDigestSlot(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
  }) + ' WAT';
}
