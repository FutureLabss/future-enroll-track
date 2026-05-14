import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentClassrooms } from '@/hooks/useClassroom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, MapPin, ArrowRight, Loader2 } from 'lucide-react';

export default function StudentClassroomsPage() {
  const navigate = useNavigate();
  const { classrooms, loading } = useStudentClassrooms();

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Classrooms" description="Access your enrolled classrooms" />
      {classrooms.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No classrooms yet</p>
          <p className="text-sm">Your classroom access will be granted after enrollment payment is confirmed</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {classrooms.map((cs: any) => {
            const cls = cs.classrooms;
            return (
              <div
                key={cs.id}
                onClick={() => navigate(`/student/classrooms/${cls.id}`)}
                className="glass-card rounded-2xl p-6 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all border border-border group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-heading font-semibold text-lg">{cls.name}</h3>
                    <p className="text-sm text-muted-foreground">{cls.programs?.program_name}</p>
                  </div>
                  <Badge variant="default" className="bg-success/15 text-success border-success/30">Enrolled</Badge>
                </div>
                {cls.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-2">
                    <MapPin className="h-3.5 w-3.5" />{cls.location}
                  </p>
                )}
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
