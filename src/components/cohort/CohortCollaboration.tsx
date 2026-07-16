import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CalendarDays, Clock, MapPin, LinkIcon, Megaphone, Pin, PinOff,
  Plus, Send, Trash2, Loader2, MessageCircle, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t: string) => t?.slice(0, 5);
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-NG');
};

// --------------------------------------------------------------------------
// SCHEDULE TAB
// --------------------------------------------------------------------------
export function CohortScheduleTab({ cohortId }: { cohortId: string }) {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const qk = ['cohort-schedules', cohortId];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cohort_schedules')
        .select('*')
        .eq('cohort_id', cohortId)
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`cohort_schedules:${cohortId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cohort_schedules', filter: `cohort_id=eq.${cohortId}` },
        () => qc.invalidateQueries({ queryKey: qk }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  const remove = async (id: string) => {
    const { error } = await supabase.from('cohort_schedules').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Removed');
  };

  const now = Date.now();
  const upcoming = rows.filter((r: any) => new Date(`${r.scheduled_date}T${r.end_time}`).getTime() >= now);
  const past = rows.filter((r: any) => new Date(`${r.scheduled_date}T${r.end_time}`).getTime() < now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-lg">Schedule</h3>
          <p className="text-sm text-muted-foreground">Class sessions and meetings for this cohort</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Session</Button></DialogTrigger>
            <ScheduleForm
              cohortId={cohortId}
              userId={user?.id}
              editing={editing}
              onSaved={() => { setOpen(false); setEditing(null); }}
            />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No sessions scheduled yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map((s: any) => (
                  <ScheduleCard
                    key={s.id} row={s} isAdmin={isAdmin}
                    onEdit={() => { setEditing(s); setOpen(true); }}
                    onDelete={() => remove(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Past</p>
              <div className="space-y-2 opacity-70">
                {past.map((s: any) => (
                  <ScheduleCard
                    key={s.id} row={s} isAdmin={isAdmin}
                    onEdit={() => { setEditing(s); setOpen(true); }}
                    onDelete={() => remove(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({ row, isAdmin, onEdit, onDelete }: any) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-start gap-4">
      <div className="rounded-lg bg-primary/10 text-primary p-2.5 shrink-0">
        <CalendarDays className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{row.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(row.scheduled_date)}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete session?</AlertDialogTitle>
                    <AlertDialogDescription>"{row.title}" will be removed. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground mt-2">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(row.start_time)} – {fmtTime(row.end_time)}</span>
          {row.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{row.location}</span>}
          {row.meeting_link && (
            <a href={row.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <LinkIcon className="h-3.5 w-3.5" />Join
            </a>
          )}
        </div>
        {row.description && <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{row.description}</p>}
      </div>
    </div>
  );
}

function ScheduleForm({ cohortId, userId, editing, onSaved }: { cohortId: string; userId?: string; editing: any | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: editing?.title || '',
    description: editing?.description || '',
    scheduled_date: editing?.scheduled_date || '',
    start_time: editing?.start_time?.slice(0, 5) || '',
    end_time: editing?.end_time?.slice(0, 5) || '',
    location: editing?.location || '',
    meeting_link: editing?.meeting_link || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.scheduled_date || !form.start_time || !form.end_time) {
      toast.error('Title, date, start and end are required'); return;
    }
    setSaving(true);
    const payload = {
      cohort_id: cohortId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      scheduled_date: form.scheduled_date,
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location.trim() || null,
      meeting_link: form.meeting_link.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('cohort_schedules').update(payload).eq('id', editing.id)
      : await supabase.from('cohort_schedules').insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? 'Session updated' : 'Session scheduled');
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? 'Edit Session' : 'New Session'}</DialogTitle></DialogHeader>
      <div className="space-y-3 mt-2">
        <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1.5" placeholder="e.g. Week 3 Live Class" /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1.5" placeholder="Optional notes for students" /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Date *</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Start *</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="mt-1.5" /></div>
          <div><Label>End *</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="mt-1.5" /></div>
        </div>
        <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="mt-1.5" placeholder="Room 3B or 'Online'" /></div>
        <div><Label>Meeting link</Label><Input value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} className="mt-1.5" placeholder="https://" /></div>
      </div>
      <DialogFooter className="mt-4">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create session'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// --------------------------------------------------------------------------
// ANNOUNCEMENTS TAB
// --------------------------------------------------------------------------
export function CohortAnnouncementsTab({ cohortId }: { cohortId: string }) {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const qk = ['cohort-announcements', cohortId];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cohort_announcements')
        .select('*')
        .eq('cohort_id', cohortId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const authorIds = [...new Set((data || []).map((r: any) => r.author_id).filter(Boolean))];
      const authorMap = new Map<string, any>();
      if (authorIds.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', authorIds);
        (profs || []).forEach((p: any) => authorMap.set(p.user_id, p));
      }
      return (data || []).map((r: any) => ({ ...r, author: r.author_id ? authorMap.get(r.author_id) : null }));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`cohort_announcements:${cohortId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cohort_announcements', filter: `cohort_id=eq.${cohortId}` },
        () => qc.invalidateQueries({ queryKey: qk }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  const togglePin = async (row: any) => {
    const { error } = await supabase.from('cohort_announcements').update({ pinned: !row.pinned }).eq('id', row.id);
    if (error) toast.error(error.message);
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('cohort_announcements').delete().eq('id', id);
    if (error) toast.error(error.message); else toast.success('Deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-lg">Announcement Board</h3>
          <p className="text-sm text-muted-foreground">Broadcast updates to everyone in the cohort</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Announcement</Button></DialogTrigger>
            <AnnouncementForm cohortId={cohortId} userId={user?.id} editing={editing} onSaved={() => { setOpen(false); setEditing(null); }} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row: any) => (
            <div key={row.id} className={`glass-card rounded-xl p-5 ${row.pinned ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.pinned && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1"><Pin className="h-3 w-3" />Pinned</Badge>}
                    <h4 className="font-semibold text-base">{row.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {row.author?.full_name || 'Unknown'} · {fmtWhen(row.created_at)}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => togglePin(row)}>
                      {row.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(row.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              <p className="text-sm text-foreground/90 mt-3 whitespace-pre-wrap leading-relaxed">{row.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementForm({ cohortId, userId, editing, onSaved }: { cohortId: string; userId?: string; editing: any | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: editing?.title || '',
    body: editing?.body || '',
    pinned: editing?.pinned || false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Title and message are required'); return; }
    setSaving(true);
    const payload = { cohort_id: cohortId, title: form.title.trim(), body: form.body.trim(), pinned: form.pinned };
    const { error } = editing
      ? await supabase.from('cohort_announcements').update(payload).eq('id', editing.id)
      : await supabase.from('cohort_announcements').insert({ ...payload, author_id: userId });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? 'Announcement updated' : 'Announcement posted');
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle></DialogHeader>
      <div className="space-y-3 mt-2">
        <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1.5" placeholder="e.g. Class moved to Thursday" /></div>
        <div><Label>Message *</Label><Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={6} className="mt-1.5" placeholder="What do you want the cohort to know?" /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="rounded border-border" />
          Pin to top
        </label>
      </div>
      <DialogFooter className="mt-4">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Post announcement'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// --------------------------------------------------------------------------
// CHAT TAB
// --------------------------------------------------------------------------
export function CohortChatTab({ cohortId }: { cohortId: string }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const qk = ['cohort-messages', cohortId];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cohort_messages')
        .select('*')
        .eq('cohort_id', cohortId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      const uids = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
      const profMap = new Map<string, any>();
      if (uids.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', uids);
        (profs || []).forEach((p: any) => profMap.set(p.user_id, p));
      }
      return (data || []).map((r: any) => ({ ...r, author: profMap.get(r.user_id) || null }));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`cohort_messages:${cohortId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cohort_messages', filter: `cohort_id=eq.${cohortId}` },
        () => qc.invalidateQueries({ queryKey: qk }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [rows.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !user) return;
    setSending(true);
    const { error } = await supabase.from('cohort_messages').insert({ cohort_id: cohortId, user_id: user.id, body });
    setSending(false);
    if (error) return toast.error(error.message);
    setDraft('');
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('cohort_messages').delete().eq('id', id);
    if (error) toast.error(error.message);
  };

  // Group consecutive messages by same author within 5 min
  const grouped = useMemo(() => {
    const out: any[] = [];
    let currentGroup: any = null;
    for (const m of rows) {
      const t = new Date(m.created_at).getTime();
      if (currentGroup && currentGroup.user_id === m.user_id && t - currentGroup.lastAt < 5 * 60_000) {
        currentGroup.messages.push(m);
        currentGroup.lastAt = t;
      } else {
        currentGroup = { user_id: m.user_id, author: m.author, firstAt: m.created_at, lastAt: t, messages: [m] };
        out.push(currentGroup);
      }
    }
    return out;
  }, [rows]);

  return (
    <div className="flex flex-col h-[70vh]">
      <div>
        <h3 className="font-heading font-semibold text-lg">Cohort Chat</h3>
        <p className="text-sm text-muted-foreground mb-4">Everyone in the cohort can post</p>
      </div>

      <div className="glass-card rounded-xl flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <MessageCircle className="h-10 w-10 mb-3 opacity-40" />
              <p>No messages yet — start the conversation</p>
            </div>
          ) : (
            grouped.map((g, gi) => {
              const isMine = g.user_id === user?.id;
              const initials = (g.author?.full_name || g.author?.email || '?').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={gi} className={`flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                  <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    {initials}
                  </div>
                  <div className={`flex-1 min-w-0 flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1 text-xs">
                      <span className="font-semibold text-foreground">{isMine ? 'You' : g.author?.full_name || 'Unknown'}</span>
                      <span className="text-muted-foreground">{fmtWhen(g.firstAt)}</span>
                    </div>
                    <div className="space-y-1 max-w-[85%]">
                      {g.messages.map((m: any) => (
                        <div key={m.id} className="group relative">
                          <div className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${isMine ? 'bg-primary text-primary-foreground rounded-tr-md' : 'bg-muted text-foreground rounded-tl-md'}`}>
                            {m.body}
                          </div>
                          {(isMine || isAdmin) && (
                            <button
                              onClick={() => remove(m.id)}
                              className={`absolute top-1/2 -translate-y-1/2 ${isMine ? '-left-8' : '-right-8'} opacity-0 group-hover:opacity-100 transition p-1.5 rounded-full hover:bg-destructive/10 text-destructive`}
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            rows={1}
            className="resize-none min-h-[42px] max-h-[140px]"
          />
          <Button onClick={send} disabled={sending || !draft.trim()} size="icon" className="h-[42px] w-[42px] shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
