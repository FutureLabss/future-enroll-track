import { useMyCommunityLinks } from '@/hooks/useCommunityLinks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Users } from 'lucide-react';

export function CommunityLinksCard() {
  const { data } = useMyCommunityLinks();
  if (data.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 pt-6">
        <p className="flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-primary" />Join the community</p>
        <p className="text-sm text-muted-foreground">Class updates, announcements and help from tutors and classmates happen here.</p>
        {data.map(l => (
          <div key={l.hub_name} className="flex flex-wrap gap-2">
            {l.whatsapp_group_url && (
              <Button asChild size="sm" variant="outline">
                <a href={l.whatsapp_group_url} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp group{data.length > 1 ? ` (${l.hub_name})` : ''}</a>
              </Button>
            )}
            {l.slack_invite_url && (
              <Button asChild size="sm" variant="outline">
                <a href={l.slack_invite_url} target="_blank" rel="noreferrer">Slack{data.length > 1 ? ` (${l.hub_name})` : ''}</a>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
