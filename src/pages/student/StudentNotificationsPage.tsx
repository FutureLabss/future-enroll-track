import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Bell, CheckCheck, Clock, Mail, MailOpen, CalendarPlus } from 'lucide-react';

const TYPE_COLOURS: Record<string, string> = {
  payment: 'border-success/30 text-success bg-success/10',
  invoice: 'border-primary/30 text-primary bg-primary/10',
  reminder: 'border-warning/30 text-warning bg-warning/10',
  overdue: 'border-destructive/30 text-destructive bg-destructive/10',
};

function parseScheduleMessage(message: string): { display: string; gcalUrl: string | null } {
  const marker = '\n\n||GCAL||:';
  const idx = message.indexOf(marker);
  if (idx === -1) return { display: message, gcalUrl: null };
  return { display: message.slice(0, idx), gcalUrl: message.slice(idx + marker.length) };
}

function NotificationCard({ notification, onMarkRead }: { notification: any; onMarkRead: (id: string) => void }) {
  const isSchedule = notification.type === 'schedule';
  const { display, gcalUrl } = isSchedule
    ? parseScheduleMessage(notification.message)
    : { display: notification.message, gcalUrl: null };

  return (
    <div className={`rounded-xl border p-4 ${notification.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`capitalize ${TYPE_COLOURS[notification.type] || ''}`}>{notification.type}</Badge>
            <Badge variant="secondary" className="capitalize">{notification.channel}</Badge>
            {!notification.read && <Badge>New</Badge>}
          </div>
          <h3 className="font-semibold">{notification.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{display}</p>
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
            {new Date(notification.created_at).toLocaleString()}
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
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications(data || []);
    setLoading(false);
  };

  // Depend on the id, not the user object — token auto-refresh mints a new
  // object hourly and would silently re-fetch everything
  useEffect(() => {
    loadNotifications();
  }, [user?.id]);

  const unread = useMemo(() => notifications.filter(notification => !notification.read), [notifications]);
  const read = useMemo(() => notifications.filter(notification => notification.read), [notifications]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNotifications(prev => prev.map(notification => notification.id === id ? { ...notification, read: true } : notification));
  };

  const markAllRead = async () => {
    if (!user || unread.length === 0) return;
    setBusy(true);
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
    toast.success('All notifications marked as read');
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Payment updates, reminders, and account messages"
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
          <p className="text-xs text-muted-foreground">{notifications[0] ? new Date(notifications[0].created_at).toLocaleDateString() : 'You are all caught up'}</p>
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
