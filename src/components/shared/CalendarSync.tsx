import { useState } from 'react';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarSync as CalendarSyncIcon, Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function CalendarSyncPanel({ active = true }: { active?: boolean }) {
  const { data: urls, loading, error, rotate } = useCalendarFeed(active);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);

  const copy = async () => {
    if (!urls) return;
    try {
      await navigator.clipboard.writeText(urls.https);
      toast.success('Calendar link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  const doRotate = async () => {
    setRotating(true);
    try {
      await rotate();
      toast.success('New calendar link created. Re-subscribe in your calendar app.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRotating(false);
      setConfirmRotate(false);
    }
  };

  if (loading) return <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  if (error || !urls) return <p className="text-sm text-destructive">Could not load your calendar link. Try again shortly.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Subscribe once and your classes, assignment due dates and cohort start and end dates stay in sync. Reschedules and cancellations update automatically (most calendar apps refresh every few hours).
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button asChild>
          <a href={urls.google} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Google Calendar</a>
        </Button>
        <Button asChild variant="outline">
          <a href={urls.webcal}><ExternalLink className="mr-1.5 h-4 w-4" />Apple Calendar</a>
        </Button>
        <Button asChild variant="outline">
          <a href={urls.outlook} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Outlook</a>
        </Button>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Or paste this link into any calendar app that supports subscribing by URL:</p>
        <div className="flex gap-2">
          <Input readOnly value={urls.https} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy calendar link"><Copy className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button asChild variant="ghost" size="sm">
          <a href={urls.https} download="futurelabs.ics"><Download className="mr-1.5 h-3.5 w-3.5" />Download .ics (one-off, won't update)</a>
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmRotate(true)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reset link
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Keep this link private: anyone who has it can see your class schedule.</p>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your calendar link?</AlertDialogTitle>
            <AlertDialogDescription>The current link stops working straight away. Calendars subscribed to it stop updating until you subscribe again with the new link.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRotate} disabled={rotating}>{rotating ? 'Resetting…' : 'Reset link'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CalendarSyncButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><CalendarSyncIcon className="mr-2 h-4 w-4" />Sync to calendar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync classes to your calendar</DialogTitle>
          <DialogDescription>Your personal, auto-updating FutureLabs calendar.</DialogDescription>
        </DialogHeader>
        <CalendarSyncPanel active={open} />
      </DialogContent>
    </Dialog>
  );
}
