import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Users, GraduationCap, CreditCard } from 'lucide-react';

export default function OrgDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ learners: 0, programs: 0, totalSponsored: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchOrgData = async () => {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
      if (!profile?.organization_id) { setLoading(false); return; }

      const { data: enrollments } = await supabase.from('enrollments').select('id, program_id, total_amount').eq('organization_id', profile.organization_id);
      const e = enrollments || [];
      const uniquePrograms = new Set(e.map(en => en.program_id)).size;
      const totalSponsored = e.reduce((s, en) => s + Number(en.total_amount), 0);

      setStats({ learners: e.length, programs: uniquePrograms, totalSponsored });
      setLoading(false);
    };
    fetchOrgData();
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

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
