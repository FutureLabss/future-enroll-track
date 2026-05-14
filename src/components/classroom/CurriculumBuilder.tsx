import { useState } from 'react';
import { useCurriculum } from '@/hooks/useCurriculum';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Book, LayoutList, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function CurriculumBuilder({ classroomId, canEdit = false }: { classroomId: string, canEdit?: boolean }) {
  const { curriculum, weeks, loading, createCurriculum, addWeek, addLesson } = useCurriculum(classroomId);
  
  const [initOpen, setInitOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  
  const [title, setTitle] = useState('');
  const [weekForm, setWeekForm] = useState({ number: '', title: '', objectives: '' });
  const [lessonForm, setLessonForm] = useState({ weekId: '', title: '', objectives: '', order: '' });

  const handleInit = async () => {
    if (!title) { toast.error('Title is required'); return; }
    try { await createCurriculum(title, null); setInitOpen(false); } 
    catch (e: any) { toast.error(e.message); }
  };

  const handleAddWeek = async () => {
    try { 
      await addWeek(parseInt(weekForm.number), weekForm.title, weekForm.objectives); 
      setWeekOpen(false); 
      setWeekForm({ number: '', title: '', objectives: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddLesson = async () => {
    try { 
      await addLesson(lessonForm.weekId, lessonForm.title, lessonForm.objectives, parseInt(lessonForm.order)); 
      setLessonOpen(false);
      setLessonForm({ weekId: '', title: '', objectives: '', order: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  if (!curriculum) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
        <Book className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No Curriculum Built</p>
        <p className="text-sm text-muted-foreground mb-4">Start mapping out your lessons and resources</p>
        {canEdit && (
          <Dialog open={initOpen} onOpenChange={setInitOpen}>
            <DialogTrigger asChild><Button>Initialize Curriculum</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Curriculum Title</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Web Dev Complete Syllabus" />
                <Button onClick={handleInit} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{curriculum.title}</h3>
        {canEdit && (
          <Dialog open={weekOpen} onOpenChange={setWeekOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1"/> Add Week/Module</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Week</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Week Number</Label><Input type="number" value={weekForm.number} onChange={e => setWeekForm({...weekForm, number: e.target.value})} className="mt-1.5" /></div>
                <div><Label>Title</Label><Input value={weekForm.title} onChange={e => setWeekForm({...weekForm, title: e.target.value})} className="mt-1.5" placeholder="e.g. Frontend Basics" /></div>
                <div><Label>Objectives</Label><Textarea value={weekForm.objectives} onChange={e => setWeekForm({...weekForm, objectives: e.target.value})} className="mt-1.5" /></div>
                <Button onClick={handleAddWeek} className="w-full">Add Week</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-4">
        {weeks.map(w => (
          <div key={w.id} className="glass-card rounded-2xl p-5 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold">Week {w.week_number}: {w.title}</h4>
                {w.objectives && <p className="text-sm text-muted-foreground mt-1">{w.objectives}</p>}
              </div>
              {canEdit && (
                <Dialog open={lessonOpen} onOpenChange={(o) => { if(o) setLessonForm({...lessonForm, weekId: w.id}); setLessonOpen(o); }}>
                  <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-3 w-3 mr-1" /> Lesson</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Lesson to Week {w.week_number}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Title</Label><Input value={lessonForm.title} onChange={e => setLessonForm({...lessonForm, title: e.target.value})} className="mt-1.5" /></div>
                      <div><Label>Order</Label><Input type="number" value={lessonForm.order} onChange={e => setLessonForm({...lessonForm, order: e.target.value})} className="mt-1.5" /></div>
                      <div><Label>Objectives</Label><Textarea value={lessonForm.objectives} onChange={e => setLessonForm({...lessonForm, objectives: e.target.value})} className="mt-1.5" /></div>
                      <Button onClick={handleAddLesson} className="w-full">Save Lesson</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
              {w.curriculum_lessons?.length === 0 && <p className="text-sm text-muted-foreground py-2">No lessons added yet.</p>}
              {w.curriculum_lessons?.map((l: any) => (
                <div key={l.id} className="flex flex-col py-2">
                  <div className="flex items-center gap-2">
                    <LayoutList className="h-4 w-4 text-primary/60" />
                    <span className="font-medium text-sm">Lesson {l.lesson_order}: {l.title}</span>
                  </div>
                  {l.objectives && <p className="text-xs text-muted-foreground mt-1 ml-6">{l.objectives}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
