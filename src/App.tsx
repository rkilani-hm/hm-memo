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
import NoAccess from "@/pages/NoAccess";
import ProtectedRoute from "@/components/ProtectedRoute";
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
                <Route path="/" element={<ProtectedRoute resourceKey="dashboard"><Dashboard /></ProtectedRoute>} />
                <Route path="/memos" element={<ProtectedRoute resourceKey="memos"><MemoList /></ProtectedRoute>} />
                <Route path="/memos/create" element={<ProtectedRoute resourceKey="memos/create"><MemoCreate /></ProtectedRoute>} />
                <Route path="/memos/:id/edit" element={<ProtectedRoute resourceKey="memos"><MemoEdit /></ProtectedRoute>} />
                <Route path="/memos/:id" element={<ProtectedRoute resourceKey="memos"><MemoView /></ProtectedRoute>} />
                <Route path="/approvals" element={<ProtectedRoute resourceKey="approvals"><PendingApprovals /></ProtectedRoute>} />
                <Route path="/finance/payments" element={<ProtectedRoute resourceKey="finance/payments" requiredRole="finance"><FinancePayments /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute resourceKey="settings"><Settings /></ProtectedRoute>} />
                <Route path="/help" element={<ProtectedRoute resourceKey="help"><HelpGuide /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute resourceKey="notifications"><Notifications /></ProtectedRoute>} />
                <Route path="/no-access" element={<NoAccess />} />
                <Route path="/admin/users" element={<ProtectedRoute resourceKey="admin/users" requiredRole="admin"><UserManagement /></ProtectedRoute>} />
                <Route path="/admin/departments" element={<ProtectedRoute resourceKey="admin/departments" requiredRole="admin"><DepartmentManagement /></ProtectedRoute>} />
                <Route path="/admin/workflows" element={<ProtectedRoute resourceKey="admin/workflows" requiredRole="admin"><WorkflowManagement /></ProtectedRoute>} />
                <Route path="/admin/delegates" element={<ProtectedRoute resourceKey="admin/delegates" requiredRole="admin"><DelegateManagement /></ProtectedRoute>} />
                <Route path="/admin/audit-log" element={<ProtectedRoute resourceKey="admin/audit-log" requiredRole="admin"><AuditLog /></ProtectedRoute>} />
                <Route path="/admin/audit-dashboard" element={<ProtectedRoute resourceKey="admin/audit-dashboard" requiredRole="admin"><AuditDashboard /></ProtectedRoute>} />
                <Route path="/admin/cross-dept-rules" element={<ProtectedRoute resourceKey="admin/cross-dept-rules" requiredRole="admin"><CrossDeptRules /></ProtectedRoute>} />
                <Route path="/admin/approval-performance" element={<ProtectedRoute resourceKey="admin/approval-performance" requiredRole="admin"><ApprovalPerformance /></ProtectedRoute>} />
                <Route path="/admin/reminder-settings" element={<ProtectedRoute resourceKey="admin/reminder-settings" requiredRole="admin"><ReminderSettings /></ProtectedRoute>} />
                <Route path="/admin/authorization" element={<ProtectedRoute resourceKey="admin/authorization" requiredRole="admin"><Authorization /></ProtectedRoute>} />
                <Route path="/admin/fraud-settings" element={<ProtectedRoute resourceKey="admin/fraud-settings" requiredRole="admin"><FraudSettings /></ProtectedRoute>} />
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
