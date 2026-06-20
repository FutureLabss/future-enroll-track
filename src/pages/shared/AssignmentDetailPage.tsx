import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSubmissions } from '@/hooks/useAssignments';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Calendar, CheckCircle, ClipboardCheck, Loader2, Users } from 'lucide-react';

function SubmissionList({ assignmentId, canGrade, maxScore }: { assignmentId: string; canGrade: boolean; maxScore?: number | null }) {
  const { submissions, loading, gradeSubmission } = useSubmissions(assignmentId);
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string; score: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGrade = async () => {
    if (!grading) return;
    setSaving(true);
    try {
      const scoreNum = grading.score.trim() ? Number(grading.score) : null;
      await gradeSubmission(grading.id, grading.grade, grading.feedback, scoreNum);
      toast.success('Submission graded');
      setGrading(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      {submissions.map((submission: any) => (
        <div key={submission.id} className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{submission.profiles?.full_name || 'Student'}</p>
              <p className="text-xs text-muted-foreground">{submission.profiles?.email || 'No email'}</p>
              {submission.submitted_at && (
                <p className="text-xs text-muted-foreground mt-1">Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
              )}
            </div>
            <Badge variant={submission.status === 'graded' ? 'default' : 'secondary'} className="capitalize">{submission.status}</Badge>
          </div>

          {submission.submission_text && (
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{submission.submission_text}</div>
          )}
          {submission.image_url && (
            <a href={submission.image_url} target="_blank" rel="noreferrer" className="mt-3 inline-block">
              <img src={submission.image_url} alt="Submission" className="max-h-48 rounded-lg border border-border object-cover" />
            </a>
          )}
          {(submission.link_url || submission.file_url) && (
            <a href={submission.link_url || submission.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-primary hover:underline">
              Open submitted link
            </a>
          )}

          {(submission.grade || submission.score != null) && (
            <p className="mt-3 text-sm font-medium">
              {submission.score != null && <span>Score: {submission.score}</span>}
              {submission.score != null && submission.grade && <span className="text-muted-foreground"> · </span>}
              {submission.grade && <span>Grade: {submission.grade}</span>}
              {submission.feedback && <span className="text-muted-foreground"> · {submission.feedback}</span>}
            </p>
          )}

          {canGrade && (grading?.id === submission.id ? (
            <div className="mt-3 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Score{maxScore != null ? ` (out of ${maxScore})` : ''}</Label>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={maxScore ?? undefined}
                      value={grading.score}
                      onChange={e => setGrading({ ...grading, score: e.target.value })}
                      placeholder="e.g. 85"
                    />
                    {maxScore != null && <span className="text-sm text-muted-foreground whitespace-nowrap">/ {maxScore}</span>}
                  </div>
                </div>
                <div>
                  <Label>Grade</Label>
                  <Input value={grading.grade} onChange={e => setGrading({ ...grading, grade: e.target.value })} placeholder="e.g. A, B+" className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>Feedback</Label>
                <Textarea value={grading.feedback} onChange={e => setGrading({ ...grading, feedback: e.target.value })} rows={2} className="mt-1.5" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleGrade} disabled={saving}>{saving ? 'Saving...' : 'Save Grade'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setGrading(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setGrading({ id: submission.id, grade: submission.grade || '', feedback: submission.feedback || '', score: submission.score != null ? String(submission.score) : '' })}>
              Grade
            </Button>
          ))}
        </div>
      ))}
      {submissions.length === 0 && <p className="text-center text-muted-foreground py-10">No submissions yet</p>}
    </div>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isStaff } = useAuth();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['assignment-detail', id, user?.id, isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', id!)
        .single();

      if (error) throw error;

      const [classroomRes, cohortRes, unitRes] = await Promise.all([
        data.classroom_id
          ? supabase.from('classrooms').select('id, name, program_id').eq('id', data.classroom_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        data.cohort_id
          ? supabase.from('cohorts').select('id, cohort_label').eq('id', data.cohort_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        data.unit_id
          ? supabase.from('units').select('id, title').eq('id', data.unit_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      let programName: string | null = null;
      if (classroomRes.data?.program_id) {
        const { data: program } = await supabase
          .from('programs')
          .select('program_name')
          .eq('id', classroomRes.data.program_id)
          .maybeSingle();
        programName = program?.program_name ?? null;
      }

      const assignment = {
        ...data,
        classrooms: classroomRes.data
          ? { id: classroomRes.data.id, name: classroomRes.data.name, programs: programName ? { program_name: programName } : null }
          : null,
        cohorts: cohortRes.data || null,
        units: unitRes.data || null,
      };

      let permissions = null;
      if (user?.id && data?.classroom_id && !isAdmin) {
        const { data: staffRow } = await supabase
          .from('classroom_staff')
          .select('id, staff_type, classroom_permissions(*)')
          .eq('classroom_id', data.classroom_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        permissions = staffRow?.classroom_permissions || null;
      }

      return { assignment, permissions };
    },
    enabled: !!id,
  });

  const assignment = data?.assignment ?? null;
  const permissions = data?.permissions ?? null;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!assignment) return <div className="text-center py-20 text-muted-foreground">Assignment not found or access denied.</div>;

  const canViewSubmissions = isAdmin || isStaff;
  const canGrade = isAdmin || Boolean(permissions?.can_create_assignments);
  const overdue = assignment.due_date && new Date(assignment.due_date) < new Date();
  const classroom = assignment.classrooms;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        title={assignment.title}
        description={`${classroom?.name || 'Classroom'}${classroom?.programs?.program_name ? ` · ${classroom.programs.program_name}` : ''}`}
        actions={<Badge variant={assignment.status === 'published' ? 'default' : 'secondary'} className="capitalize">{assignment.status}</Badge>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-border p-4">
          <BookOpen className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Unit</p>
          <p className="font-medium">{assignment.units?.title || 'No unit'}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <Users className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Cohort</p>
          <p className="font-medium">{assignment.cohorts?.cohort_label || 'All cohorts'}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <Calendar className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Due</p>
          <p className={`font-medium ${overdue ? 'text-destructive' : ''}`}>{assignment.due_date ? new Date(assignment.due_date).toLocaleString() : 'No due date'}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <CheckCircle className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Total Score</p>
          <p className="font-medium">{assignment.max_score != null ? assignment.max_score : '—'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-5 mb-6">
        <h3 className="font-semibold mb-3">Instructions</h3>
        {assignment.instructions ? (
          <p className="text-sm whitespace-pre-wrap leading-6">{assignment.instructions}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No instructions provided.</p>
        )}
      </div>

      {canViewSubmissions && (
        <div className="rounded-lg border border-border p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Submissions</h3>
              <p className="text-sm text-muted-foreground">Review{canGrade ? ' and grade' : ''} student work for this assignment.</p>
            </div>
          </div>
          <SubmissionList assignmentId={assignment.id} canGrade={canGrade} maxScore={assignment.max_score ?? null} />
        </div>
      )}
    </div>
  );
}
