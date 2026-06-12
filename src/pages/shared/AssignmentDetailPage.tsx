import { useEffect, useState } from 'react';
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

function SubmissionList({ assignmentId }: { assignmentId: string }) {
  const { submissions, loading, gradeSubmission } = useSubmissions(assignmentId);
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGrade = async () => {
    if (!grading) return;
    setSaving(true);
    try {
      await gradeSubmission(grading.id, grading.grade, grading.feedback);
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

          {submission.grade && (
            <p className="mt-3 text-sm font-medium">
              Grade: {submission.grade}{submission.feedback && <span className="text-muted-foreground"> · {submission.feedback}</span>}
            </p>
          )}

          {grading?.id === submission.id ? (
            <div className="mt-3 grid gap-2">
              <div>
                <Label>Grade</Label>
                <Input value={grading.grade} onChange={e => setGrading({ ...grading, grade: e.target.value })} placeholder="e.g. A, 85/100" className="mt-1.5" />
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
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setGrading({ id: submission.id, grade: submission.grade || '', feedback: submission.feedback || '' })}>
              Grade
            </Button>
          )}
        </div>
      ))}
      {submissions.length === 0 && <p className="text-center text-muted-foreground py-10">No submissions yet</p>}
    </div>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [assignment, setAssignment] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', id)
        .single();

      if (!active) return;
      if (error) {
        toast.error(`Could not load assignment: ${error.message}`);
        setAssignment(null);
        setLoading(false);
        return;
      }

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

      if (!active) return;

      let programName: string | null = null;
      if (classroomRes.data?.program_id) {
        const { data: program } = await supabase
          .from('programs')
          .select('program_name')
          .eq('id', classroomRes.data.program_id)
          .maybeSingle();
        if (active) programName = program?.program_name ?? null;
      }

      if (!active) return;

      setAssignment({
        ...data,
        classrooms: classroomRes.data
          ? { id: classroomRes.data.id, name: classroomRes.data.name, programs: programName ? { program_name: programName } : null }
          : null,
        cohorts: cohortRes.data || null,
        units: unitRes.data || null,
      });

      if (user?.id && data?.classroom_id && !isAdmin) {
        const { data: staffRow } = await supabase
          .from('classroom_staff')
          .select('id, staff_type, classroom_permissions(*)')
          .eq('classroom_id', data.classroom_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (active) setPermissions(staffRow?.classroom_permissions || null);
      }

      if (active) setLoading(false);
    };

    load();
    return () => { active = false; };
  }, [id, isAdmin, user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!assignment) return <div className="text-center py-20 text-muted-foreground">Assignment not found or access denied.</div>;

  const canManage = isAdmin || Boolean(permissions?.can_create_assignments);
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
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="font-medium">{new Date(assignment.created_at).toLocaleDateString()}</p>
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

      {canManage && (
        <div className="rounded-lg border border-border p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Submissions</h3>
              <p className="text-sm text-muted-foreground">Review and grade student work for this assignment.</p>
            </div>
          </div>
          <SubmissionList assignmentId={assignment.id} />
        </div>
      )}
    </div>
  );
}
