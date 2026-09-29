import { useMemo } from 'react';
import { useOrgEnrollments } from '@/hooks/useOrgEnrollments';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Users, GraduationCap, CreditCard } from 'lucide-react';

const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

export default function OrgDashboard() {
  const { enrollments, loading } = useOrgEnrollments();

  const stats = useMemo(() => ({
    learners: enrollments.length,
    programs: new Set(enrollments.map((en: any) => en.program_id)).size,
    totalSponsored: enrollments.reduce((s: number, en: any) => s + Number(en.total_amount), 0),
  }), [enrollments]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="Sponsor Dashboard" description="Overview of your sponsored enrollments" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Sponsored Learners" value={stats.learners} icon={Users} />
        <StatCard title="Programs Sponsored" value={stats.programs} icon={GraduationCap} />
        <StatCard title="Total Sponsored" value={formatCurrency(stats.totalSponsored)} icon={CreditCard} />
      </div>
    </div>
  );
}
