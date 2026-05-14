import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, BookOpen, Calendar, Users, Layers,
  CheckCircle, Clock, Radio, Play, FileText, Video, Link2,
  ChevronDown, ChevronRight, GraduationCap, BarChart2,
  ExternalLink, Sparkles, Building2, ArrowRight,
  CreditCard, DollarSign, TrendingUp, Receipt, Loader2,
  ClipboardList, UserCheck, AlertCircle, PieChart, Wallet,
  UserPlus, FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Demo seed data
// ─────────────────────────────────────────────────────────────────────

const DEMO_STATS = [
  { label: 'Active Students', value: '147', icon: Users, colour: 'text-primary' },
  { label: 'Programs', value: '6', icon: GraduationCap, colour: 'text-success' },
  { label: 'Revenue (May)', value: '₦4.2M', icon: TrendingUp, colour: 'text-warning' },
  { label: 'Lessons This Month', value: '38', icon: Calendar, colour: 'text-blue-500' },
];

const DEMO_FINANCE = {
  summary: [
    { label: 'Total Revenue', value: '₦4,218,000', sub: '+12% vs last month', icon: TrendingUp, colour: 'text-success' },
    { label: 'Outstanding', value: '₦890,000', sub: '23 unpaid invoices', icon: AlertCircle, colour: 'text-warning' },
    { label: 'Expenses', value: '₦1,120,000', sub: 'Payroll + ops', icon: Receipt, colour: 'text-destructive' },
    { label: 'Net Profit', value: '₦3,098,000', sub: 'May 2026', icon: Wallet, colour: 'text-primary' },
  ],
  invoices: [
    { id: 'INV-0041', student: 'Adaeze Nwosu', program: 'Full-Stack Web Dev', amount: '₦120,000', status: 'paid', date: '2026-05-12' },
    { id: 'INV-0042', student: 'Emeka Obi', program: 'Full-Stack Web Dev', amount: '₦120,000', status: 'pending', date: '2026-05-13' },
    { id: 'INV-0043', student: 'Fatima Aliyu', program: 'Data Science', amount: '₦95,000', status: 'paid', date: '2026-05-10' },
    { id: 'INV-0044', student: 'Kelechi Eze', program: 'UI/UX Design', amount: '₦80,000', status: 'overdue', date: '2026-04-28' },
    { id: 'INV-0045', student: 'Ngozi Okonkwo', program: 'Full-Stack Web Dev', amount: '₦120,000', status: 'paid', date: '2026-05-14' },
    { id: 'INV-0046', student: 'Yusuf Abdullahi', program: 'Data Science', amount: '₦95,000', status: 'pending', date: '2026-05-14' },
  ],
  payments: [
    { ref: 'PAY-7821', student: 'Adaeze Nwosu', amount: '₦120,000', channel: 'Paystack', date: '2026-05-12' },
    { ref: 'PAY-7820', student: 'Fatima Aliyu', amount: '₦95,000', channel: 'Bank Transfer', date: '2026-05-10' },
    { ref: 'PAY-7819', student: 'Ngozi Okonkwo', amount: '₦120,000', channel: 'Paystack', date: '2026-05-14' },
  ],
};

const DEMO_ENROLLMENTS = [
  { id: 'ENR-201', name: 'Adaeze Nwosu', program: 'Full-Stack Web Dev', status: 'active', date: '2026-01-10', invoiced: true },
  { id: 'ENR-202', name: 'Emeka Obi', program: 'Full-Stack Web Dev', status: 'active', date: '2026-01-11', invoiced: true },
  { id: 'ENR-203', name: 'Fatima Aliyu', program: 'Data Science', status: 'active', date: '2026-01-12', invoiced: true },
  { id: 'ENR-204', name: 'Kelechi Eze', program: 'UI/UX Design', status: 'pending', date: '2026-03-01', invoiced: false },
  { id: 'ENR-205', name: 'Ngozi Okonkwo', program: 'Full-Stack Web Dev', status: 'active', date: '2026-01-14', invoiced: true },
  { id: 'ENR-206', name: 'Yusuf Abdullahi', program: 'Data Science', status: 'active', date: '2026-04-01', invoiced: false },
  { id: 'ENR-207', name: 'Chisom Ike', program: 'UI/UX Design', status: 'pending', date: '2026-03-02', invoiced: false },
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
        { id: 'l1', title: 'How the Internet Works', lesson_order: 1, objectives: 'DNS, HTTP, TCP/IP overview.',
          materials: [{ id: 'm1', title: 'Lecture Slides', material_type: 'pdf', file_url: '#' }, { id: 'm2', title: 'Intro Video', material_type: 'video', file_url: '#' }] },
        { id: 'l2', title: 'HTML5 Essentials', lesson_order: 2, objectives: 'Semantic tags, forms, accessibility basics.',
          materials: [{ id: 'm3', title: 'HTML Cheatsheet', material_type: 'pdf', file_url: '#' }, { id: 'm4', title: 'MDN Web Docs', material_type: 'link', file_url: 'https://developer.mozilla.org' }] },
        { id: 'l3', title: 'CSS & Flexbox Layout', lesson_order: 3, objectives: 'Box model, responsive design, flexbox.',
          materials: [{ id: 'm5', title: 'Flexbox Froggy', material_type: 'link', file_url: 'https://flexboxfroggy.com' }] },
      ],
    },
    {
      id: 'w2', week_number: 2, title: 'JavaScript Fundamentals',
      objectives: 'Write interactive JS; understand the DOM; use modern ES6+ syntax.',
      lessons: [
        { id: 'l4', title: 'Variables, Types & Functions', lesson_order: 1, objectives: 'let/const, arrow functions, template literals.',
          materials: [{ id: 'm6', title: 'JS Crash Course', material_type: 'video', file_url: '#' }] },
        { id: 'l5', title: 'DOM Manipulation', lesson_order: 2, objectives: 'querySelector, event listeners, fetch API.',
          materials: [{ id: 'm7', title: 'Workshop Exercises', material_type: 'file', file_url: '#' }] },
      ],
    },
    {
      id: 'w3', week_number: 3, title: 'React & Component Thinking',
      objectives: 'Build composable UIs with React, props, state, and hooks.',
      lessons: [
        { id: 'l6', title: 'Intro to React', lesson_order: 1, objectives: 'JSX, components, create-react-app.', materials: [] },
        { id: 'l7', title: 'useState & useEffect', lesson_order: 2, objectives: 'Managing local state and side effects.',
          materials: [{ id: 'm8', title: 'Hooks Reference', material_type: 'link', file_url: '#' }] },
      ],
    },
  ],
};

const DEMO_SCHEDULE = [
  { id: 's1', date: '2026-05-15', title: 'DOM Manipulation Workshop', tutor: 'Chidi Okafor', cohort: 'Cohort Alpha', status: 'in_progress', time: '09:00 – 11:00' },
  { id: 's2', date: '2026-05-15', title: 'CSS Grid Deep Dive', tutor: 'Amaka Eze', cohort: 'Cohort Beta', status: 'scheduled', time: '13:00 – 15:00' },
  { id: 's3', date: '2026-05-14', title: 'React Hooks Lab', tutor: 'Chidi Okafor', cohort: 'Cohort Alpha', status: 'completed', time: '10:00 – 12:00' },
  { id: 's4', date: '2026-05-13', title: 'JavaScript ES6+', tutor: 'Tunde Balogun', cohort: 'Cohort 5', status: 'completed', time: '09:00 – 11:00' },
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

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  active:     'bg-success/15 text-success border-success/30',
  upcoming:   'bg-blue-500/15 text-blue-600 border-blue-500/30',
  completed:  'bg-muted text-muted-foreground border-muted',
  scheduled:  'bg-blue-500/15 text-blue-600 border-blue-500/30',
  in_progress:'bg-warning/15 text-warning border-warning/30',
  pending:    'bg-amber-500/15 text-amber-600 border-amber-500/30',
  overdue:    'bg-destructive/15 text-destructive border-destructive/30',
  paid:       'bg-success/15 text-success border-success/30',
};

const MATERIAL_ICONS: Record<string, any> = { pdf: FileText, video: Video, link: Link2, file: FileText };
const MATERIAL_COLOURS: Record<string, string> = { pdf: 'text-red-500', video: 'text-red-600', link: 'text-blue-500', file: 'text-indigo-500' };

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

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
          <span className="text-xs">{week.lessons.length} lessons</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-border">
          {week.lessons.map(lesson => {
            const Ico = expandedLesson === lesson.id ? ChevronDown : ChevronRight;
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
                    {lesson.materials.length > 0 && <span className="text-xs text-muted-foreground">{lesson.materials.length} materials</span>}
                    <Ico className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>
                {expandedLesson === lesson.id && (
                  <div className="pb-3 pl-7 space-y-2">
                    {lesson.objectives && <p className="text-xs text-muted-foreground">{lesson.objectives}</p>}
                    {lesson.materials.map(m => {
                      const MI = MATERIAL_ICONS[m.material_type] || Link2;
                      return (
                        <div key={m.id} className="flex items-center gap-2 py-1">
                          <MI className={`h-3.5 w-3.5 ${MATERIAL_COLOURS[m.material_type] || ''}`} />
                          <span className="text-sm">{m.title}</span>
                          {m.file_url && m.file_url !== '#' && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      );
                    })}
                    {lesson.materials.length === 0 && <p className="text-xs text-muted-foreground italic">No materials yet</p>}
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

// ─────────────────────────────────────────────────────────────────────
// Get Started modal
// ─────────────────────────────────────────────────────────────────────

function GetStartedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await supabase.functions.invoke('send-demo-invite', {
        body: { email: email.trim().toLowerCase() },
      });

      if (res.error) throw new Error(res.error.message || 'Failed to send invite');
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSending(false);
    setSent(false);
    setError('');
    onClose();
  };

  if (sent) return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm text-center">
        <div className="py-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <div>
            <h2 className="font-bold text-xl">Check your inbox!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              We've sent a magic link to <strong>{email}</strong>. Click it to instantly access your
              demo hub — <strong>RhemaHub</strong> — preloaded with students, programs, curriculum, and finance data.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Link expires in 7 days · Check your spam folder if you don't see it</p>
          <Button className="w-full" onClick={handleClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Try FutureLabs LMS — Free Demo
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a magic link to log straight into
            <strong> RhemaHub</strong>, our fully loaded demo academy.
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">What's inside RhemaHub</p>
            {[
              '3 programs & 2 classrooms with live cohorts',
              'Full curriculum with lessons & materials',
              'Finance: invoices, payments & expenses',
              'Student roster & enrollment management',
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="demo-email">Your Email</Label>
            <Input
              id="demo-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="mt-1.5"
              placeholder="you@academy.com"
              disabled={sending}
            />
            {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          </div>
          <Button onClick={handleSubmit} disabled={sending} className="w-full" size="lg">
            {sending
              ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Sending magic link…</>
              : <><ArrowRight className="h-4 w-4 mr-2" />Send me the demo link</>
            }
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            No password needed · Instant access · Questions?{' '}
            <a href="mailto:manny@futurelabs.com.ng" className="underline">manny@futurelabs.com.ng</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main Demo Page
// ─────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [studentSearch, setStudentSearch] = useState('');
  const [enrollSearch, setEnrollSearch] = useState('');
  const [activeSession, setActiveSession] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);

  const filteredStudents = DEMO_STUDENTS.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredEnrollments = DEMO_ENROLLMENTS.filter(e =>
    e.name.toLowerCase().includes(enrollSearch.toLowerCase()) ||
    e.program.toLowerCase().includes(enrollSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <GetStartedModal open={getStartedOpen} onClose={() => setGetStartedOpen(false)} />

      {/* Top banner */}
      <div className="bg-primary text-primary-foreground py-2.5 px-4 text-center text-sm flex items-center justify-center gap-3 flex-wrap">
        <Sparkles className="h-4 w-4 flex-shrink-0" />
        <span>You're viewing the <strong>FutureLabs LMS Demo</strong> — sample data only, nothing is saved.</span>
        <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={() => setGetStartedOpen(true)}>
          Get Started <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg"><span className="text-primary">Future</span>Labs LMS</span>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">Demo</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setGetStartedOpen(true)}>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to FutureLabs LMS</h1>
          <p className="text-muted-foreground max-w-2xl">
            The all-in-one learning management system built for African coding academies.
            Enrollment, invoicing, curriculum, attendance, payroll — all in one place.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {DEMO_STATS.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass-card rounded-2xl border border-border p-5">
                <div className={`${stat.colour} mb-2`}><Icon className="h-5 w-5" /></div>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Attendance live banner */}
        {activeSession && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1"><Radio className="h-3 w-3" />LIVE ATTENDANCE SESSION</div>
                <div className="font-mono text-5xl font-black tracking-[0.2em] text-primary">A8X3P</div>
                <p className="text-sm text-muted-foreground mt-2">Students enter this code to mark attendance in real-time. Expires in 29:58.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setActiveSession(false)}>Close Session</Button>
            </div>
          </div>
        )}

        {/* Main tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
            <TabsTrigger value="finance"><DollarSign className="h-4 w-4 mr-1.5" />Finance</TabsTrigger>
            <TabsTrigger value="enrollments"><UserPlus className="h-4 w-4 mr-1.5" />Enrollments</TabsTrigger>
            <TabsTrigger value="curriculum"><BookOpen className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
            <TabsTrigger value="cohorts"><Layers className="h-4 w-4 mr-1.5" />Cohorts</TabsTrigger>
            <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
            <TabsTrigger value="students"><Users className="h-4 w-4 mr-1.5" />Students</TabsTrigger>
            <TabsTrigger value="attendance"><Radio className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ── */}
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
                      <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[s.status] || ''}`}>{s.status.replace('_',' ')}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Finance Snapshot</h3>
                <div className="space-y-2">
                  {DEMO_FINANCE.summary.map(s => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                        <Icon className={`h-4 w-4 ${s.colour} flex-shrink-0`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="text-xs text-muted-foreground">{s.sub}</p>
                        </div>
                        <span className="font-semibold text-sm">{s.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── FINANCE ── */}
          <TabsContent value="finance">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {DEMO_FINANCE.summary.map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="glass-card rounded-2xl border border-border p-5">
                    <Icon className={`h-5 w-5 ${s.colour} mb-2`} />
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                  </div>
                );
              })}
            </div>

            {/* Invoices */}
            <h3 className="font-semibold mb-3 flex items-center gap-2"><FileCheck className="h-4 w-4" />Recent Invoices</h3>
            <div className="space-y-2 mb-6">
              {DEMO_FINANCE.invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">{inv.id}</span>
                    <div>
                      <p className="text-sm font-medium">{inv.student}</p>
                      <p className="text-xs text-muted-foreground">{inv.program} · {new Date(inv.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">{inv.amount}</span>
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[inv.status] || ''}`}>{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent payments */}
            <h3 className="font-semibold mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4" />Recent Payments</h3>
            <div className="space-y-2">
              {DEMO_FINANCE.payments.map(p => (
                <div key={p.ref} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.student}</p>
                    <p className="text-xs text-muted-foreground">{p.ref} · {p.channel} · {new Date(p.date).toLocaleDateString()}</p>
                  </div>
                  <span className="font-bold text-success">{p.amount}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── ENROLLMENTS ── */}
          <TabsContent value="enrollments">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Enrollments ({filteredEnrollments.length})</h3>
              <input
                className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-52"
                placeholder="Search name or program…"
                value={enrollSearch}
                onChange={e => setEnrollSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              {filteredEnrollments.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                      {e.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.program} · {e.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.invoiced
                      ? <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">Invoiced</Badge>
                      : <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">No Invoice</Badge>
                    }
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[e.status] || ''}`}>{e.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── CURRICULUM ── */}
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

          {/* ── COHORTS ── */}
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
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{c.students} students</span>
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[c.status] || ''}`}>{c.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── SCHEDULE ── */}
          <TabsContent value="schedule">
            <h3 className="font-semibold mb-4">Lesson Schedule</h3>
            <div className="space-y-2">
              {DEMO_SCHEDULE.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-14">
                      <div className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString('en',{weekday:'short'})}</div>
                      <div className="font-mono text-sm font-semibold">{new Date(s.date).toLocaleDateString('en',{day:'2-digit',month:'short'})}</div>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.cohort} · {s.tutor} · {s.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[s.status] || ''}`}>{s.status.replace('_',' ')}</Badge>
                    {s.status === 'in_progress' && <span className="text-xs text-warning font-medium flex items-center gap-1"><Play className="h-3 w-3" />Live</span>}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── STUDENTS ── */}
          <TabsContent value="students">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Students ({filteredStudents.length})</h3>
              <input
                className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-52"
                placeholder="Search students…"
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

          {/* ── ATTENDANCE ── */}
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
                <p className="text-sm text-muted-foreground mt-2">Students scan a QR code or enter this code. Expires in 30 minutes.</p>
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
            FutureLabs LMS handles everything — enrollment, invoicing, curriculum, attendance, payroll, and multi-hub management — built for African tech education.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button size="lg" onClick={() => setGetStartedOpen(true)}>
              Get Started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => setGetStartedOpen(true)}>
              Schedule a Call
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Questions? Email us directly at{' '}
            <a href="mailto:manny@futurelabs.com.ng" className="underline text-primary">manny@futurelabs.com.ng</a>
          </p>
        </div>
      </main>
    </div>
  );
}
