import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FilterMode } from '@/hooks/useFinanceSummary';

interface Props {
  mode: FilterMode;
  onModeChange: (m: FilterMode) => void;
  months: number;
  onMonthsChange: (n: number) => void;
  startDate?: Date;
  onStartDateChange: (d: Date | undefined) => void;
  endDate?: Date;
  onEndDateChange: (d: Date | undefined) => void;
}

export function FinanceFilterBar({ mode, onModeChange, months, onMonthsChange, startDate, onStartDateChange, endDate, onEndDateChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label className="text-xs">Mode</Label>
        <Select value={mode} onValueChange={v => onModeChange(v as FilterMode)}>
          <SelectTrigger className="w-[140px] mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="preset">Preset</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'preset' ? (
        <div>
          <Label className="text-xs">Period</Label>
          <Select value={String(months)} onValueChange={v => onMonthsChange(Number(v))}>
            <SelectTrigger className="w-[160px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">This month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 24 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div>
            <Label className="text-xs">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-[160px] mt-1 justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'MMM yyyy') : 'Pick start'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={onStartDateChange} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-[160px] mt-1 justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, 'MMM yyyy') : 'Pick end'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={onEndDateChange} disabled={d => (startDate ? d < startDate : false)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}
