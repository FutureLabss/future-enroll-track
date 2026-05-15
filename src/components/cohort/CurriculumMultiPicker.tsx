import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BookOpen } from 'lucide-react';

interface Props {
  cohortId?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function CurriculumMultiPicker({ cohortId, selectedIds, onChange }: Props) {
  const [curricula, setCurricula] = useState<{ id: string; title: string; cohort_id: string | null }[]>([]);

  useEffect(() => {
    // Show unassigned curricula + ones already assigned to this cohort
    let query = supabase.from('curriculums').select('id, title, cohort_id').order('created_at', { ascending: false });
    if (cohortId) {
      query = query.or(`cohort_id.is.null,cohort_id.eq.${cohortId}`);
    } else {
      query = query.is('cohort_id', null);
    }
    query.then(({ data }) => setCurricula(data || []));
  }, [cohortId]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    );
  };

  if (curricula.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <BookOpen className="h-4 w-4 opacity-40" />
        No curricula available — create one from within a cohort first.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-44 overflow-y-auto border border-border rounded-lg p-3">
      {curricula.map(c => (
        <div key={c.id} className="flex items-center gap-2.5">
          <Checkbox
            id={`cur-${c.id}`}
            checked={selectedIds.includes(c.id)}
            onCheckedChange={() => toggle(c.id)}
          />
          <Label htmlFor={`cur-${c.id}`} className="text-sm font-normal cursor-pointer leading-tight">
            {c.title}
          </Label>
        </div>
      ))}
    </div>
  );
}
