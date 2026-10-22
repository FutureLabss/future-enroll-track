import { useStaffOptions, type StaffOption } from '@/hooks/useStaffOptions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function PrimaryTutorSelect({ value, onChange, staffList, className }: {
  value: string;
  onChange: (id: string) => void;
  staffList?: StaffOption[];
  className?: string;
}) {
  const options = useStaffOptions(staffList);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="Select the primary tutor" /></SelectTrigger>
      <SelectContent>
        {options.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
