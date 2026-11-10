import type { BookingInput } from '@/hooks/useVenueBookings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// The hall-rental part of the Record Income form. Facilities, inclusions and
// conditions start from the hub's defaults and can be changed for this booking only.
export function HallBookingFields({ value, onChange }: { value: BookingInput; onChange: (v: BookingInput) => void }) {
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
      <p className="text-sm font-medium">Hall booking</p>
      <div>
        <Label htmlFor="hb-venue">Venue</Label>
        <Input id="hb-venue" className="mt-1.5" value={value.venue_name} onChange={e => set('venue_name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="hb-date">Date of use *</Label>
          <Input id="hb-date" className="mt-1.5" type="date" value={value.usage_date} onChange={e => set('usage_date', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hb-end-date">Last day (if several)</Label>
          <Input id="hb-end-date" className="mt-1.5" type="date" min={value.usage_date} value={value.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} />
        </div>
        <div>
          <Label htmlFor="hb-start">Start time *</Label>
          <Input id="hb-start" className="mt-1.5" type="time" value={value.start_time} onChange={e => set('start_time', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hb-end">End time *</Label>
          <Input id="hb-end" className="mt-1.5" type="time" value={value.end_time} onChange={e => set('end_time', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hb-purpose">Event</Label>
          <Input id="hb-purpose" className="mt-1.5" placeholder="e.g. Training, wedding meeting" value={value.purpose ?? ''} onChange={e => set('purpose', e.target.value || null)} />
        </div>
        <div>
          <Label htmlFor="hb-guests">Guests</Label>
          <Input id="hb-guests" className="mt-1.5" type="number" min={1} value={value.guests ?? ''} onChange={e => set('guests', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div>
        <Label htmlFor="hb-facilities">Facilities they can use</Label>
        <Textarea id="hb-facilities" className="mt-1.5" rows={4} value={value.facilities} onChange={e => set('facilities', e.target.value)} />
      </div>
      <div>
        <Label htmlFor="hb-inclusions">What the booking includes</Label>
        <Textarea id="hb-inclusions" className="mt-1.5" rows={4} value={value.inclusions} onChange={e => set('inclusions', e.target.value)} />
      </div>
      <div>
        <Label htmlFor="hb-conditions">Conditions of use</Label>
        <Textarea id="hb-conditions" className="mt-1.5" rows={5} value={value.conditions} onChange={e => set('conditions', e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Start lines with "-" for bullets or "1." for a numbered list. Changes here apply to this booking only.</p>
    </div>
  );
}
