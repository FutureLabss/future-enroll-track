const LABEL: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function clock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 || 12;
  return `${m ? `${hour}:${String(m).padStart(2, '0')}` : hour}${h >= 12 ? 'pm' : 'am'}`;
}

// "Mon, Wed & Fri, 10am–11am". Mirrors describePattern in supabase/functions/_shared/cohortInvite.ts.
export function describeClassPattern(days: string[] | null | undefined, start?: string | null, end?: string | null): string | null {
  if (!days?.length || !start || !end) return null;
  const names = [...days].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(d => LABEL[d] ?? d);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
  return `${list}, ${clock(start)}–${clock(end)}`;
}
