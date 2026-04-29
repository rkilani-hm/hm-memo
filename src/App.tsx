import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import GeoGate from "@/components/GeoGate";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ForcePasswordReset from "@/pages/ForcePasswordReset";
import Dashboard from "@/pages/Dashboard";
import MemoCreate from "@/pages/MemoCreate";
import MemoEdit from "@/pages/MemoEdit";
import MemoList from "@/pages/MemoList";
import MemoView from "@/pages/MemoView";
import PendingApprovals from "@/pages/PendingApprovals";
import FinancePayments from "@/pages/finance/Payments";
import DepartmentManagement from "@/pages/admin/DepartmentManagement";
import UserManagement from "@/pages/admin/UserManagement";
import WorkflowManagement from "@/pages/admin/WorkflowManagement";
import DelegateManagement from "@/pages/admin/DelegateManagement";
import AuditLog from "@/pages/admin/AuditLog";
import AuditDashboard from "@/pages/admin/AuditDashboard";
import CrossDeptRules from "@/pages/admin/CrossDeptRules";
import ApprovalPerformance from "@/pages/admin/ApprovalPerformance";
import ReminderSettings from "@/pages/admin/ReminderSettings";
import Authorization from "@/pages/admin/Authorization";
import FraudSettings from "@/pages/admin/FraudSettings";
import PermissionAudit from "@/pages/admin/PermissionAudit";
import WorkflowPreview from "@/pages/admin/WorkflowPreview";
import NoAccess from "@/pages/NoAccess";
import ProtectedRoute from "@/components/ProtectedRoute";
import { routeGuard } from "@/lib/route-access-rules";
import Settings from "@/pages/Settings";
import HelpGuide from "@/pages/HelpGuide";
import Notifications from "@/pages/Notifications";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GeoGate>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/force-password-reset" element={<ForcePasswordReset />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<ProtectedRoute {...routeGuard("/")}><Dashboard /></ProtectedRoute>} />
                <Route path="/memos" element={<ProtectedRoute {...routeGuard("/memos")}><MemoList /></ProtectedRoute>} />
                <Route path="/memos/create" element={<ProtectedRoute {...routeGuard("/memos/create")}><MemoCreate /></ProtectedRoute>} />
                <Route path="/memos/:id/edit" element={<ProtectedRoute {...routeGuard("/memos/:id/edit")}><MemoEdit /></ProtectedRoute>} />
                <Route path="/memos/:id" element={<ProtectedRoute {...routeGuard("/memos/:id")}><MemoView /></ProtectedRoute>} />
                <Route path="/approvals" element={<ProtectedRoute {...routeGuard("/approvals")}><PendingApprovals /></ProtectedRoute>} />
                <Route path="/finance/payments" element={<ProtectedRoute {...routeGuard("/finance/payments")}><FinancePayments /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute {...routeGuard("/settings")}><Settings /></ProtectedRoute>} />
                <Route path="/help" element={<ProtectedRoute {...routeGuard("/help")}><HelpGuide /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute {...routeGuard("/notifications")}><Notifications /></ProtectedRoute>} />
                <Route path="/no-access" element={<NoAccess />} />
                <Route path="/admin/users" element={<ProtectedRoute {...routeGuard("/admin/users")}><UserManagement /></ProtectedRoute>} />
                <Route path="/admin/departments" element={<ProtectedRoute {...routeGuard("/admin/departments")}><DepartmentManagement /></ProtectedRoute>} />
                <Route path="/admin/workflows" element={<ProtectedRoute {...routeGuard("/admin/workflows")}><WorkflowManagement /></ProtectedRoute>} />
                <Route path="/admin/delegates" element={<ProtectedRoute {...routeGuard("/admin/delegates")}><DelegateManagement /></ProtectedRoute>} />
                <Route path="/admin/audit-log" element={<ProtectedRoute {...routeGuard("/admin/audit-log")}><AuditLog /></ProtectedRoute>} />
                <Route path="/admin/audit-dashboard" element={<ProtectedRoute {...routeGuard("/admin/audit-dashboard")}><AuditDashboard /></ProtectedRoute>} />
                <Route path="/admin/cross-dept-rules" element={<ProtectedRoute {...routeGuard("/admin/cross-dept-rules")}><CrossDeptRules /></ProtectedRoute>} />
                <Route path="/admin/approval-performance" element={<ProtectedRoute {...routeGuard("/admin/approval-performance")}><ApprovalPerformance /></ProtectedRoute>} />
                <Route path="/admin/reminder-settings" element={<ProtectedRoute {...routeGuard("/admin/reminder-settings")}><ReminderSettings /></ProtectedRoute>} />
                <Route path="/admin/authorization" element={<ProtectedRoute {...routeGuard("/admin/authorization")}><Authorization /></ProtectedRoute>} />
                <Route path="/admin/fraud-settings" element={<ProtectedRoute {...routeGuard("/admin/fraud-settings")}><FraudSettings /></ProtectedRoute>} />
                <Route path="/admin/permission-audit" element={<ProtectedRoute {...routeGuard("/admin/permission-audit")}><PermissionAudit /></ProtectedRoute>} />
                <Route path="/admin/workflow-preview" element={<ProtectedRoute {...routeGuard("/admin/workflow-preview")}><WorkflowPreview /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </GeoGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
