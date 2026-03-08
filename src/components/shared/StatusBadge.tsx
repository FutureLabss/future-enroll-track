import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/15 text-warning border-warning/30',
  active: 'bg-success/15 text-success border-success/30',
  overdue: 'bg-destructive/15 text-destructive border-destructive/30',
  completed: 'bg-primary/15 text-primary border-primary/30',
  paid: 'bg-success/15 text-success border-success/30',
  cancelled: 'bg-muted text-muted-foreground border-muted',
  draft: 'bg-muted text-muted-foreground border-muted',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium capitalize', statusStyles[status] || '')}>
      {status}
    </Badge>
  );
}
