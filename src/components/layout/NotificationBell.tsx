import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMyNotifications, type MyNotification } from '@/hooks/useMyNotifications';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG');
}

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { isAdmin, isStaff, isOrganization, isMarketing } = useAuth();
  const { data, unreadCount, markRead, markAllRead } = useMyNotifications();
  const [open, setOpen] = useState(false);

  const inboxPath = isAdmin || isStaff || isOrganization || isMarketing ? '/notifications' : '/student/notifications';
  const recent = data.slice(0, 8);

  const openNotification = async (n: MyNotification) => {
    setOpen(false);
    if (!n.read) markRead(n.id).catch(() => undefined);
    navigate(n.link || inboxPath);
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-9 w-9', className)}
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!unreadCount} onClick={handleMarkAll}>
            <CheckCheck className="mr-1 h-3.5 w-3.5" />Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up</p>}
          {recent.map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n)}
              className={cn(
                'block w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60',
                !n.read && 'bg-primary/5',
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.message.split('\n\n||GCAL||')[0]}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => { setOpen(false); navigate(inboxPath); }}>
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
