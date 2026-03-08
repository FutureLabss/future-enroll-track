import { PageHeader } from '@/components/shared/PageHeader';

export default function OrgReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Detailed reports for your sponsored programs" />
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-muted-foreground">Advanced reporting features coming soon. Use the Sponsored Learners page to export your data.</p>
      </div>
    </div>
  );
}
