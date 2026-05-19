import { useState, useEffect } from 'react';
import { useCurriculumV2, CurriculumV2, TrackV2, ModuleV2, UnitV2, LessonV2 } from '@/hooks/useCurriculumV2';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, BookOpen, Layers, FolderOpen, FileText, BookMarked, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Inline name editor ───────────────────────────────────────────────────────
function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  return (
    <form
      className="flex gap-1 flex-1"
      onSubmit={e => { e.preventDefault(); if (v.trim()) onSave(v.trim()); }}
    >
      <Input autoFocus value={v} onChange={e => setV(e.target.value)} className="h-7 text-sm py-0 px-2 flex-1" />
      <Button type="submit" size="sm" className="h-7 px-2 text-xs">Save</Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>✕</Button>
    </form>
  );
}

// ── Add-item dialog ──────────────────────────────────────────────────────────
function AddDialog({
  open, title, onClose, onAdd,
  showDescription = false,
  showContent = false,
}: {
  open: boolean; title: string; onClose: () => void;
  onAdd: (title: string, description?: string, content?: string) => Promise<void>;
  showDescription?: boolean; showContent?: boolean;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim(), desc.trim() || undefined, content.trim() || undefined);
      setName(''); setDesc(''); setContent('');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input autoFocus placeholder="Title" value={name} onChange={e => setName(e.target.value)} />
          {showDescription && (
            <Textarea placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          )}
          {showContent && (
            <Textarea placeholder="Lesson notes / content (optional)" value={content} onChange={e => setContent(e.target.value)} rows={4} />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Lesson row ────────────────────────────────────────────────────────────────
function LessonRow({ lesson, onUpdate, onDelete }: { lesson: LessonV2; onUpdate: (p: any) => Promise<void>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete lesson "${lesson.title}"?`)) return;
    setBusy(true);
    try { await onDelete(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-1 pl-2 py-1 rounded hover:bg-muted/30 group/lesson">
      <FileText className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
      {editing ? (
        <InlineEdit value={lesson.title} onSave={async v => { await onUpdate({ title: v }); setEditing(false); }} onCancel={() => setEditing(false)} />
      ) : (
        <span className="text-sm flex-1 truncate">{lesson.title}</span>
      )}
      {!editing && (
        <div className="opacity-0 group-hover/lesson:opacity-100 flex gap-0.5 ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDelete} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive" />}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Unit section ──────────────────────────────────────────────────────────────
function UnitSection({ unit, curriculumId, hook }: { unit: UnitV2; curriculumId: string; hook: ReturnType<typeof useCurriculumV2> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addLesson, setAddLesson] = useState(false);
  const [lessons, setLessons] = useState<LessonV2[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);

  useEffect(() => {
    if (!open || lessonsLoaded) return;
    supabase.rpc('get_unit_lessons', { p_unit_id: unit.id })
      .then(({ data }) => {
        setLessons((data as LessonV2[]) || []);
        setLessonsLoaded(true);
      });
  }, [open, lessonsLoaded, unit.id]);

  const refreshLessons = () => {
    supabase.rpc('get_unit_lessons', { p_unit_id: unit.id })
      .then(({ data }) => setLessons((data as LessonV2[]) || []));
  };

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-3 py-2 bg-muted/20 cursor-pointer hover:bg-muted/40 select-none"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <BookMarked className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
        {editing ? (
          <InlineEdit value={unit.title}
            onSave={async v => { await hook.updateUnit(unit.id, curriculumId, { title: v }); setEditing(false); }}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="text-sm font-medium flex-1">{unit.title}</span>
            <span className="text-xs text-muted-foreground mr-2">{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddLesson(true)} title="Add lesson"><Plus className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                if (!confirm(`Delete unit "${unit.title}" and all its lessons?`)) return;
                try { await hook.deleteUnit(unit.id, curriculumId); } catch (e: any) { toast.error(e.message); }
              }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          </>
        )}
      </div>
      {open && (
        <div className="px-3 py-2 space-y-0.5">
          {lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1 pl-5">No lessons yet.</p>
          ) : (
            lessons.map(l => (
              <LessonRow key={l.id} lesson={l}
                onUpdate={async p => { await hook.updateLesson(l.id, p); refreshLessons(); }}
                onDelete={async () => { await hook.deleteLesson(l.id); refreshLessons(); }} />
            ))
          )}
          <Button variant="ghost" size="sm" className="text-xs h-6 mt-1 text-muted-foreground" onClick={() => setAddLesson(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add lesson
          </Button>
        </div>
      )}
      <AddDialog
        open={addLesson} title={`Add lesson to "${unit.title}"`} onClose={() => setAddLesson(false)}
        showContent
        onAdd={async (title, _desc, content) => { await hook.addLesson(unit.id, title, { content }); refreshLessons(); }}
      />
    </div>
  );
}

// ── Module section ────────────────────────────────────────────────────────────
function ModuleSection({ mod, curriculumId, hook }: { mod: ModuleV2; curriculumId: string; hook: ReturnType<typeof useCurriculumV2> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addUnit, setAddUnit] = useState(false);

  const unitCount = mod.units.length;
  const lessonCount = mod.units.reduce((s, u) => s + u.lessons.length, 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 select-none"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
        {editing ? (
          <InlineEdit value={mod.title}
            onSave={async v => { await hook.updateModule(mod.id, curriculumId, { title: v }); setEditing(false); }}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="text-sm font-semibold flex-1">{mod.title}</span>
            <span className="text-xs text-muted-foreground mr-2">{unitCount} unit{unitCount !== 1 ? 's' : ''} · {lessonCount} lesson{lessonCount !== 1 ? 's' : ''}</span>
            <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddUnit(true)} title="Add unit"><Plus className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                if (!confirm(`Delete module "${mod.title}" and all its units/lessons?`)) return;
                try { await hook.deleteModule(mod.id, curriculumId); } catch (e: any) { toast.error(e.message); }
              }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          </>
        )}
      </div>
      {open && (
        <div className="p-3 space-y-2">
          {mod.units.length === 0 ? (
            <p className="text-xs text-muted-foreground">No units yet.</p>
          ) : (
            mod.units.map(u => <UnitSection key={u.id} unit={u} curriculumId={curriculumId} hook={hook} />)
          )}
          <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => setAddUnit(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add unit
          </Button>
        </div>
      )}
      <AddDialog
        open={addUnit} title={`Add unit to "${mod.title}"`} onClose={() => setAddUnit(false)}
        showDescription
        onAdd={(title, description) => hook.addUnit(mod.id, curriculumId, title, description)}
      />
    </div>
  );
}

// ── Track section ─────────────────────────────────────────────────────────────
function TrackSection({ track, curriculumId, hook }: { track: TrackV2; curriculumId: string; hook: ReturnType<typeof useCurriculumV2> }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addModule, setAddModule] = useState(false);

  const moduleCount = track.modules.length;

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 bg-muted/40 cursor-pointer hover:bg-muted/60 select-none"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
        {editing ? (
          <InlineEdit value={track.title}
            onSave={async v => { await hook.updateTrack(track.id, curriculumId, { title: v }); setEditing(false); }}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="font-semibold flex-1">{track.title}</span>
            <span className="text-xs text-muted-foreground mr-2">{moduleCount} module{moduleCount !== 1 ? 's' : ''}</span>
            <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddModule(true)} title="Add module"><Plus className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
                if (!confirm(`Delete track "${track.title}" and all its modules, units, and lessons?`)) return;
                try { await hook.deleteTrack(track.id, curriculumId); } catch (e: any) { toast.error(e.message); }
              }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          </>
        )}
      </div>
      {open && (
        <div className="p-4 space-y-3">
          {track.modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No modules yet.</p>
          ) : (
            track.modules.map(m => <ModuleSection key={m.id} mod={m} curriculumId={curriculumId} hook={hook} />)
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => setAddModule(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add module
          </Button>
        </div>
      )}
      <AddDialog
        open={addModule} title={`Add module to "${track.title}"`} onClose={() => setAddModule(false)}
        showDescription
        onAdd={(title, description) => hook.addModule(track.id, curriculumId, title, description)}
      />
    </div>
  );
}

// ── Curriculum panel ──────────────────────────────────────────────────────────
function CurriculumPanel({ curriculum, hook, onDeleted }: { curriculum: CurriculumV2; hook: ReturnType<typeof useCurriculumV2>; onDeleted: () => void }) {
  const [addTrack, setAddTrack] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
        {editing ? (
          <InlineEdit value={curriculum.title}
            onSave={async v => { await hook.updateCurriculum(curriculum.id, { title: v }); setEditing(false); }}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            <h3 className="font-semibold text-lg flex-1">{curriculum.title}</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
              if (!confirm(`Delete curriculum "${curriculum.title}" and all its content?`)) return;
              try {
                await hook.deleteCurriculum(curriculum.id);
                onDeleted();
              } catch (e: any) { toast.error(e.message); }
            }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </>
        )}
      </div>

      {curriculum.tracks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tracks yet. Add a track to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {curriculum.tracks.map(t => <TrackSection key={t.id} track={t} curriculumId={curriculum.id} hook={hook} />)}
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => setAddTrack(true)}>
        <Plus className="h-4 w-4 mr-2" /> Add track
      </Button>

      <AddDialog
        open={addTrack} title="Add track" onClose={() => setAddTrack(false)}
        showDescription
        onAdd={(title, description) => hook.addTrack(curriculum.id, title, description)}
      />
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export function CurriculumTreeV2({ classroomId }: { classroomId: string }) {
  const hook = useCurriculumV2(classroomId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addCurriculum, setAddCurriculum] = useState(false);

  const selected = hook.curricula.find(c => c.id === selectedId) ?? hook.curricula[0] ?? null;

  // Load tree when selection changes
  useEffect(() => {
    if (selected && selected.tracks.length === 0) {
      hook.refreshCurriculum(selected.id);
    }
  }, [selected?.id]);

  if (hook.loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hook.fetchError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        <p className="font-semibold mb-1">Failed to load curriculum</p>
        <p className="font-mono text-xs opacity-80">{hook.fetchError}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-[400px]">
      {/* Sidebar: curriculum list */}
      <div className="w-56 flex-shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Curricula</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddCurriculum(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {hook.curricula.length === 0 ? (
          <p className="text-sm text-muted-foreground">No curricula yet.</p>
        ) : (
          hook.curricula.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                (selected?.id === c.id) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60'
              }`}
            >
              {c.title}
            </button>
          ))
        )}
        <Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={() => setAddCurriculum(true)}>
          <Plus className="h-3 w-3 mr-1" /> New curriculum
        </Button>

        <AddDialog
          open={addCurriculum} title="Create curriculum" onClose={() => setAddCurriculum(false)}
          showDescription
          onAdd={async (title, description) => {
            const newId = await hook.createCurriculum(title, description);
            setSelectedId(newId);
            toast.success('Curriculum created');
          }}
        />
      </div>

      {/* Main: selected curriculum tree */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <CurriculumPanel key={selected.id} curriculum={selected} hook={hook} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>Create a curriculum to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
