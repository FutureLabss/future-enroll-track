import { useState } from 'react';
import type { VenueDefaults } from '@/hooks/useVenueBookings';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const EMPTY: VenueDefaults = { venue_name: '', address: '', contact: '', facilities: '', inclusions: '', conditions: '' };

export function VenueDefaultsDialog({ defaults, onClose, onSave }: {
  defaults: VenueDefaults | null; onClose: () => void; onSave: (d: VenueDefaults) => Promise<void>;
}) {
  const [form, setForm] = useState<VenueDefaults>(defaults ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof VenueDefaults) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const ready = form.venue_name.trim() && form.facilities.trim() && form.inclusions.trim() && form.conditions.trim();
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Hall rental defaults</DialogTitle>
          <DialogDescription>Pre-filled on every new hall rental and sent to the renter in their booking email. Past bookings keep what they were sent.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="vd-name">Venue name</Label><Input id="vd-name" className="mt-1.5" value={form.venue_name} onChange={set('venue_name')} /></div>
            <div><Label htmlFor="vd-address">Address</Label><Input id="vd-address" className="mt-1.5" value={form.address ?? ''} onChange={set('address')} /></div>
            <div><Label htmlFor="vd-contact">Contact phone</Label><Input id="vd-contact" className="mt-1.5" value={form.contact ?? ''} onChange={set('contact')} /></div>
          </div>
          <div><Label htmlFor="vd-facilities">Facilities</Label><Textarea id="vd-facilities" className="mt-1.5" rows={6} value={form.facilities} onChange={set('facilities')} /></div>
          <div><Label htmlFor="vd-inclusions">What a booking includes</Label><Textarea id="vd-inclusions" className="mt-1.5" rows={5} value={form.inclusions} onChange={set('inclusions')} /></div>
          <div><Label htmlFor="vd-conditions">Conditions of use</Label><Textarea id="vd-conditions" className="mt-1.5" rows={10} value={form.conditions} onChange={set('conditions')} /></div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !ready} onClick={async () => {
            setBusy(true);
            try { await onSave(form); toast.success('Defaults saved'); onClose(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? 'Saving…' : 'Save defaults'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
