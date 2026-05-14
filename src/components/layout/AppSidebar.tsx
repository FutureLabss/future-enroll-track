import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Building2,
  CreditCard,
  Bell,
  BarChart3,
  LogOut,
  FormInput,
  Shield,
  ShieldCheck,
  UserCircle,
  Wallet,
  Banknote,
  Receipt,
  PieChart,
  Mail,
  AlertTriangle,
  ClipboardCheck,
  Inbox,
  School,
  BookOpen,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Routes hidden from demo users — contain unscoped or sensitive data
const DEMO_HIDDEN_ROUTES = new Set([
  '/admin/staff-invitations',
  '/admin/organizations',
  '/admin/custom-fields',
  '/admin/notifications',
  '/admin/bulk-email',
  '/admin/reports',
  '/admin/audit-logs',
]);

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/finance', icon: PieChart, label: 'Finance' },
  { to: '/admin/enrollments', icon: Users, label: 'Enrollments' },
  { to: '/admin/invoices', icon: FileText, label: 'Invoices' },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments' },
  { to: '/admin/pending-payments', icon: Banknote, label: 'Pending Payments' },
  { to: '/admin/outstanding', icon: AlertTriangle, label: 'Outstanding' },
  { to: '/admin/other-income', icon: Wallet, label: 'Other Income' },
  { to: '/admin/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/admin/programs', icon: GraduationCap, label: 'Programs' },
  { to: '/admin/classrooms', icon: School, label: 'Classrooms' },
  { to: '/admin/staff-invitations', icon: Mail, label: 'Staff Invitations' },
  { to: '/admin/organizations', icon: Building2, label: 'Organizations' },
  { to: '/admin/custom-fields', icon: FormInput, label: 'Custom Fields' },
  { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { to: '/admin/bulk-email', icon: Mail, label: 'Bulk Email' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { to: '/admin/audit-logs', icon: Shield, label: 'Audit Logs' },
];

const studentNav = [
  { to: '/student', icon: LayoutDashboard, label: 'My Dashboard' },
  { to: '/student/classrooms', icon: School, label: 'My Classrooms' },
  { to: '/student/invoices', icon: FileText, label: 'My Invoices' },
  { to: '/student/payments', icon: CreditCard, label: 'Payment History' },
];

const orgNav = [
  { to: '/org', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/org/enrollments', icon: Users, label: 'Sponsored Learners' },
  { to: '/org/reports', icon: BarChart3, label: 'Reports' },
];

interface AppSidebarProps {
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

function HubSwitcher({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [hubs, setHubs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('hubs').select('id, name, slug').order('name'),
      supabase.from('hub_members').select('hub_id').eq('user_id', userId).maybeSingle(),
    ]).then(([hubsRes, memberRes]) => {
      if (hubsRes.data) setHubs(hubsRes.data);
      if (memberRes.data) setActiveHubId(memberRes.data.hub_id);
    });
  }, [userId]);

  const switchHub = async (hub: { id: string; slug: string }) => {
    if (hub.id === activeHubId || switching) return;
    setSwitching(true);
    await supabase
      .from('hub_members')
      .update({ hub_id: hub.id, hub_role: 'owner' })
      .eq('user_id', userId);
    // Navigate to the hub portal which will redirect to /admin with fresh context
    navigate(`/${hub.slug}`, { replace: true });
    window.location.reload();
  };

  const activeHub = hubs.find(h => h.id === activeHubId);

  return (
    <div className="px-3 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors text-left">
            <Building2 className="h-3.5 w-3.5 text-sidebar-foreground/60 flex-shrink-0" />
            <span className="flex-1 truncate text-sidebar-foreground/80">
              {switching ? 'Switching…' : (activeHub?.name ?? 'Select hub')}
            </span>
            <ChevronsUpDown className="h-3 w-3 text-sidebar-foreground/40 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch hub context</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hubs.map(hub => (
            <DropdownMenuItem
              key={hub.id}
              onClick={() => switchHub(hub)}
              className="flex items-center gap-2 cursor-pointer"
            >
              {hub.id === activeHubId && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              {hub.id !== activeHubId && <span className="w-3.5" />}
              <span className="truncate">{hub.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppSidebar({ variant = 'desktop', onNavigate }: AppSidebarProps) {
  const { isAdmin, isOrganization, isSuperadmin: isSA, isDemo, signOut, user } = useAuth();
  const location = useLocation();

  const isSuperadmin = isSA || user?.email?.toLowerCase() === 'manassehudim@gmail.com';
  const rawBaseNav = isAdmin ? adminNav : isOrganization ? orgNav : studentNav;
  const baseNav = isDemo ? rawBaseNav.filter(item => !DEMO_HIDDEN_ROUTES.has(item.to)) : rawBaseNav;
  const adminExtras = isAdmin
    ? [
        ...(isSuperadmin
          ? [
              { to: '/admin/invoice-approvals', icon: ClipboardCheck, label: 'Invoice Approvals' },
              { to: '/admin/staff-invoices', icon: Inbox, label: 'Staff Invoices' },
              { to: '/admin/payroll', icon: Banknote, label: 'Payroll' },
              { to: '/admin/manage-admins', icon: ShieldCheck, label: 'Manage Admins' },
              { to: '/admin/hubs', icon: Building2, label: 'Hub Management' },
            ]
          : []),
      ]
    : [];
  // Allow non-admins (staff) to see their submission page and classrooms
  const staffExtras = !isAdmin && !isOrganization
    ? [
        { to: '/staff/classrooms', icon: School, label: 'My Classrooms' },
        { to: '/staff/invitations', icon: Inbox, label: 'My Invitations' },
        { to: '/staff/invoices', icon: FileText, label: 'Invoice Company' },
      ]
    : [];
  const nav = [...baseNav, ...adminExtras, ...staffExtras];

  const containerClass =
    variant === 'mobile'
      ? 'h-full w-full bg-sidebar text-sidebar-foreground flex flex-col'
      : 'fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border';

  const Wrapper: any = variant === 'mobile' ? 'div' : 'aside';

  return (
    <Wrapper className={containerClass}>
      <div className="px-6 py-6 border-b border-sidebar-border">
        <h1 className="font-heading text-xl font-bold tracking-tight">
          <span className="text-sidebar-primary">Future</span>Labs
        </h1>
        <p className="text-xs text-sidebar-foreground/60 mt-1">
          {isAdmin ? 'Admin Portal' : isOrganization ? 'Sponsor Portal' : 'Student Portal'}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin' || item.to === '/student' || item.to === '/org'}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {isSuperadmin && user && (
        <div className="border-t border-sidebar-border pt-2">
          <p className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Hub Context</p>
          <HubSwitcher userId={user.id} />
        </div>
      )}

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
        </div>
        <div className="flex gap-1">
          <NavLink
            to="/profile"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              cn(
                'flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <UserCircle className="h-4 w-4" /> Profile
          </NavLink>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 mt-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => { onNavigate?.(); signOut(); }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </Wrapper>
  );
}
