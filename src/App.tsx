import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const SetPasswordPage = lazy(() => import("@/pages/auth/SetPasswordPage"));

const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const EnrollmentsPage = lazy(() => import("@/pages/admin/EnrollmentsPage"));
const EnrollmentDetailPage = lazy(() => import("@/pages/admin/EnrollmentDetailPage"));
const InvoicesPage = lazy(() => import("@/pages/admin/InvoicesPage"));
const InvoiceDetailPage = lazy(() => import("@/pages/admin/InvoiceDetailPage"));
const CreateInvoicePage = lazy(() => import("@/pages/admin/CreateInvoicePage"));
const EditInvoicePage = lazy(() => import("@/pages/admin/EditInvoicePage"));
const PaymentsPage = lazy(() => import("@/pages/admin/PaymentsPage"));
const PendingPaymentsPage = lazy(() => import("@/pages/admin/PendingPaymentsPage"));
const ProgramsPage = lazy(() => import("@/pages/admin/ProgramsPage"));
const ProgramDetailPage = lazy(() => import("@/pages/admin/ProgramDetailPage"));
const OrganizationsPage = lazy(() => import("@/pages/admin/OrganizationsPage"));
const CustomFieldsPage = lazy(() => import("@/pages/admin/CustomFieldsPage"));
const NotificationsPage = lazy(() => import("@/pages/admin/NotificationsPage"));
const ReportsPage = lazy(() => import("@/pages/admin/ReportsPage"));
const AuditLogPage = lazy(() => import("@/pages/admin/AuditLogPage"));
const ManageAdminsPage = lazy(() => import("@/pages/admin/ManageAdminsPage"));
const PayrollPage = lazy(() => import("@/pages/admin/PayrollPage"));
const OtherIncomePage = lazy(() => import("@/pages/admin/OtherIncomePage"));
const ExpensesPage = lazy(() => import("@/pages/admin/ExpensesPage"));
const FinanceDashboardPage = lazy(() => import("@/pages/admin/FinanceDashboardPage"));
const BulkEmailPage = lazy(() => import("@/pages/admin/BulkEmailPage"));
const OutstandingInvoicesPage = lazy(() => import("@/pages/admin/OutstandingInvoicesPage"));
const InvoiceApprovalsPage = lazy(() => import("@/pages/admin/InvoiceApprovalsPage"));
const StaffInvoicesAdminPage = lazy(() => import("@/pages/admin/StaffInvoicesAdminPage"));
const HubsPage = lazy(() => import("@/pages/admin/HubsPage"));
const ClassroomsPage = lazy(() => import("@/pages/admin/ClassroomsPage"));
const ClassroomDetailPage = lazy(() => import("@/pages/admin/ClassroomDetailPage"));
const CohortsPage = lazy(() => import("@/pages/admin/CohortsPage"));
const CohortDetailPage = lazy(() => import("@/pages/admin/CohortDetailPage"));
const StaffInvitationsAdminPage = lazy(() => import("@/pages/admin/StaffInvitationsAdminPage"));

const StaffInvoicesPage = lazy(() => import("@/pages/staff/StaffInvoicesPage"));
const StaffClassroomsPage = lazy(() => import("@/pages/staff/StaffClassroomsPage"));
const ClassroomWorkspacePage = lazy(() => import("@/pages/staff/ClassroomWorkspacePage"));
const StaffInvitationsPage = lazy(() => import("@/pages/staff/StaffInvitationsPage"));

const StudentDashboard = lazy(() => import("@/pages/student/StudentDashboard"));
const StudentInvoicesPage = lazy(() => import("@/pages/student/StudentInvoicesPage"));
const StudentInvoiceDetailPage = lazy(() => import("@/pages/student/StudentInvoiceDetailPage"));
const PaymentCallbackPage = lazy(() => import("@/pages/student/PaymentCallbackPage"));
const StudentPaymentsPage = lazy(() => import("@/pages/student/StudentPaymentsPage"));
const StudentNotificationsPage = lazy(() => import("@/pages/student/StudentNotificationsPage"));
const StudentClassroomsPage = lazy(() => import("@/pages/student/StudentClassroomsPage"));
const StudentClassroomPage = lazy(() => import("@/pages/student/StudentClassroomPage"));

const OrgDashboard = lazy(() => import("@/pages/org/OrgDashboard"));
const OrgEnrollmentsPage = lazy(() => import("@/pages/org/OrgEnrollmentsPage"));
const OrgReportsPage = lazy(() => import("@/pages/org/OrgReportsPage"));

const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const AssignmentDetailPage = lazy(() => import("@/pages/shared/AssignmentDetailPage"));

const EnrollPage = lazy(() => import("@/pages/public/EnrollPage"));
const StudentSignupPage = lazy(() => import("@/pages/public/StudentSignupPage"));
const AcceptInvitationPage = lazy(() => import("@/pages/public/AcceptInvitationPage"));
const AcceptHubInvitationPage = lazy(() => import("@/pages/public/AcceptHubInvitationPage"));
const DemoPage = lazy(() => import("@/pages/public/DemoPage"));
const HubPortalPage = lazy(() => import("@/pages/public/HubPortalPage"));

const NotFound = lazy(() => import("./pages/NotFound"));

const PageSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminGuard() {
  const { isAdmin, isStaff, isHubManager, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  // Hub managers (CEO, training manager) can access classroom management only
  if (!isAdmin && isHubManager && location.pathname.startsWith('/admin/classrooms')) return <Outlet />;
  if (!isAdmin) return <Navigate to={isStaff ? '/staff/classrooms' : '/student'} replace />;
  return <Outlet />;
}

function RoleRedirect() {
  const { isAdmin, isOrganization, isStaff, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isOrganization) return <Navigate to="/org" replace />;
  if (isStaff) return <Navigate to="/staff/classrooms" replace />;
  return <Navigate to="/student" replace />;
}

function LegacyEnrollRedirect() {
  const { id } = useParams();
  return <Navigate to={`/students/${id}`} replace />;
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/enroll" element={<EnrollPage />} />
              <Route path="/students/:id" element={<StudentSignupPage />} />
              <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
              <Route path="/accept-hub-invitation" element={<AcceptHubInvitationPage />} />
              <Route path="/set-password" element={<SetPasswordPage />} />
              <Route path="/demo" element={<DemoPage />} />
              <Route path="/enroll/complete/:id" element={<LegacyEnrollRedirect />} />
              <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

              {/* Admin routes */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route element={<AdminGuard />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
                  <Route path="/admin/enrollments/:id" element={<EnrollmentDetailPage />} />
                  <Route path="/admin/invoices" element={<InvoicesPage />} />
                  <Route path="/admin/invoices/:id" element={<InvoiceDetailPage />} />
                  <Route path="/admin/invoices/:id/edit" element={<EditInvoicePage />} />
                  <Route path="/admin/invoices/new" element={<CreateInvoicePage />} />
                  <Route path="/admin/bulk-email" element={<BulkEmailPage />} />
                  <Route path="/admin/payments" element={<PaymentsPage />} />
                  <Route path="/admin/pending-payments" element={<PendingPaymentsPage />} />
                  <Route path="/admin/programs" element={<ProgramsPage />} />
                  <Route path="/admin/programs/:id" element={<ProgramDetailPage />} />
                  <Route path="/admin/organizations" element={<OrganizationsPage />} />
                  <Route path="/admin/custom-fields" element={<CustomFieldsPage />} />
                  <Route path="/admin/notifications" element={<NotificationsPage />} />
                  <Route path="/admin/reports" element={<ReportsPage />} />
                  <Route path="/admin/audit-logs" element={<AuditLogPage />} />
                  <Route path="/admin/manage-admins" element={<ManageAdminsPage />} />
                  <Route path="/admin/payroll" element={<PayrollPage />} />
                  <Route path="/admin/other-income" element={<OtherIncomePage />} />
                  <Route path="/admin/expenses" element={<ExpensesPage />} />
                  <Route path="/admin/finance" element={<FinanceDashboardPage />} />
                  <Route path="/admin/outstanding" element={<OutstandingInvoicesPage />} />
                  <Route path="/admin/invoice-approvals" element={<InvoiceApprovalsPage />} />
                  <Route path="/admin/staff-invoices" element={<StaffInvoicesAdminPage />} />
                  <Route path="/admin/hubs" element={<HubsPage />} />
                  <Route path="/admin/classrooms" element={<ClassroomsPage />} />
                  <Route path="/admin/classrooms/:id" element={<ClassroomDetailPage />} />
                  <Route path="/admin/assignments/:id" element={<AssignmentDetailPage />} />
                  <Route path="/admin/cohorts" element={<CohortsPage />} />
                  <Route path="/admin/cohorts/:id" element={<CohortDetailPage />} />
                  <Route path="/admin/staff-invitations" element={<StaffInvitationsAdminPage />} />
                </Route>

                {/* Staff routes */}
                <Route path="/staff/invoices" element={<StaffInvoicesPage />} />
                <Route path="/staff/classrooms" element={<StaffClassroomsPage />} />
                <Route path="/staff/classrooms/:id" element={<ClassroomWorkspacePage />} />
                <Route path="/staff/assignments/:id" element={<AssignmentDetailPage />} />
                <Route path="/staff/invitations" element={<StaffInvitationsPage />} />

                {/* Student routes */}
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/invoices" element={<StudentInvoicesPage />} />
                <Route path="/student/invoices/:id" element={<StudentInvoiceDetailPage />} />
                <Route path="/student/invoices/:id/payment-callback" element={<PaymentCallbackPage />} />
                <Route path="/student/payments" element={<StudentPaymentsPage />} />
                <Route path="/student/notifications" element={<StudentNotificationsPage />} />
                <Route path="/student/classrooms" element={<StudentClassroomsPage />} />
                <Route path="/student/classrooms/:id" element={<StudentClassroomPage />} />

                {/* Org routes */}
                <Route path="/org" element={<OrgDashboard />} />
                <Route path="/org/enrollments" element={<OrgEnrollmentsPage />} />
                <Route path="/org/reports" element={<OrgReportsPage />} />

                {/* Shared routes */}
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              <Route path="/:hubSlug" element={<HubPortalPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
  </TooltipProvider>
);

export default App;
