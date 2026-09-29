import { useNavigate } from 'react-router-dom';
import { useStaffClassrooms, useClassrooms } from '@/hooks/useClassroom';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, ArrowRight, Loader2 } from 'lucide-react';

export default function StaffClassroomsPage() {
  const navigate = useNavigate();
  const { isHubManager } = useAuth();

  const staffResult = useStaffClassrooms();
  const managerResult = useClassrooms();

  const loading = isHubManager ? managerResult.loading : staffResult.loading;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  if (isHubManager) {
    const allClassrooms = managerResult.classrooms;
    return (
      <div>
        <PageHeader title="All Classrooms" description="Manage classrooms and assign teachers" />
        {allClassrooms.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No classrooms yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {allClassrooms.map((cls: any) => (
              <div
                key={cls.id}
                onClick={() => navigate(`/admin/classrooms/${cls.id}`)}
                className="glass-card rounded-2xl p-6 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all border border-border group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-lg">{cls.name}</h3>
                    <p className="text-sm text-muted-foreground">{cls.programs?.program_name}</p>
                  </div>
                  <Badge variant="outline">Manager</Badge>
                </div>
                {cls.location && <p className="text-sm text-muted-foreground mb-3">{cls.location}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{(cls.cohorts || []).length} cohorts</span>
                </div>
                <div className="flex justify-end mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const { classrooms } = staffResult;
  return (
    <div>
      <PageHeader title="My Classrooms" description="Classrooms you have been assigned to" />
      {classrooms.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No classrooms assigned yet</p>
          <p className="text-sm">Check your invitations or contact your admin</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/staff/invitations')}>
            View Invitations
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {classrooms.map((cs: any) => {
            const cls = cs.classrooms;
            const perms = cs.classroom_permissions;
            return (
              <div
                key={cs.id}
                onClick={() => navigate(`/staff/classrooms/${cls.id}`)}
                className="glass-card rounded-2xl p-6 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all border border-border group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-lg">{cls.name}</h3>
                    <p className="text-sm text-muted-foreground">{cls.programs?.program_name}</p>
                  </div>
                  <Badge variant={cs.staff_type === 'teaching' ? 'default' : 'secondary'}>
                    {cs.staff_type === 'teaching' ? 'Teaching' : 'Non-Teaching'}
                  </Badge>
                </div>
                {cls.location && <p className="text-sm text-muted-foreground mb-3">{cls.location}</p>}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {perms?.can_create_lessons && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Lessons</span>}
                  {perms?.can_schedule && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Schedule</span>}
                  {perms?.can_start_attendance && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Attendance</span>}
                  {perms?.can_create_assignments && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Assignments</span>}
                  {perms?.can_view_students && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">View Students</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{(cls.cohorts || []).length} cohorts</span>
                </div>
                <div className="flex justify-end mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
