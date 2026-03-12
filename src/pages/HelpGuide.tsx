import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  LogIn,
  LayoutDashboard,
  FilePlus,
  CheckSquare,
  ClipboardEdit,
  FileText,
  Printer,
  Settings,
  ShieldCheck,
  Users,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const sections = [
  {
    id: "login",
    icon: LogIn,
    title: "Logging In",
    content: (
      <div className="space-y-2 text-sm">
        <p>Open the platform URL in your browser. Enter your <strong>email</strong> and <strong>password</strong> provided by your administrator, then click <strong>Sign In</strong>.</p>
        <p className="text-muted-foreground">Your session automatically expires after 30 minutes of inactivity for security.</p>
      </div>
    ),
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard Overview",
    content: (
      <div className="space-y-2 text-sm">
        <p>The Dashboard provides a summary of your memo activity:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Total Memos</strong> — count of all memos you created</li>
          <li><strong>Pending Approvals</strong> — memos awaiting your action</li>
          <li><strong>Approved / Rejected</strong> — final status counts</li>
        </ul>
      </div>
    ),
  },
  {
    id: "create-memo",
    icon: FilePlus,
    title: "Creating a Memo",
    content: (
      <div className="space-y-3 text-sm">
        <p>Navigate to <strong>New Memo</strong> from the sidebar.</p>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Step 1: Fill in Details</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Subject</strong> — brief title of the memo</li>
            <li><strong>Memo Types</strong> — select one or more (Action, Announcement, Payment, etc.)</li>
            <li><strong>To</strong> — recipient of the memo</li>
            <li><strong>Description</strong> — rich-text body with formatting, tables, and lists</li>
            <li><strong>Copies To</strong> — additional recipients (CC)</li>
            <li><strong>Transmitted For</strong> — check applicable action boxes</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Step 2: Attachments</h4>
          <p>Click <strong>Upload Files</strong> to attach supporting documents. Multiple files are supported.</p>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Step 3: Workflow</h4>
          <p>Add approval steps by selecting approvers and their action type (Approve or Initial). Drag to reorder. Use parallel groups for simultaneous approvals.</p>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Step 4: Save or Submit</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Save as Draft</strong> — saves without starting the workflow</li>
            <li><strong>Submit</strong> — locks the memo and sends it to the first approver</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "approve-memo",
    icon: CheckSquare,
    title: "Approving a Memo",
    content: (
      <div className="space-y-2 text-sm">
        <p>Go to <strong>Pending Approvals</strong> and click on a memo to review it.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Approve</strong> — sign digitally (draw, type, or upload) and confirm with your password</li>
          <li><strong>Reject</strong> — provide a reason; the memo returns to the creator</li>
          <li><strong>Rework</strong> — request changes; the creator can edit and resubmit</li>
        </ul>
        <p className="text-muted-foreground">Each action is logged in the audit trail with timestamp, device, and IP address.</p>
      </div>
    ),
  },
  {
    id: "manual-registration",
    icon: ClipboardEdit,
    title: "Manual Registration",
    badge: "Admin",
    content: (
      <div className="space-y-2 text-sm">
        <p>For approvers who signed a physical copy, an admin can register their approval manually:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Enter the date of physical signing</li>
          <li>Upload a scanned copy of the signed page</li>
          <li>Add registration notes</li>
          <li>The system records who registered the approval and when</li>
        </ul>
      </div>
    ),
  },
  {
    id: "memo-list",
    icon: FileText,
    title: "Viewing & Searching Memos",
    content: (
      <div className="space-y-2 text-sm">
        <p>The <strong>Memo List</strong> page shows all memos you have access to. Use filters to search by status, department, date range, or keyword.</p>
        <p>Click any memo to view its full details, workflow status, and audit trail.</p>
      </div>
    ),
  },
  {
    id: "printing",
    icon: Printer,
    title: "Printing a Memo",
    content: (
      <div className="space-y-2 text-sm">
        <p>Open a memo and click <strong>Print</strong>. Configure options:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Color mode (color / grayscale)</li>
          <li>Duplex printing</li>
          <li>Watermark</li>
          <li>Page numbers</li>
          <li>Confidentiality line</li>
        </ul>
        <p className="text-muted-foreground">The print preview matches the official Al Hamra memo format.</p>
      </div>
    ),
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings",
    content: (
      <div className="space-y-2 text-sm">
        <p>Access from the top-right menu or sidebar:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Profile</strong> — update your name, job title, initials</li>
          <li><strong>Signature</strong> — upload or draw your digital signature</li>
          <li><strong>Print Preferences</strong> — default print settings</li>
          <li><strong>Change Password</strong> — update your login password</li>
        </ul>
      </div>
    ),
  },
  {
    id: "admin",
    icon: ShieldCheck,
    title: "Administration",
    badge: "Admin",
    content: (
      <div className="space-y-2 text-sm">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>User Management</strong> — create, edit, activate/deactivate users</li>
          <li><strong>Department Management</strong> — manage departments and heads</li>
          <li><strong>Workflow Templates</strong> — create reusable approval workflows</li>
          <li><strong>Delegate Management</strong> — assign delegates for absent approvers</li>
          <li><strong>Cross-Dept Rules</strong> — configure memo visibility across departments</li>
          <li><strong>Audit Log</strong> — view all system activity with full device/IP details</li>
        </ul>
      </div>
    ),
  },
  {
    id: "roles",
    icon: Users,
    title: "User Roles",
    content: (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {[
            ["Admin", "Full access: manage users, departments, workflows, audit logs"],
            ["Dept Head", "Create memos, approve within department, view department memos"],
            ["Approver", "Review and approve/reject assigned memos"],
            ["Staff", "Create and track own memos"],
          ].map(([role, desc]) => (
            <div key={role} className="contents">
              <Badge variant="outline" className="h-fit">{role}</Badge>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const HelpGuide = () => {
  const { hasRole } = useAuth();

  const visibleSections = sections.filter(
    (s) => !s.badge || (s.badge === "Admin" && hasRole("admin"))
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <HelpCircle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help & Guide</h1>
          <p className="text-sm text-muted-foreground">Learn how to use the HM Memo Platform</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" className="w-full">
            {visibleSections.map((section) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <section.icon className="h-4 w-4 text-primary shrink-0" />
                    <span>{section.title}</span>
                    {section.badge && (
                      <Badge variant="secondary" className="text-xs">{section.badge}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  {section.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpGuide;
