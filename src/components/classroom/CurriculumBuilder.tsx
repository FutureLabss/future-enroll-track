import { useState, useRef } from 'react';
import { useCurriculum } from '@/hooks/useCurriculum';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import {
  Plus, Book, LayoutList, Loader2, Pencil, Trash2,
  FileText, Video, Link2, File, ExternalLink, Upload, X, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

const MATERIAL_ICONS: Record<string, any> = {
  pdf: FileText,
  video: Video,
  link: Link2,
  file: File,
  image: File,
};

const MATERIAL_COLOURS: Record<string, string> = {
  pdf: 'text-red-500',
  video: 'text-red-600',
  link: 'text-blue-500',
  file: 'text-indigo-500',
  image: 'text-green-500',
};

function MaterialItem({ material, canEdit, onDelete }: { material: any; canEdit: boolean; onDelete: () => void }) {
  const Icon = MATERIAL_ICONS[material.material_type] || Link2;
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 group/mat">
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${MATERIAL_COLOURS[material.material_type] || ''}`} />
      {material.file_url ? (
        <a
          href={material.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline flex items-center gap-1 flex-1 min-w-0"
        >
          <span className="truncate">{material.title}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50" />
        </a>
      ) : (
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{material.title}</span>
      )}
      {canEdit && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover/mat:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CurriculumBuilder({
  cohortId,
  canEdit = false,
  cohorts = [],
}: {
  cohortId: string;
  canEdit?: boolean;
  cohorts?: { id: string; cohort_label: string }[];
}) {
  const {
    curriculum, weeks, loading,
    createCurriculum, updateCurriculum, deleteCurriculum,
    addWeek, updateWeek, deleteWeek,
    addLesson, updateLesson, deleteLesson,
    addMaterial, deleteMaterial,
  } = useCurriculum(cohortId);

  const [initOpen, setInitOpen] = useState(false);
  const [editCurriculumOpen, setEditCurriculumOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [editWeekModal, setEditWeekModal] = useState<{ open: boolean; week?: any }>({ open: false });
  const [lessonModal, setLessonModal] = useState<{ open: boolean; weekId?: string }>({ open: false });
  const [editLessonModal, setEditLessonModal] = useState<{ open: boolean; lesson?: any }>({ open: false });
  const [materialModal, setMaterialModal] = useState<{ open: boolean; lessonId?: string }>({ open: false });

  const [initTitle, setInitTitle] = useState('');
  const [editCurriculumForm, setEditCurriculumForm] = useState({ title: '', description: '' });
  const [weekForm, setWeekForm] = useState({ number: '', title: '', objectives: '' });
  const [editWeekForm, setEditWeekForm] = useState({ number: '', title: '', objectives: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', objectives: '', order: '' });
  const [editForm, setEditForm] = useState({ title: '', objectives: '', order: '' });
  const [matForm, setMatForm] = useState({ type: 'pdf', title: '', url: '' });
  const [matFile, setMatFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  // Clone to cohort state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTargetId, setCloneTargetId] = useState('');
  const [cloning, setCloning] = useState(false);

  const run = async (fn: () => Promise<void>, close: () => void) => {
    setSaving(true);
    try { await fn(); close(); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleInit = () => run(async () => {
    if (!initTitle.trim()) throw new Error('Title is required');
    await createCurriculum(initTitle);
    setInitTitle('');
  }, () => setInitOpen(false));

  const handleEditCurriculum = () => run(async () => {
    if (!editCurriculumForm.title.trim()) throw new Error('Title is required');
    await updateCurriculum({ title: editCurriculumForm.title, description: editCurriculumForm.description || undefined });
  }, () => setEditCurriculumOpen(false));

  const handleDeleteCurriculum = async () => {
    if (!confirm('Delete the entire curriculum including all weeks, lessons, and materials?')) return;
    try { await deleteCurriculum(); toast.success('Curriculum deleted'); } catch (e: any) { toast.error(e.message); }
  };

  const handleAddWeek = () => run(async () => {
    if (!weekForm.number || !weekForm.title) throw new Error('Week number and title are required');
    await addWeek(parseInt(weekForm.number), weekForm.title, weekForm.objectives);
    setWeekForm({ number: '', title: '', objectives: '' });
  }, () => setWeekOpen(false));

  const handleEditWeek = () => run(async () => {
    if (!editWeekForm.title) throw new Error('Week title is required');
    await updateWeek(editWeekModal.week.id, {
      week_number: parseInt(editWeekForm.number) || editWeekModal.week.week_number,
      title: editWeekForm.title,
      objectives: editWeekForm.objectives || null,
    });
  }, () => setEditWeekModal({ open: false }));

  const handleDeleteWeek = async (weekId: string) => {
    if (!confirm('Delete this week and all its lessons?')) return;
    try { await deleteWeek(weekId); toast.success('Week deleted'); } catch (e: any) { toast.error(e.message); }
  };

  const openEditWeek = (week: any) => {
    setEditWeekForm({ number: String(week.week_number), title: week.title, objectives: week.objectives || '' });
    setEditWeekModal({ open: true, week });
  };

  const handleAddLesson = () => run(async () => {
    if (!lessonForm.title) throw new Error('Lesson title is required');
    await addLesson(lessonModal.weekId!, lessonForm.title, lessonForm.objectives, parseInt(lessonForm.order) || 0);
    setLessonForm({ title: '', objectives: '', order: '' });
  }, () => setLessonModal({ open: false }));

  const handleEditLesson = () => run(async () => {
    if (!editForm.title) throw new Error('Lesson title is required');
    await updateLesson(editLessonModal.lesson.id, {
      title: editForm.title,
      objectives: editForm.objectives || null,
      lesson_order: parseInt(editForm.order) || 0,
    });
  }, () => setEditLessonModal({ open: false }));

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Delete this lesson and all its materials?')) return;
    try { await deleteLesson(lessonId); toast.success('Lesson deleted'); } catch (e: any) { toast.error(e.message); }
  };

  const handleAddMaterial = () => run(async () => {
    if (!matForm.title.trim()) throw new Error('Material title is required');
    const needsFile = matForm.type === 'pdf' || matForm.type === 'file';
    if (needsFile && !matFile && !matForm.url) throw new Error('Upload a file or enter a URL');
    if (!needsFile && !matForm.url.trim()) throw new Error('URL is required');
    await addMaterial(materialModal.lessonId!, {
      type: matForm.type,
      title: matForm.title,
      url: needsFile ? matForm.url : matForm.url,
      file: needsFile ? (matFile ?? undefined) : undefined,
    });
    setMatForm({ type: 'pdf', title: '', url: '' });
    setMatFile(null);
  }, () => setMaterialModal({ open: false }));

  const openEditLesson = (lesson: any) => {
    setEditForm({ title: lesson.title, objectives: lesson.objectives || '', order: String(lesson.lesson_order) });
    setEditLessonModal({ open: true, lesson });
  };

  const openAddMaterial = (lessonId: string) => {
    setMatForm({ type: 'pdf', title: '', url: '' });
    setMatFile(null);
    setMaterialModal({ open: true, lessonId });
  };

  const handleClone = async () => {
    if (!cloneTargetId) { toast.error('Select a target cohort'); return; }
    if (cloneTargetId === cohortId) { toast.error('Cannot clone to the same cohort'); return; }
    setCloning(true);
    try {
      const { error } = await supabase.rpc('clone_curriculum_to_cohort', {
        p_source_curriculum_id: curriculum!.id,
        p_target_cohort_id: cloneTargetId,
      });
      if (error) throw error;
      const target = cohorts.find(c => c.id === cloneTargetId);
      toast.success(`Curriculum cloned to "${target?.cohort_label}"`);
      setCloneOpen(false);
      setCloneTargetId('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCloning(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="animate-spin h-6 w-6 text-primary" />
    </div>
  );

  if (!curriculum) return (
    <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
      <Book className="h-10 w-10 mx-auto mb-3 opacity-40" />
      <p className="font-medium">No curriculum for this cohort yet</p>
      <p className="text-sm text-muted-foreground mb-4">Build a structured syllabus with weeks and lessons</p>
      {canEdit && (
        <Button onClick={() => setInitOpen(true)}>Initialize Curriculum</Button>
      )}

      <Dialog open={initOpen} onOpenChange={setInitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Curriculum Title</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input value={initTitle} onChange={e => setInitTitle(e.target.value)} placeholder="e.g. Web Dev Complete Syllabus" />
            <Button onClick={handleInit} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-lg truncate">{curriculum.title}</h3>
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0" title="Edit curriculum"
                onClick={() => { setEditCurriculumForm({ title: curriculum.title, description: curriculum.description || '' }); setEditCurriculumOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0 text-destructive hover:text-destructive" title="Delete curriculum"
                onClick={handleDeleteCurriculum}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cohorts.filter(c => c.id !== cohortId).length > 0 && (
            <Button size="sm" variant="outline" onClick={() => { setCloneTargetId(''); setCloneOpen(true); }}>
              <Copy className="h-4 w-4 mr-1" />Copy to Cohort
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setWeekOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Week
            </Button>
          )}
        </div>
      </div>

      {weeks.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl text-muted-foreground">
          <LayoutList className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No weeks yet. Add the first week to start building.</p>
        </div>
      )}

      {weeks.map(w => (
        <div key={w.id} className="glass-card rounded-2xl p-5 border border-border">
          <div className="flex items-start justify-between mb-4 gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold">Week {w.week_number}: {w.title}</h4>
              {w.objectives && <p className="text-sm text-muted-foreground mt-0.5">{w.objectives}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canEdit && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit week" onClick={() => openEditWeek(w)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete week" onClick={() => handleDeleteWeek(w.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setLessonForm({ title: '', objectives: '', order: '' }); setLessonModal({ open: true, weekId: w.id }); }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Lesson
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 pl-4 border-l-2 border-primary/20">
            {(w.curriculum_lessons || []).length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No lessons added yet.</p>
            )}
            {(w.curriculum_lessons || []).map((l: any) => (
              <div key={l.id} className="rounded-xl border border-border bg-background/50 px-4 py-3">
                {/* Lesson header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <LayoutList className="h-4 w-4 text-primary/60 flex-shrink-0" />
                      <span className="font-medium text-sm">
                        {l.lesson_order > 0 ? `${l.lesson_order}. ` : ''}{l.title}
                      </span>
                    </div>
                    {l.objectives && (
                      <p className="text-xs text-muted-foreground mt-1 ml-6">{l.objectives}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditLesson(l)} title="Edit lesson">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteLesson(l.id)} title="Delete lesson">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Materials */}
                {((l.lesson_materials || []).length > 0 || canEdit) && (
                  <div className="mt-2 ml-6">
                    {(l.lesson_materials || []).map((m: any) => (
                      <MaterialItem
                        key={m.id}
                        material={m}
                        canEdit={canEdit}
                        onDelete={async () => {
                          try { await deleteMaterial(m.id); } catch (e: any) { toast.error(e.message); }
                        }}
                      />
                    ))}
                    {canEdit && (
                      <button
                        onClick={() => openAddMaterial(l.id)}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mt-1 px-2 py-1"
                      >
                        <Plus className="h-3 w-3" /> Add material
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Edit Curriculum modal */}
      <Dialog open={editCurriculumOpen} onOpenChange={setEditCurriculumOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Curriculum</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Title *</Label><Input value={editCurriculumForm.title} onChange={e => setEditCurriculumForm({ ...editCurriculumForm, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Description</Label><Textarea value={editCurriculumForm.description} onChange={e => setEditCurriculumForm({ ...editCurriculumForm, description: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button onClick={handleEditCurriculum} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Week modal */}
      <Dialog open={weekOpen} onOpenChange={setWeekOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Week / Module</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Week Number *</Label><Input type="number" value={weekForm.number} onChange={e => setWeekForm({ ...weekForm, number: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Title *</Label><Input value={weekForm.title} onChange={e => setWeekForm({ ...weekForm, title: e.target.value })} className="mt-1.5" placeholder="e.g. Frontend Basics" /></div>
            <div><Label>Objectives</Label><Textarea value={weekForm.objectives} onChange={e => setWeekForm({ ...weekForm, objectives: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button onClick={handleAddWeek} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Add Week
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Week modal */}
      <Dialog open={editWeekModal.open} onOpenChange={o => setEditWeekModal({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Week</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Week Number *</Label><Input type="number" value={editWeekForm.number} onChange={e => setEditWeekForm({ ...editWeekForm, number: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Title *</Label><Input value={editWeekForm.title} onChange={e => setEditWeekForm({ ...editWeekForm, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Objectives</Label><Textarea value={editWeekForm.objectives} onChange={e => setEditWeekForm({ ...editWeekForm, objectives: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button onClick={handleEditWeek} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Lesson modal */}
      <Dialog open={lessonModal.open} onOpenChange={o => setLessonModal({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Lesson</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Title *</Label><Input value={lessonForm.title} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Order</Label><Input type="number" value={lessonForm.order} onChange={e => setLessonForm({ ...lessonForm, order: e.target.value })} className="mt-1.5" placeholder="0" /></div>
            <div><Label>Objectives</Label><Textarea value={lessonForm.objectives} onChange={e => setLessonForm({ ...lessonForm, objectives: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button onClick={handleAddLesson} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Save Lesson
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Lesson modal */}
      <Dialog open={editLessonModal.open} onOpenChange={o => setEditLessonModal({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Lesson</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Title *</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Order</Label><Input type="number" value={editForm.order} onChange={e => setEditForm({ ...editForm, order: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Objectives</Label><Textarea value={editForm.objectives} onChange={e => setEditForm({ ...editForm, objectives: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button onClick={handleEditLesson} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}Update Lesson
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Material modal */}
      <Dialog open={materialModal.open} onOpenChange={o => setMaterialModal({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Material</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Type</Label>
              <Select value={matForm.type} onValueChange={v => { setMatForm({ ...matForm, type: v, url: '' }); setMatFile(null); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="file">Slides / Presentation</SelectItem>
                  <SelectItem value="video">YouTube Video</SelectItem>
                  <SelectItem value="link">External Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={matForm.title} onChange={e => setMatForm({ ...matForm, title: e.target.value })} className="mt-1.5" placeholder="e.g. Week 1 Slides" />
            </div>

            {(matForm.type === 'pdf' || matForm.type === 'file') && (
              <div>
                <Label>Upload File</Label>
                <div
                  className="mt-1.5 border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {matFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <File className="h-4 w-4 text-primary" />
                      <span className="truncate max-w-[200px]">{matFile.name}</span>
                      <button onClick={e => { e.stopPropagation(); setMatFile(null); }} className="text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
                      Click to upload or drag file here
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept={matForm.type === 'pdf' ? '.pdf' : '.ppt,.pptx,.key,.pdf'}
                  onChange={e => setMatFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground mt-1">Or enter a URL instead:</p>
                <Input value={matForm.url} onChange={e => setMatForm({ ...matForm, url: e.target.value })} className="mt-1" placeholder="https://..." />
              </div>
            )}

            {(matForm.type === 'video' || matForm.type === 'link') && (
              <div>
                <Label>{matForm.type === 'video' ? 'YouTube URL' : 'URL'} *</Label>
                <Input
                  value={matForm.url}
                  onChange={e => setMatForm({ ...matForm, url: e.target.value })}
                  className="mt-1.5"
                  placeholder={matForm.type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                />
              </div>
            )}

            <Button onClick={handleAddMaterial} disabled={saving} className="w-full">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              {saving ? 'Uploading...' : 'Add Material'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clone curriculum to cohort modal */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Copy className="h-4 w-4" />Copy Curriculum to Cohort</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This will copy all weeks, lessons, and material links from <strong>{curriculum?.title}</strong> to another cohort. Existing curriculum in the target cohort will be replaced.
            </p>
            <div>
              <Label>Target Cohort *</Label>
              <Select value={cloneTargetId} onValueChange={setCloneTargetId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a cohort…" /></SelectTrigger>
                <SelectContent>
                  {cohorts.filter(c => c.id !== cohortId).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleClone} disabled={cloning || !cloneTargetId} className="w-full">
              {cloning ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {cloning ? 'Copying…' : 'Copy Curriculum'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
