import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, BookOpen, Calendar, Users, Layers,
  CheckCircle, Clock, Radio, Play, FileText, Video, Link2,
  ChevronDown, ChevronRight, GraduationCap, BarChart2,
  ExternalLink, Sparkles, Building2, ArrowRight,
} from 'lucide-react';

// ──────────────────────────────────────────────
// Demo seed data
// ──────────────────────────────────────────────
const DEMO_STATS = [
  { label: 'Active Students', value: '147', icon: Users, colour: 'text-primary' },
  { label: 'Programs', value: '6', icon: GraduationCap, colour: 'text-success' },
  { label: 'Classrooms', value: '12', icon: Building2, colour: 'text-warning' },
  { label: 'Lessons This Month', value: '38', icon: Calendar, colour: 'text-blue-500' },
];

const DEMO_COHORTS = [
  { id: '1', label: 'Cohort Alpha — Jan 2026', status: 'active', students: 24, program: 'Full-Stack Web Dev' },
  { id: '2', label: 'Cohort Beta — Mar 2026', status: 'upcoming', students: 18, program: 'Full-Stack Web Dev' },
  { id: '3', label: 'Cohort 5 — Apr 2026', status: 'active', students: 31, program: 'Data Science' },
  { id: '4', label: 'Cohort 2 — Dec 2025', status: 'completed', students: 22, program: 'UI/UX Design' },
];

const DEMO_CURRICULUM = {
  title: 'Full-Stack Web Development — Complete Syllabus',
  weeks: [
    {
      id: 'w1', week_number: 1, title: 'Web Foundations',
      objectives: 'Understand how the web works; build and style your first HTML page.',
      lessons: [
        {
          id: 'l1', title: 'How the Internet Works', lesson_order: 1,
          objectives: 'DNS, HTTP, TCP/IP overview.',
          materials: [
            { id: 'm1', title: 'Lecture Slides', material_type: 'pdf', file_url: '#' },
            { id: 'm2', title: 'Intro Video', material_type: 'video', file_url: '#' },
          ],
        },
        {
          id: 'l2', title: 'HTML5 Essentials', lesson_order: 2,
          objectives: 'Semantic tags, forms, accessibility basics.',
          materials: [
            { id: 'm3', title: 'HTML Cheatsheet', material_type: 'pdf', file_url: '#' },
            { id: 'm4', title: 'MDN Web Docs', material_type: 'link', file_url: 'https://developer.mozilla.org' },
          ],
        },
        {
          id: 'l3', title: 'CSS & Flexbox Layout', lesson_order: 3,
          objectives: 'Box model, responsive design, flexbox.',
          materials: [
            { id: 'm5', title: 'Flexbox Froggy Game', material_type: 'link', file_url: 'https://flexboxfroggy.com' },
          ],
        },
      ],
    },
    {
      id: 'w2', week_number: 2, title: 'JavaScript Fundamentals',
      objectives: 'Write interactive JS; understand the DOM; use modern ES6+ syntax.',
      lessons: [
        {
          id: 'l4', title: 'Variables, Types & Functions', lesson_order: 1,
          objectives: 'let/const, arrow functions, template literals.',
          materials: [
            { id: 'm6', title: 'JS Crash Course', material_type: 'video', file_url: '#' },
          ],
        },
        {
          id: 'l5', title: 'DOM Manipulation', lesson_order: 2,
          objectives: 'querySelector, event listeners, fetch API.',
          materials: [
            { id: 'm7', title: 'Workshop Exercises', material_type: 'file', file_url: '#' },
          ],
        },
      ],
    },
    {
      id: 'w3', week_number: 3, title: 'React & Component Thinking',
      objectives: 'Build composable UIs with React, props, state, and hooks.',
      lessons: [
        {
          id: 'l6', title: 'Intro to React', lesson_order: 1,
          objectives: 'JSX, components, create-react-app.',
          materials: [],
        },
        {
          id: 'l7', title: 'useState & useEffect', lesson_order: 2,
          objectives: 'Managing local state and side effects.',
          materials: [
            { id: 'm8', title: 'Hooks Reference', material_type: 'link', file_url: '#' },
          ],
        },
      ],
    },
  ],
};

const DEMO_SCHEDULE = [
  { id: 's1', date: '2026-05-15', title: 'DOM Manipulation Workshop', tutor: 'Chidi Okafor', cohort: 'Cohort Alpha', status: 'in_progress', time: '09:00 – 11:00' },
  { id: 's2', date: '2026-05-15', title: 'CSS Grid Deep Dive', tutor: 'Amaka Eze', cohort: 'Cohort Beta', status: 'scheduled', time: '13:00 – 15:00' },
  { id: 's3', date: '2026-05-14', title: 'React Hooks Lab', tutor: 'Chidi Okafor', cohort: 'Cohort Alpha', status: 'completed', time: '10:00 – 12:00' },
  { id: 's4', date: '2026-05-13', title: 'JavaScript ES6+', tutor: 'Tunde Balogun', cohort: 'Cohort 5', status: 'completed', time: '09:00 – 11:00' },
  { id: 's5', date: '2026-05-12', title: 'HTML5 & Accessibility', tutor: 'Amaka Eze', cohort: 'Cohort Beta', status: 'completed', time: '14:00 – 16:00' },
  { id: 's6', date: '2026-05-16', title: 'API Integration', tutor: 'Chidi Okafor', cohort: 'Cohort Alpha', status: 'scheduled', time: '09:00 – 11:00' },
];

const DEMO_STUDENTS = [
  { id: 'u1', name: 'Adaeze Nwosu', email: 'adaeze@demo.com', cohort: 'Cohort Alpha', status: 'active', joined: '2026-01-15' },
  { id: 'u2', name: 'Emeka Obi', email: 'emeka@demo.com', cohort: 'Cohort Alpha', status: 'active', joined: '2026-01-15' },
  { id: 'u3', name: 'Fatima Aliyu', email: 'fatima@demo.com', cohort: 'Cohort Alpha', status: 'active', joined: '2026-01-16' },
  { id: 'u4', name: 'Kelechi Eze', email: 'kelechi@demo.com', cohort: 'Cohort Beta', status: 'active', joined: '2026-03-01' },
  { id: 'u5', name: 'Ngozi Okonkwo', email: 'ngozi@demo.com', cohort: 'Cohort Alpha', status: 'active', joined: '2026-01-20' },
  { id: 'u6', name: 'Yusuf Abdullahi', email: 'yusuf@demo.com', cohort: 'Cohort 5', status: 'active', joined: '2026-04-01' },
  { id: 'u7', name: 'Chisom Ike', email: 'chisom@demo.com', cohort: 'Cohort Beta', status: 'active', joined: '2026-03-02' },
  { id: 'u8', name: 'Aisha Bello', email: 'aisha@demo.com', cohort: 'Cohort Alpha', status: 'active', joined: '2026-01-18' },
];

// ──────────────────────────────────────────────
// Status colour helpers
// ──────────────────────────────────────────────
const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  scheduled: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  in_progress: 'bg-warning/15 text-warning border-warning/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
};

const MATERIAL_ICONS: Record<string, any> = { pdf: FileText, video: Video, link: Link2, file: FileText };
const MATERIAL_COLOURS: Record<string, string> = { pdf: 'text-red-500', video: 'text-red-600', link: 'text-blue-500', file: 'text-indigo-500' };

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────
function WeekCard({ week }: { week: typeof DEMO_CURRICULUM.weeks[0] }) {
  const [open, setOpen] = useState(true);
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Week {week.week_number}</span>
          <h4 className="font-semibold mt-0.5">{week.title}</h4>
          {week.objectives && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{week.objectives}</p>}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{week.lessons.length} lesson{week.lessons.length !== 1 ? 's' : ''}</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-border">
          {week.lessons.map(lesson => {
            const Icon = expandedLesson === lesson.id ? ChevronDown : ChevronRight;
            return (
              <div key={lesson.id} className="px-5">
                <button
                  className="w-full flex items-center gap-3 py-3 text-left hover:text-primary transition-colors"
                  onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                >
                  <span className="text-xs text-muted-foreground w-4">{lesson.lesson_order}</span>
                  <BookOpen className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">{lesson.title}</span>
                  <div className="flex items-center gap-2">
                    {lesson.materials.length > 0 && (
                      <span className="text-xs text-muted-foreground">{lesson.materials.length} material{lesson.materials.length !== 1 ? 's' : ''}</span>
                    )}
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>

                {expandedLesson === lesson.id && (
                  <div className="pb-3 pl-7 space-y-2">
                    {lesson.objectives && (
                      <p className="text-xs text-muted-foreground">{lesson.objectives}</p>
                    )}
                    {lesson.materials.map(m => {
                      const MI = MATERIAL_ICONS[m.material_type] || Link2;
                      return (
                        <div key={m.id} className="flex items-center gap-2 py-1">
                          <MI className={`h-3.5 w-3.5 ${MATERIAL_COLOURS[m.material_type] || ''}`} />
                          <span className="text-sm">{m.title}</span>
                          {m.file_url && m.file_url !== '#' && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      );
                    })}
                    {lesson.materials.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No materials yet</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Demo Page
// ──────────────────────────────────────────────
export default function DemoPage() {
  const navigate = useNavigate();
  const [studentSearch, setStudentSearch] = useState('');
  const [activeSession, setActiveSession] = useState(false);

  const filteredStudents = DEMO_STUDENTS.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top banner */}
      <div className="bg-primary text-primary-foreground py-3 px-4 text-center text-sm flex items-center justify-center gap-3">
        <Sparkles className="h-4 w-4" />
        <span>You're viewing the <strong>FutureLabs LMS Demo</strong> — all data is sample data. Nothing is saved.</span>
        <Button
          size="sm"
          variant="secondary"
          className="ml-2 h-7 px-3 text-xs"
          onClick={() => navigate('/login')}
        >
          Request Access <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg"><span className="text-primary">Future</span>Labs LMS</span>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">Demo</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
            <Button size="sm" onClick={() => navigate('/login')}>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to FutureLabs LMS</h1>
          <p className="text-muted-foreground max-w-xl">
            The all-in-one learning management system built for African coding academies.
            Explore the features below — everything you see is live and interactive.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {DEMO_STATS.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass-card rounded-2xl border border-border p-5">
                <div className={`${stat.colour} mb-2`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Active session banner */}
        {activeSession && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1"><Radio className="h-3 w-3" />LIVE ATTENDANCE SESSION</div>
                <div className="font-mono text-5xl font-black tracking-[0.2em] text-primary">A8X3P</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />Expires in 12:47
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setActiveSession(false)}>Close Session</Button>
            </div>
          </div>
        )}

        {/* Main tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
            <TabsTrigger value="curriculum"><BookOpen className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
            <TabsTrigger value="cohorts"><Layers className="h-4 w-4 mr-1.5" />Cohorts</TabsTrigger>
            <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
            <TabsTrigger value="students"><Users className="h-4 w-4 mr-1.5" />Students</TabsTrigger>
            <TabsTrigger value="attendance"><Radio className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Recent Lessons</h3>
                <div className="space-y-2">
                  {DEMO_SCHEDULE.slice(0, 4).map(s => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.cohort} · {s.tutor}</p>
                      </div>
                      <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[s.status] || ''}`}>
                        {s.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Active Cohorts</h3>
                <div className="space-y-2">
                  {DEMO_COHORTS.filter(c => c.status === 'active').map(c => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.program}</p>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />{c.students}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border-2 border-dashed border-primary/20 p-4 text-center">
                  <BarChart2 className="h-6 w-6 mx-auto mb-2 text-primary opacity-50" />
                  <p className="text-sm font-medium">78% course completion</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Across all active cohorts this month</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* CURRICULUM */}
          <TabsContent value="curriculum">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-lg">{DEMO_CURRICULUM.title}</h3>
                <p className="text-sm text-muted-foreground">Cohort Alpha — Jan 2026</p>
              </div>
              <Badge variant="outline" className="text-xs">Read-only demo</Badge>
            </div>
            <div className="space-y-4">
              {DEMO_CURRICULUM.weeks.map(week => <WeekCard key={week.id} week={week} />)}
            </div>
          </TabsContent>

          {/* COHORTS */}
          <TabsContent value="cohorts">
            <h3 className="font-semibold mb-4">All Cohorts</h3>
            <div className="space-y-3">
              {DEMO_COHORTS.map(c => (
                <div key={c.id} className="glass-card rounded-xl border border-border p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.program}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />{c.students} students
                    </div>
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[c.status] || ''}`}>{c.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SCHEDULE */}
          <TabsContent value="schedule">
            <h3 className="font-semibold mb-4">Lesson Schedule</h3>
            <div className="space-y-2">
              {DEMO_SCHEDULE.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-14">
                      <div className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString('en', { weekday: 'short' })}</div>
                      <div className="font-mono text-sm font-semibold">{new Date(s.date).toLocaleDateString('en', { day: '2-digit', month: 'short' })}</div>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.cohort} · {s.tutor} · {s.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[s.status] || ''}`}>
                      {s.status.replace('_', ' ')}
                    </Badge>
                    {s.status === 'in_progress' && (
                      <span className="flex items-center gap-1 text-xs text-warning font-medium">
                        <Play className="h-3 w-3" />Live
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* STUDENTS */}
          <TabsContent value="students">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Students ({filteredStudents.length})</h3>
              <input
                className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-52"
                placeholder="Search students..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              {filteredStudents.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {s.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground hidden sm:block">{s.cohort}</p>
                  <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLOURS[s.status]}`}>{s.status}</Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ATTENDANCE */}
          <TabsContent value="attendance">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">Attendance Sessions</h3>
              {!activeSession && (
                <Button size="sm" onClick={() => setActiveSession(true)}>
                  <Radio className="h-4 w-4 mr-1.5" />Start Demo Session
                </Button>
              )}
            </div>

            {activeSession && (
              <div className="mb-5 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-6">
                <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1"><Radio className="h-3 w-3" />LIVE SESSION</div>
                <div className="font-mono text-5xl font-black tracking-[0.2em] text-primary">A8X3P</div>
                <p className="text-sm text-muted-foreground mt-2">Students scan a QR code or enter this code to mark attendance in real-time. Expires in 30 minutes.</p>
              </div>
            )}

            <div className="space-y-2">
              {[
                { code: 'K9MQZ', lesson: 'React Hooks Lab', date: '2026-05-14', present: 21, late: 2, absent: 1 },
                { code: 'P2LNB', lesson: 'JavaScript ES6+', date: '2026-05-13', present: 29, late: 1, absent: 1 },
                { code: 'R7XTC', lesson: 'HTML5 & Accessibility', date: '2026-05-12', present: 17, late: 0, absent: 1 },
              ].map(s => (
                <div key={s.code} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold tracking-widest">{s.code}</span>
                    <Badge variant="secondary">closed</Badge>
                    <span className="text-sm text-muted-foreground">{s.lesson}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-success font-medium flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />{s.present}</span>
                    <span className="text-warning font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.late}</span>
                    <span className="text-muted-foreground">{new Date(s.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* CTA Footer */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Ready to power your academy?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            FutureLabs LMS handles enrollment, invoicing, curriculum, attendance, and cohort management — all in one place built for African tech education.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button size="lg" onClick={() => navigate('/login')}>
              Get Started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
              Schedule a Call
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
