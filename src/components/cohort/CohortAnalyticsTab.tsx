import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { StatCard } from '@/components/shared/StatCard';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, DollarSign, CheckCircle, Users } from 'lucide-react';
import { useCohortAnalytics } from '@/hooks/useCohortAnalytics';

const STUDENT_LIST_CAP = 50;

const fmt = (val: number) =>
  `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const ENROLLMENT_ROWS = [
  { key: 'active_count',    label: 'Active',    bar: 'bg-success'           },
  { key: 'pending_count',   label: 'Pending',   bar: 'bg-warning'           },
  { key: 'overdue_count',   label: 'Overdue',   bar: 'bg-destructive'       },
  { key: 'completed_count', label: 'Completed', bar: 'bg-muted-foreground'  },
  { key: 'cancelled_count', label: 'Cancelled', bar: 'bg-muted'             },
] as const;

interface Props {
  cohortId: string;
}

export function CohortAnalyticsTab({ cohortId }: Props) {
  const { analytics, loading } = useCohortAnalytics(cohortId);

  const paymentRate = useMemo(() => {
    if (!analytics?.enrollment.total_invoiced) return 0;
    return Math.round(
      (analytics.enrollment.total_paid / analytics.enrollment.total_invoiced) * 100,
    );
  }, [analytics]);

  const studentRows = useMemo(
    () =>
      (analytics?.students ?? []).map(s => ({
        ...s,
        rate: s.total_sessions > 0
          ? Math.round((s.sessions_attended / s.total_sessions) * 100)
          : 0,
      })),
    [analytics],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin h-7 w-7 text-primary" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        No analytics data available for this cohort.
      </p>
    );
  }

  const { enrollment, sessions, attendance, trend } = analytics;

  return (
    <div className="space-y-8">
      {/* KPI stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Attendance Rate"
          value={`${attendance.attendance_rate}%`}
          icon={TrendingUp}
          trend={`${attendance.present_count + attendance.late_count} attended of ${sessions.closed_sessions * enrollment.total_students} expected`}
          trendUp={attendance.attendance_rate >= 70}
        />
        <StatCard
          title="Payment Collection"
          value={`${paymentRate}%`}
          icon={DollarSign}
          trend={`${fmt(enrollment.total_paid)} of ${fmt(enrollment.total_invoiced)}`}
          trendUp={paymentRate >= 80}
        />
        <StatCard
          title="Sessions Done"
          value={sessions.closed_sessions}
          icon={CheckCircle}
          trend={
            sessions.open_sessions > 0
              ? `${sessions.open_sessions} currently open`
              : 'None open'
          }
          trendUp={sessions.open_sessions === 0}
        />
        <StatCard
          title="Active Students"
          value={enrollment.active_count}
          icon={Users}
          trend={`${enrollment.total_students} total enrolled`}
          trendUp={enrollment.overdue_count === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment breakdown */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold mb-4">Enrollment Breakdown</h3>
          <div className="space-y-3">
            {ENROLLMENT_ROWS.filter(r => enrollment[r.key] > 0).map(row => {
              const pct = enrollment.total_students > 0
                ? Math.round((enrollment[row.key] / enrollment.total_students) * 100)
                : 0;
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="text-sm w-20 shrink-0">{row.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${row.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">
                    {enrollment[row.key]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
            <span className="text-muted-foreground">Outstanding balance</span>
            <span className="font-semibold">{fmt(enrollment.total_outstanding)}</span>
          </div>
        </div>

        {/* Attendance trend chart */}
        {trend.length > 0 ? (
          <div className="glass-card rounded-xl p-5">
            <h3 className="font-semibold mb-4">
              Attendance Trend
              <span className="text-muted-foreground font-normal text-sm ml-2">
                (last {trend.length} sessions)
              </span>
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={trend}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="present" name="Present" stackId="a" fill="hsl(142 76% 36%)" />
                <Bar dataKey="late"    name="Late"    stackId="a" fill="hsl(38 92% 50%)"  />
                <Bar
                  dataKey="absent"
                  name="Absent"
                  stackId="a"
                  fill="hsl(var(--destructive))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No closed attendance sessions yet.
            </p>
          </div>
        )}
      </div>

      {/* Student attendance leaderboard */}
      {studentRows.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold mb-4">Student Attendance</h3>
          <div className="space-y-2">
            {studentRows.slice(0, STUDENT_LIST_CAP).map(s => (
              <div
                key={s.student_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="text-sm font-medium truncate">{s.full_name || '—'}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block w-28 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${
                        s.rate >= 70
                          ? 'bg-success'
                          : s.rate >= 50
                          ? 'bg-warning'
                          : 'bg-destructive'
                      }`}
                      style={{ width: `${s.rate}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {s.sessions_attended}/{s.total_sessions} sessions
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      s.rate >= 70
                        ? 'text-success border-success/30'
                        : s.rate >= 50
                        ? 'text-warning border-warning/30'
                        : 'text-destructive border-destructive/30'
                    }`}
                  >
                    {s.rate}%
                  </Badge>
                </div>
              </div>
            ))}
            {studentRows.length > STUDENT_LIST_CAP && (
              <p className="text-center text-xs text-muted-foreground pt-2">
                Showing first {STUDENT_LIST_CAP} of {studentRows.length} students
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
