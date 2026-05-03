import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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
  Layers,
  FormInput,
  Shield,
  ShieldCheck,
  UserCircle,
  Wallet,
  Banknote,
  Receipt,
  PieChart,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

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
  { to: '/admin/cohorts', icon: Layers, label: 'Cohorts' },
  { to: '/admin/organizations', icon: Building2, label: 'Organizations' },
  { to: '/admin/custom-fields', icon: FormInput, label: 'Custom Fields' },
  { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { to: '/admin/bulk-email', icon: Mail, label: 'Bulk Email' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { to: '/admin/audit-logs', icon: Shield, label: 'Audit Logs' },
];

const studentNav = [
  { to: '/student', icon: LayoutDashboard, label: 'My Dashboard' },
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

export function AppSidebar({ variant = 'desktop', onNavigate }: AppSidebarProps) {
  const { isAdmin, isOrganization, signOut, user } = useAuth();
  const location = useLocation();

  const isSuperadmin = user?.email?.toLowerCase() === 'manassehudim@gmail.com';
  const baseNav = isAdmin ? adminNav : isOrganization ? orgNav : studentNav;
  const nav = isAdmin && isSuperadmin
    ? [...baseNav,
        { to: '/admin/payroll', icon: Banknote, label: 'Payroll' },
        { to: '/admin/manage-admins', icon: ShieldCheck, label: 'Manage Admins' },
      ]
    : baseNav;

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
