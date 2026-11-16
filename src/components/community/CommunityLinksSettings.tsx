import { useEffect, useState } from 'react';
import { useHubCommunityLinks } from '@/hooks/useCommunityLinks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const WHATSAPP = /^https:\/\/chat\.whatsapp\.com\//;
const SLACK = /^https:\/\/join\.slack\.com\//;

export function CommunityLinksSettings() {
  const { data, save } = useHubCommunityLinks();
  const [whatsapp, setWhatsapp] = useState('');
  const [slack, setSlack] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) { setWhatsapp(data.whatsapp_group_url ?? ''); setSlack(data.slack_invite_url ?? ''); }
  }, [data]);

  const submit = async () => {
    if (whatsapp.trim() && !WHATSAPP.test(whatsapp.trim())) { toast.error('The WhatsApp link should start with https://chat.whatsapp.com/'); return; }
    if (slack.trim() && !SLACK.test(slack.trim())) { toast.error('The Slack link should start with https://join.slack.com/'); return; }
    setBusy(true);
    try {
      await save(whatsapp, slack);
      toast.success('Community links saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <p className="font-medium">Community links</p>
          <p className="mt-1 text-sm text-muted-foreground">Sent in the "enrollment confirmed" email when a payment is approved, and shown on every enrolled student's dashboard.</p>
        </div>
        <div>
          <Label htmlFor="community-whatsapp">WhatsApp group invite</Label>
          <Input id="community-whatsapp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://chat.whatsapp.com/…" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="community-slack">Slack invite</Label>
          <Input id="community-slack" value={slack} onChange={e => setSlack(e.target.value)} placeholder="https://join.slack.com/…" className="mt-1.5" />
          <p className="mt-1 text-xs text-muted-foreground">Set the Slack link to never expire, or it stops working after 30 days.</p>
        </div>
        <Button size="sm" onClick={submit} disabled={busy}>Save links</Button>
      </CardContent>
    </Card>
  );
}
