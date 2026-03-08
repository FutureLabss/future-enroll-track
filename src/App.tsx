import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import EnrollmentsPage from "@/pages/admin/EnrollmentsPage";
import InvoicesPage from "@/pages/admin/InvoicesPage";
import InvoiceDetailPage from "@/pages/admin/InvoiceDetailPage";
import CreateInvoicePage from "@/pages/admin/CreateInvoicePage";
import PaymentsPage from "@/pages/admin/PaymentsPage";
import ProgramsPage from "@/pages/admin/ProgramsPage";
import CohortsPage from "@/pages/admin/CohortsPage";
import OrganizationsPage from "@/pages/admin/OrganizationsPage";
import CustomFieldsPage from "@/pages/admin/CustomFieldsPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import ReportsPage from "@/pages/admin/ReportsPage";
import StudentDashboard from "@/pages/student/StudentDashboard";
import StudentInvoicesPage from "@/pages/student/StudentInvoicesPage";
import StudentPaymentsPage from "@/pages/student/StudentPaymentsPage";
import OrgDashboard from "@/pages/org/OrgDashboard";
import OrgEnrollmentsPage from "@/pages/org/OrgEnrollmentsPage";
import OrgReportsPage from "@/pages/org/OrgReportsPage";
import EnrollPage from "@/pages/public/EnrollPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRedirect() {
  const { isAdmin, isOrganization, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isOrganization) return <Navigate to="/org" replace />;
  return <Navigate to="/student" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/enroll" element={<EnrollPage />} />
            <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
            
            {/* Admin routes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
              <Route path="/admin/invoices" element={<InvoicesPage />} />
              <Route path="/admin/invoices/new" element={<CreateInvoicePage />} />
              <Route path="/admin/payments" element={<PaymentsPage />} />
              <Route path="/admin/programs" element={<ProgramsPage />} />
              <Route path="/admin/cohorts" element={<CohortsPage />} />
              <Route path="/admin/organizations" element={<OrganizationsPage />} />
              <Route path="/admin/custom-fields" element={<CustomFieldsPage />} />
              <Route path="/admin/notifications" element={<NotificationsPage />} />
              <Route path="/admin/reports" element={<ReportsPage />} />
              
              {/* Student routes */}
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/invoices" element={<StudentInvoicesPage />} />
              <Route path="/student/payments" element={<StudentPaymentsPage />} />
              
              {/* Org routes */}
              <Route path="/org" element={<OrgDashboard />} />
              <Route path="/org/enrollments" element={<OrgEnrollmentsPage />} />
              <Route path="/org/reports" element={<OrgReportsPage />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
