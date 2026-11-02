import { useEffect, useState } from 'react';
import { useWhatsAppConsent } from '@/hooks/useWhatsAppConsent';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

// Asks the student (once, on the dashboard; any time, on the profile) whether we may
// WhatsApp them, and whether we may contact their guardian about overdue fees.
export function WhatsAppConsentCard({ onlyUnanswered = false }: { onlyUnanswered?: boolean }) {
  const { data, save } = useWhatsAppConsent();
  const [whatsapp, setWhatsapp] = useState(true);
  const [guardian, setGuardian] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.asked) { setWhatsapp(data.whatsapp); setGuardian(data.guardian); }
  }, [data]);

  if (!data?.has_enrollment || (onlyUnanswered && data.asked)) return null;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 pt-6">
        <p className="flex items-center gap-2 font-medium"><MessageCircle className="h-4 w-4 text-primary" />WhatsApp updates</p>
        <p className="text-sm text-muted-foreground">
          Payment reminders, receipts and class updates{data.phone ? ` to ${data.phone}` : ''}. You can change this here at any time.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={whatsapp} onCheckedChange={v => setWhatsapp(Boolean(v))} />
          Send me payment and class updates on WhatsApp
        </label>
        {data.guardian_phone && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={guardian} onCheckedChange={v => setGuardian(Boolean(v))} />
            FutureLabs may contact my parent or guardian ({data.guardian_phone}) if my fees are more than 30 days overdue
          </label>
        )}
        <Button size="sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await save(whatsapp, Boolean(data.guardian_phone) && guardian); toast.success('Saved'); }
          catch (e) { toast.error((e as Error).message); }
          finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save'}</Button>
      </CardContent>
    </Card>
  );
}
