import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyNotifications } from '@/hooks/useMyNotifications';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Bell, CheckCheck, Clock, Mail, MailOpen, CalendarPlus, ArrowRight } from 'lucide-react';

const TYPE_COLOURS: Record<string, string> = {
  payment: 'border-success/30 text-success bg-success/10',
  invoice: 'border-primary/30 text-primary bg-primary/10',
  reminder: 'border-warning/30 text-warning bg-warning/10',
  overdue: 'border-destructive/30 text-destructive bg-destructive/10',
  schedule: 'border-primary/30 text-primary bg-primary/10',
  schedule_changed: 'border-warning/30 text-warning bg-warning/10',
  schedule_cancelled: 'border-destructive/30 text-destructive bg-destructive/10',
  cohort_schedule_setup: 'border-warning/30 text-warning bg-warning/10',
  cohort_schedule_missing: 'border-destructive/30 text-destructive bg-destructive/10',
  assignment: 'border-primary/30 text-primary bg-primary/10',
  assignment_graded: 'border-success/30 text-success bg-success/10',
};

function parseScheduleMessage(message: string): { display: string; gcalUrl: string | null } {
  const marker = '\n\n||GCAL||:';
  const idx = message.indexOf(marker);
  if (idx === -1) return { display: message, gcalUrl: null };
  return { display: message.slice(0, idx), gcalUrl: message.slice(idx + marker.length) };
}

function NotificationCard({ notification, onMarkRead }: { notification: any; onMarkRead: (id: string) => void }) {
  const navigate = useNavigate();
  const isSchedule = notification.type === 'schedule';
  const { display, gcalUrl } = isSchedule
    ? parseScheduleMessage(notification.message)
    : { display: notification.message, gcalUrl: null };

  return (
    <div className={`rounded-xl border p-4 ${notification.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`capitalize ${TYPE_COLOURS[notification.type] || ''}`}>{notification.type.replace(/_/g, ' ')}</Badge>
            <Badge variant="secondary" className="capitalize">{notification.channel}</Badge>
            {!notification.read && <Badge>New</Badge>}
          </div>
          <h3 className="font-semibold">{notification.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{display}</p>
          {notification.link && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 mr-2"
              type="button"
              onClick={() => { if (!notification.read) onMarkRead(notification.id); navigate(notification.link); }}
            >
              Open <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
          {gcalUrl && (
            <a href={gcalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex">
              <Button size="sm" variant="outline" className="text-primary border-primary/40 hover:bg-primary/10" type="button">
                <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                Add to Google Calendar
              </Button>
            </a>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {new Date(notification.created_at).toLocaleString('en-NG')}
          </p>
        </div>
        {!notification.read && (
          <Button size="sm" variant="outline" onClick={() => onMarkRead(notification.id)}>
            <MailOpen className="mr-1.5 h-4 w-4" />
            Mark read
          </Button>
        )}
      </div>
    </div>
  );
}

export default function StudentNotificationsPage() {
  const { data: notifications, loading, markRead: markReadMutation, markAllRead: markAllReadMutation } = useMyNotifications();
  const [busy, setBusy] = useState(false);

  const unread = useMemo(() => notifications.filter(notification => !notification.read), [notifications]);
  const read = useMemo(() => notifications.filter(notification => notification.read), [notifications]);

  const markRead = async (id: string) => {
    try {
      await markReadMutation(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const markAllRead = async () => {
    if (unread.length === 0) return;
    setBusy(true);
    try {
      await markAllReadMutation();
      toast.success('All notifications marked as read');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Class schedules, assignments, cohort updates, payments and reminders"
        actions={
          <Button variant="outline" disabled={busy || unread.length === 0} onClick={markAllRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Unread</p>
          <p className="mt-2 text-2xl font-semibold">{unread.length}</p>
          <p className="text-xs text-muted-foreground">Needs attention</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Total</p>
          <p className="mt-2 text-2xl font-semibold">{notifications.length}</p>
          <p className="text-xs text-muted-foreground">Recent messages</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Latest</p>
          <p className="mt-2 truncate text-lg font-semibold">{notifications[0]?.title || 'No notifications'}</p>
          <p className="text-xs text-muted-foreground">{notifications[0] ? new Date(notifications[0].created_at).toLocaleDateString('en-NG') : 'You are all caught up'}</p>
        </div>
      </div>

      <Tabs defaultValue="unread">
        <TabsList className="mb-6">
          <TabsTrigger value="unread"><Bell className="mr-1.5 h-4 w-4" />Unread ({unread.length})</TabsTrigger>
          <TabsTrigger value="all"><Mail className="mr-1.5 h-4 w-4" />All ({notifications.length})</TabsTrigger>
          <TabsTrigger value="read">Read ({read.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="unread" className="space-y-3">
          {unread.map(notification => <NotificationCard key={notification.id} notification={notification} onMarkRead={markRead} />)}
          {unread.length === 0 && <p className="text-center text-muted-foreground py-12">No unread notifications</p>}
        </TabsContent>
        <TabsContent value="all" className="space-y-3">
          {notifications.map(notification => <NotificationCard key={notification.id} notification={notification} onMarkRead={markRead} />)}
          {notifications.length === 0 && <p className="text-center text-muted-foreground py-12">No notifications yet</p>}
        </TabsContent>
        <TabsContent value="read" className="space-y-3">
          {read.map(notification => <NotificationCard key={notification.id} notification={notification} onMarkRead={markRead} />)}
          {read.length === 0 && <p className="text-center text-muted-foreground py-12">No read notifications</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
