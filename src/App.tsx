import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MemoCreate from "@/pages/MemoCreate";
import MemoEdit from "@/pages/MemoEdit";
import MemoList from "@/pages/MemoList";
import MemoView from "@/pages/MemoView";
import PendingApprovals from "@/pages/PendingApprovals";
import DepartmentManagement from "@/pages/admin/DepartmentManagement";
import UserManagement from "@/pages/admin/UserManagement";
import WorkflowManagement from "@/pages/admin/WorkflowManagement";
import DelegateManagement from "@/pages/admin/DelegateManagement";
import AuditLog from "@/pages/admin/AuditLog";
import AuditDashboard from "@/pages/admin/AuditDashboard";
import CrossDeptRules from "@/pages/admin/CrossDeptRules";
import Settings from "@/pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/memos" element={<MemoList />} />
              <Route path="/memos/create" element={<MemoCreate />} />
              <Route path="/memos/:id" element={<MemoView />} />
              <Route path="/approvals" element={<PendingApprovals />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/departments" element={<DepartmentManagement />} />
              <Route path="/admin/workflows" element={<WorkflowManagement />} />
              <Route path="/admin/delegates" element={<DelegateManagement />} />
              <Route path="/admin/audit-log" element={<AuditLog />} />
              <Route path="/admin/audit-dashboard" element={<AuditDashboard />} />
              <Route path="/admin/cross-dept-rules" element={<CrossDeptRules />} />
              <Route path="/admin/audit-dashboard" element={<AuditDashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
