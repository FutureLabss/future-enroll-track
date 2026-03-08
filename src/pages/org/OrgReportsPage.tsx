import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Users, CreditCard, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['hsl(250, 84%, 54%)', 'hsl(165, 82%, 40%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(280, 65%, 60%)'];

export default function OrgReportsPage() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('organization_id').eq('user_id', user.id).single().then(async ({ data: profile }) => {
      if (!profile?.organization_id) { setLoading(false); return; }
      const { data } = await supabase.from('enrollments')
        .select('*, programs(program_name)')
        .eq('organization_id', profile.organization_id);
      setEnrollments(data || []);
      setLoading(false);
    });
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;
  const total = enrollments.reduce((s, e) => s + Number(e.total_amount), 0);
  const paid = enrollments.reduce((s, e) => s + Number(e.amount_paid), 0);

  const statusCounts = enrollments.reduce((acc: Record<string, number>, e) => {
    acc[e.enrollment_status] = (acc[e.enrollment_status] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="Reports" description="Analytics for your sponsored programs" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard title="Sponsored Learners" value={enrollments.length} icon={Users} />
        <StatCard title="Total Committed" value={formatCurrency(total)} icon={TrendingUp} />
        <StatCard title="Total Paid" value={formatCurrency(paid)} icon={CreditCard} />
      </div>
      <div className="glass-card rounded-xl p-6">
        <h3 className="font-heading font-semibold mb-4">Enrollment Status</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="text-muted-foreground text-center py-12">No data available</p>}
      </div>
    </div>
  );
}
