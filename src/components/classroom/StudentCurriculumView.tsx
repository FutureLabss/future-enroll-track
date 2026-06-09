import { useMemo, useState, useEffect } from 'react';
import { useCurriculumV2 } from '@/hooks/useCurriculumV2';
import { supabase } from '@/lib/supabase';
import { ChevronRight, ChevronDown, BookOpen, Layers, FolderOpen, FileText, Loader2, ExternalLink, Video } from 'lucide-react';

function LessonPanel({ lesson }: { lesson: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 font-medium">{lesson.title}</span>
        {(lesson.content || lesson.objectives || lesson.video_url || lesson.external_link) && (
          open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (lesson.content || lesson.objectives || lesson.video_url || lesson.external_link) && (
        <div className="px-4 pb-3 space-y-2 border-t border-border bg-muted/20 text-sm">
          {lesson.objectives && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Objectives</p>
              <p className="text-sm whitespace-pre-wrap">{lesson.objectives}</p>
            </div>
          )}
          {lesson.content && (
            <div className="pt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Content</p>
              <p className="text-sm whitespace-pre-wrap">{lesson.content}</p>
            </div>
          )}
          {(lesson.video_url || lesson.external_link) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {lesson.video_url && (
                <a
                  href={lesson.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
                >
                  <Video className="h-3.5 w-3.5" /> Watch video
                </a>
              )}
              {lesson.external_link && (
                <a
                  href={lesson.external_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open resource
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnitRow({ unit }: { unit: any }) {
  const [open, setOpen] = useState(false);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!open && !loaded) {
      setLoading(true);
      const { data } = await supabase.rpc('get_unit_lessons', { p_unit_id: unit.id });
      setLessons(data || []);
      setLoaded(true);
      setLoading(false);
    }
    setOpen(v => !v);
  };

  return (
    <div className="ml-4">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/30 rounded-lg transition-colors text-left"
        onClick={toggle}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <FolderOpen className="h-3.5 w-3.5 text-primary/60 shrink-0" />
        <span className="font-medium">{unit.title}</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-1">
          {lessons.length === 0 && loaded && (
            <p className="text-xs text-muted-foreground px-2 py-1">No lessons yet</p>
          )}
          {lessons.map(l => <LessonPanel key={l.id} lesson={l} />)}
        </div>
      )}
    </div>
  );
}

function ModuleRow({ mod }: { mod: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-3">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/30 rounded-lg transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <Layers className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span className="font-medium">{mod.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{mod.units?.length ?? 0} unit{(mod.units?.length ?? 0) !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {(mod.units || []).length === 0 && (
            <p className="text-xs text-muted-foreground px-7 py-1">No units yet</p>
          )}
          {(mod.units || []).map((u: any) => <UnitRow key={u.id} unit={u} />)}
        </div>
      )}
    </div>
  );
}

function TrackRow({ track, onExpand }: { track: any; onExpand: () => void }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open) onExpand();
    setOpen(v => !v);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={toggle}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold">{track.title}</span>
        {track.description && <span className="text-xs text-muted-foreground hidden sm:block ml-2">— {track.description}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{track.modules?.length ?? 0} module{(track.modules?.length ?? 0) !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="border-t border-border px-2 py-2 space-y-1 bg-muted/10">
          {(track.modules || []).length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-2">No modules yet</p>
          )}
          {(track.modules || []).map((m: any) => <ModuleRow key={m.id} mod={m} />)}
        </div>
      )}
    </div>
  );
}

function CurriculumSection({ curriculum }: { curriculum: any }) {

  return (
    <div>
      <div className="mb-3">
        <h3 className="font-semibold text-base">{curriculum.title}</h3>
        {curriculum.description && <p className="text-sm text-muted-foreground mt-0.5">{curriculum.description}</p>}
      </div>
      <div className="space-y-2">
        {curriculum.tracks.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 px-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading content...
          </div>
        )}
        {curriculum.tracks.map((track: any) => (
          <TrackRow key={track.id} track={track} onExpand={() => {}} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  classroomId: string;
  scopeType?: string | null;
  scopeId?: string | null;
}

export function StudentCurriculumView({ classroomId, scopeType, scopeId }: Props) {
  const { curricula, loading, fetchError, refreshCurriculum } = useCurriculumV2(classroomId);
  const [loadedScopeKey, setLoadedScopeKey] = useState('');
  const scopedByTree = scopeType === 'track' || scopeType === 'module';
  const scopeKey = `${scopeType || 'classroom'}:${scopeId || 'all'}:${curricula.map(cur => cur.id).join(',')}`;

  useEffect(() => {
    if (!scopedByTree || !scopeId || loading || loadedScopeKey === scopeKey) return;

    setLoadedScopeKey(scopeKey);
    curricula.forEach(cur => {
      if (cur.tracks.length === 0) refreshCurriculum(cur.id);
    });
  }, [curricula, loadedScopeKey, loading, refreshCurriculum, scopeId, scopeKey, scopedByTree]);

  const visibleCurricula = useMemo(() => {
    if (!scopeType || !scopeId) return curricula;
    if (scopeType === 'curriculum') return curricula.filter(cur => cur.id === scopeId);
    if (scopeType === 'track') {
      return curricula
        .map(cur => ({ ...cur, tracks: cur.tracks.filter((track: any) => track.id === scopeId) }))
        .filter(cur => cur.tracks.length > 0);
    }
    if (scopeType === 'module') {
      return curricula
        .map(cur => ({
          ...cur,
          tracks: cur.tracks
            .map((track: any) => ({ ...track, modules: (track.modules || []).filter((mod: any) => mod.id === scopeId) }))
            .filter((track: any) => track.modules.length > 0),
        }))
        .filter(cur => cur.tracks.length > 0);
    }
    return curricula;
  }, [curricula, scopeId, scopeType]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin h-7 w-7 text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Could not load curriculum. Please try again later.
      </div>
    );
  }

  if (scopedByTree && scopeId && visibleCurricula.length === 0 && curricula.some(cur => cur.tracks.length === 0)) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin h-7 w-7 text-primary" />
      </div>
    );
  }

  if (visibleCurricula.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No curriculum published yet</p>
        <p className="text-sm mt-1">Check back soon — your instructor is setting things up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visibleCurricula.map(cur => (
        <CurriculumSection key={cur.id} curriculum={cur} />
      ))}
    </div>
  );
}
