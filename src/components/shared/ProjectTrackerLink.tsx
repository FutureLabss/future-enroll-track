import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { launchProjectTracker, TrackerAccessError, TrackerAuthenticationError } from '@/services/projectTracker';

export function ProjectTrackerLink() {
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const navigate = useNavigate();
  const launch = async () => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    try {
      await launchProjectTracker();
    } catch (error) {
      if (error instanceof TrackerAuthenticationError) {
        toast.error('Please sign in again to open Project Tracker.');
        navigate('/login');
      } else if (error instanceof TrackerAccessError) {
        toast.error('You do not have Project Tracker access. Ask the administrator to grant it.');
      } else {
        toast.error('Unable to open Project Tracker. Please try again or contact support.');
      }
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return <Button variant="ghost" disabled={opening} aria-busy={opening} onClick={launch}
    className="w-full justify-start gap-3 px-3 py-2.5 h-auto text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
    {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4" />}
    {opening ? 'Opening Project Tracker...' : 'Project Tracker'}
  </Button>;
}
