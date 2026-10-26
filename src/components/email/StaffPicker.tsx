import { useMemo, useState } from 'react';
import type { StaffMember } from '@/hooks/useStaffDirectory';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Props {
  staff: StaffMember[];
  value: string[];
  onChange: (ids: string[]) => void;
}

// Pick exactly which staff receive an email. Staff without an email address are
// shown but can't be selected.
export function StaffPicker({ staff, value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const mailable = staff.filter(s => s.email);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? staff.filter(s => [s.full_name, s.email, s.role_title].some(v => v?.toLowerCase().includes(q)))
      : staff;
  }, [staff, search]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…" className="h-9 pl-8" />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(mailable.map(s => s.id))}>All</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>None</Button>
      </div>
      <p className="text-xs text-muted-foreground">{value.length} of {mailable.length} staff selected</p>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
        {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No staff match</p>}
        {visible.map(s => (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 ${s.email ? 'hover:bg-muted/50' : 'cursor-not-allowed opacity-60'}`}
          >
            <Checkbox checked={selected.has(s.id)} disabled={!s.email} onCheckedChange={() => s.email && toggle(s.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.full_name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {s.email || 'No email address'}{s.role_title ? ` · ${s.role_title}` : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
