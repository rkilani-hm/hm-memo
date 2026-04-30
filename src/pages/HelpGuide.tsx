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
  Workflow,
  Bell,
  GitBranch,
  Receipt,
  Building2,
  Send,
  AlertTriangle,
  Search,
  Shield,
  Mail,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// =====================================================================
// Help Guide
// =====================================================================
//
// The Help & User Manual page is a single-route accordion documenting
// every user-facing function of the Internal Memo System, including
// end-to-end scenarios for the most common workflows.
//
// Maintenance notes for future edits:
//   - Each top-level section is a single AccordionItem keyed by id.
//   - Admin-only sections set `badge: "Admin"` so non-admins don't see
//     them (filtered in the component below via hasRole('admin')).
//   - Scenario timelines use the <ScenarioStep /> helper for visual
//     rhythm. Edit them as the workflow evolves — they're the single
//     source of truth users will reference.
//   - Keep language plain. This is a reference, not a marketing doc.
// =====================================================================

// Reusable building block for scenario step timelines
type ScenarioStepProps = {
  num: number | string;
  who: string;
  title: string;
  children: React.ReactNode;
};
const ScenarioStep = ({ num, who, title, children }: ScenarioStepProps) => (
  <div className="flex gap-3 pb-4 border-b border-border last:border-b-0 last:pb-0">
    <div className="shrink-0">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {num}
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-0.5">{who}</p>
      <p className="font-semibold text-foreground mb-1">{title}</p>
      <div className="text-sm text-muted-foreground space-y-1">{children}</div>
    </div>
  </div>
);

// Inline tip / callout box
const Callout = ({ tone = "info", children }: { tone?: "info" | "warning"; children: React.ReactNode }) => {
  const palette = tone === "warning"
    ? "bg-warning/10 border-warning/40 text-foreground"
    : "bg-primary/5 border-primary/30 text-foreground";
  return (
    <div className={`mt-2 mb-2 px-3 py-2 border-l-4 rounded-r text-sm ${palette}`}>
      {children}
    </div>
  );
};

const sections = [
  // -------------------------------------------------------------------
  // 1. SIGNING IN
  // -------------------------------------------------------------------
  {
    id: "login",
    icon: LogIn,
    title: "Signing In",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Open <strong>im.alhamra.com.kw</strong> in any modern browser — desktop or mobile.
          Sign in with the email and password your administrator provided.
        </p>
        <div>
          <p className="font-semibold text-foreground mb-1">First time signing in?</p>
          <p>
            You will be asked to set a new password. Choose something memorable but secure
            (at least 8 characters with a mix of letters, numbers, and symbols).
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Approval signatures use Microsoft Entra MFA</p>
          <p>
            Logging in is a regular email + password flow. However, every time you actually
            sign or approve a memo, the system asks Microsoft Entra to confirm it&rsquo;s really
            you &mdash; usually via a tap in the Microsoft Authenticator app. This protects your
            signature from being used by anyone else, even if they got into your session.
          </p>
        </div>
        <Callout>
          Sessions automatically expire after a period of inactivity. If you come back to
          the tab and it asks you to sign in again, that&rsquo;s normal &mdash; it&rsquo;s a security measure.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 2. DASHBOARD & NAVIGATION
  // -------------------------------------------------------------------
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard & Navigation",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          The Dashboard is your starting point. It shows everything that needs your
          attention &mdash; memos waiting on you, recent activity, and quick statistics.
        </p>
        <div>
          <p className="font-semibold text-foreground mb-1">Key tiles</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Pending Approvals</strong> &mdash; memos waiting on your action.</li>
            <li><strong>My Memos</strong> &mdash; memos you created (drafts, in-progress, completed).</li>
            <li><strong>Recently Approved</strong> &mdash; memos you participated in that have completed.</li>
            <li><strong>Notifications</strong> &mdash; system messages and reminders.</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Sidebar</p>
          <p>
            The sidebar groups every page by purpose: <em>My Work</em> (your memos and
            approvals), <em>Browse</em> (find any memo you have access to), and (for admins)
            <em>Administration</em> (user management, workflow templates, audit logs, etc.).
          </p>
        </div>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 3. CREATING A MEMO
  // -------------------------------------------------------------------
  {
    id: "create-memo",
    icon: FilePlus,
    title: "Creating a Memo",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Click <strong>Create New Memo</strong> from the Dashboard or sidebar.
          The form is divided into clear sections; fill them in top to bottom.
        </p>

        <div>
          <p className="font-semibold text-foreground mb-1">Basics</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>From</strong> &mdash; who the memo is from. Defaults to you. Executive assistants can pick a manager here to create memos on the manager&rsquo;s behalf.</li>
            <li><strong>To</strong> &mdash; primary recipient.</li>
            <li><strong>Subject</strong> &mdash; short, specific. Easier to search later.</li>
            <li><strong>Memo type</strong> &mdash; tick what applies (e.g. Payment, Action, Information). The system uses this to suggest the right approval workflow.</li>
            <li><strong>Description</strong> &mdash; the body of the memo. Rich text with bold, lists, tables, and links.</li>
            <li><strong>Copies To</strong> &mdash; additional people who should see the memo (CC).</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">Attachments</p>
          <p>
            Add any supporting documents &mdash; invoices, quotations, agreements, scanned forms,
            spreadsheets, photos. Each file can be up to 25 MB. Common formats supported:
            PDF, Word, Excel, images, ZIP archives.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">Approval workflow</p>
          <p>
            This is the chain of approvers the memo will travel through. You have three options:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Pick a preset workflow</strong> &mdash; admins maintain templates for common
              memo types (e.g. &ldquo;ICT For GM Approval&rdquo;, &ldquo;Payment - Standard&rdquo;). One click and
              the chain is filled in.
            </li>
            <li>
              <strong>Build a dynamic workflow</strong> &mdash; pick approvers individually and
              place them in the right column of the signature grid. Best when no preset fits.
            </li>
            <li>
              <strong>Modify a preset</strong> &mdash; start from a preset and adjust as needed.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">Save or Submit</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Save as Draft</strong> &mdash; keep the memo private; you can edit it freely. Workflow does not start.</li>
            <li><strong>Submit</strong> &mdash; sends the memo to the first approver. After this point, you cannot edit content (only recall or request rework).</li>
          </ul>
        </div>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 4. APPROVING A MEMO
  // -------------------------------------------------------------------
  {
    id: "approve-memo",
    icon: CheckSquare,
    title: "Approving a Memo",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          When a memo needs your action, you&rsquo;ll get an email and see it in <strong>Pending
          Approvals</strong>. Click the row to open it.
        </p>

        <div>
          <p className="font-semibold text-foreground mb-1">Your options</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Approve</strong> &mdash; confirms your acceptance. Capture your signature
              by drawing it, typing, or using your stored signature. Confirm with Microsoft
              Entra MFA. The memo moves to the next approver automatically.
            </li>
            <li>
              <strong>Initial</strong> &mdash; for reviewer-only steps (typical in finance).
              Just your initials, no full signature. Confirms you&rsquo;ve reviewed.
            </li>
            <li>
              <strong>Reject</strong> &mdash; refuses the memo. Add a clear reason. The memo
              ends and the creator is notified.
            </li>
            <li>
              <strong>Rework</strong> &mdash; sends the memo back to the creator for changes.
              Add specific instructions; the creator can edit and resubmit.
            </li>
          </ul>
        </div>

        <Callout>
          Add comments on every Reject or Rework. Without context, the creator has to
          guess what you wanted changed.
        </Callout>

        <p className="text-muted-foreground">
          Every action is logged in the audit trail with timestamp, device, and IP address.
        </p>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 5. FINANCE DISPATCH
  // -------------------------------------------------------------------
  {
    id: "finance-dispatch",
    icon: GitBranch,
    title: "The Finance Dispatch Flow",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Payment memos use a special faster path through finance. Instead of approvers
          signing one after another, the Finance Asst. Manager (the dispatcher) decides
          which reviewers actually need to look at the memo, and dispatches it to all of
          them at the same time.
        </p>

        <div>
          <p className="font-semibold text-foreground mb-1">If you&rsquo;re the Finance Asst. Manager</p>
          <p>
            When a payment memo reaches you, you won&rsquo;t see a normal &ldquo;Approve&rdquo; button.
            You&rsquo;ll see <strong>Dispatch Reviewers</strong>. Tap it to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pick AP, AR, and/or Budget reviewers &mdash; any combination.</li>
            <li>Or approve directly with no reviewers (for memos that don&rsquo;t need review).</li>
            <li>Add an optional note explaining what to check.</li>
          </ul>
          <p className="mt-2">
            Reviewers receive notifications and initial in parallel. Once they&rsquo;re all done,
            the memo returns to you for sign-off, then continues up the chain to the
            Finance Manager.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">If you&rsquo;re a reviewer (AP / AR / Budget)</p>
          <p>
            You&rsquo;ll see the memo appear in <strong>Pending Approvals</strong>. Open it,
            review the relevant section (the dispatcher&rsquo;s note tells you what to focus on),
            and add your <strong>Initial</strong>. Other reviewers don&rsquo;t have to wait for
            you &mdash; everyone works in parallel.
          </p>
        </div>

        <Callout>
          Self-approval is allowed: if the dispatcher decides no reviewers are needed,
          they sign the memo directly and it continues. This is the standard path for
          small payments or memos already verified by other means.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 6. SCENARIO: PAYMENT MEMO
  // -------------------------------------------------------------------
  {
    id: "scenario-payment",
    icon: Receipt,
    title: "Scenario: Pay a Vendor (Payment Memo)",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          The most common payment memo: from creation through finance approvals to
          actual payment release. Here&rsquo;s exactly how it works.
        </p>

        <div className="space-y-4 mt-2">
          <ScenarioStep num={1} who="You (creator)" title="Create the payment memo">
            <p>From the Dashboard, click <strong>Create New Memo</strong>.</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Pick yourself or your manager as <em>From</em>.</li>
              <li>Set <em>To</em> to the appropriate addressee (typically the GM or Finance Manager).</li>
              <li>Enter a clear subject (&ldquo;Payment to Vendor X &mdash; Invoice #123&rdquo;).</li>
              <li>Tick <strong>Payment</strong> as the memo type.</li>
              <li>Write the body: vendor name, amount, what the payment is for, reference numbers.</li>
              <li>Attach the invoice, quotation, delivery note, and any supporting documents.</li>
              <li>Pick a payment workflow preset (e.g. &ldquo;Payment - Standard&rdquo;) or build the chain.</li>
            </ul>
            <p>Click <strong>Submit</strong>.</p>
          </ScenarioStep>

          <ScenarioStep num={2} who="Department Head" title="Approves the request">
            <p>
              The first approver &mdash; usually your department head &mdash; receives an email and
              opens the memo. They review and click <strong>Approve</strong>, signing
              with their MFA-verified signature. The memo moves on automatically.
            </p>
          </ScenarioStep>

          <ScenarioStep num={3} who="Finance Asst. Manager" title="Decides on reviewers">
            <p>
              Mohammed (Finance Asst. Manager) receives the memo. Instead of &ldquo;Approve&rdquo;,
              he sees <strong>Dispatch Reviewers</strong>. He picks the reviewers needed:
              AP for invoice verification, Budget Controller if budget approval is needed,
              etc. &mdash; or he approves directly if no review is needed.
            </p>
          </ScenarioStep>

          <ScenarioStep num={4} who="Reviewers" title="Initial in parallel">
            <p>
              Each picked reviewer (AP, AR, Budget Controller as applicable) gets an
              email. They open the memo, verify their part, and click <strong>Initial</strong>.
              They can do this in any order &mdash; no one waits for anyone else.
            </p>
          </ScenarioStep>

          <ScenarioStep num={5} who="Finance Asst. Manager" title="Signs off">
            <p>
              Once all reviewers are done, the memo returns to Mohammed for his sign-off.
              He confirms the reviewers&rsquo; work and signs.
            </p>
          </ScenarioStep>

          <ScenarioStep num={6} who="Finance Manager" title="Final approval">
            <p>
              Hassan (Finance Manager) reviews and signs as the final authority on the
              finance side.
            </p>
          </ScenarioStep>

          <ScenarioStep num={7} who="GM / CEO (if required)" title="Senior approval">
            <p>
              If the workflow includes the General Manager and/or CEO/Chairman, they
              approve in sequence after finance.
            </p>
          </ScenarioStep>

          <ScenarioStep num={8} who="System" title="Memo fully approved — you're notified">
            <p>
              You receive an email titled <em>&ldquo;Action Required: Submit Originals to Finance.&rdquo;</em>
              The memo is now fully approved digitally, but Finance needs the physical
              paper trail before payment is released.
            </p>
          </ScenarioStep>

          <ScenarioStep num={9} who="You (creator)" title="Submit physical originals">
            <p>
              Print the memo cover sheet (button in the email or the memo page),
              attach the original invoice and any other physical supporting documents,
              and hand the bundle to <strong>Finance Reception</strong>.
            </p>
          </ScenarioStep>

          <ScenarioStep num={10} who="Finance Reception" title="Confirms originals received">
            <p>
              Finance Reception verifies the documents match the memo, stamps the cover
              sheet, and marks <em>Originals Received</em> in the system. You receive an
              email confirmation.
            </p>
          </ScenarioStep>

          <ScenarioStep num={11} who="Finance" title="Payment released">
            <p>
              Finance processes the payment to the vendor. When the payment is released,
              the memo is marked <strong>Payment Released</strong> and you receive a
              final notification email. The memo is now fully closed.
            </p>
          </ScenarioStep>
        </div>

        <Callout tone="warning">
          Payment will not be released until the original physical documents are received
          by Finance Reception. Don&rsquo;t skip step 9, no matter how urgent.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 7. SCENARIO: ON-BEHALF
  // -------------------------------------------------------------------
  {
    id: "scenario-on-behalf",
    icon: Send,
    title: "Scenario: Create a Memo on Behalf of Your Manager",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Executive assistants frequently prepare memos for the managers they support.
          The system supports this directly without losing attribution.
        </p>

        <div className="space-y-4 mt-2">
          <ScenarioStep num={1} who="You (assistant)" title="Open Create New Memo">
            <p>From your Dashboard, click <strong>Create New Memo</strong> as you normally would.</p>
          </ScenarioStep>

          <ScenarioStep num={2} who="You (assistant)" title="Set From to your manager">
            <p>
              In the <strong>From</strong> field, search for and pick your manager&rsquo;s name
              instead of yours. (You&rsquo;ll only see this option if your account has been
              given the right to create on behalf of others.)
            </p>
          </ScenarioStep>

          <ScenarioStep num={3} who="You (assistant)" title="Fill in and submit">
            <p>
              Fill in the rest of the memo and submit. The memo will show your manager
              as the author, but the audit log records that you created it. This is for
              transparency, not blame &mdash; it just keeps a clear record.
            </p>
          </ScenarioStep>

          <ScenarioStep num={4} who="System" title="Notifications respect attribution">
            <p>
              All approval emails go to the right people, and the memo&rsquo;s audit history
              shows both your manager (as author) and you (as the creator who acted on
              their behalf).
            </p>
          </ScenarioStep>
        </div>

        <Callout>
          The author cannot be set to a person whose role doesn&rsquo;t allow it (e.g. you
          can&rsquo;t create on behalf of a different department&rsquo;s GM). Permissions are
          checked at submission time.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 8. SCENARIO: REWORK
  // -------------------------------------------------------------------
  {
    id: "scenario-rework",
    icon: AlertTriangle,
    title: "Scenario: Memo Returned for Rework",
    content: (
      <div className="space-y-3 text-sm">
        <p>An approver requested changes. Here&rsquo;s what to do.</p>

        <div className="space-y-4 mt-2">
          <ScenarioStep num={1} who="You (creator)" title="Receive the rework notification">
            <p>
              You get an email saying the memo was returned for rework. The email includes
              the approver&rsquo;s comments explaining what to change.
            </p>
          </ScenarioStep>

          <ScenarioStep num={2} who="You (creator)" title="Edit the memo">
            <p>
              Open the memo. It will be in <strong>Rework</strong> status. Click
              <strong> Edit</strong>. The original content is preserved &mdash; make only the
              changes the approver asked for.
            </p>
          </ScenarioStep>

          <ScenarioStep num={3} who="You (creator)" title="Resubmit">
            <p>
              Click <strong>Resubmit</strong>. The memo restarts from the approver who
              requested rework &mdash; earlier approvers don&rsquo;t have to re-approve. Their
              previous signatures are preserved.
            </p>
          </ScenarioStep>
        </div>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 9. SCENARIO: RECALL
  // -------------------------------------------------------------------
  {
    id: "scenario-recall",
    icon: Workflow,
    title: "Scenario: Recall a Memo",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Submitted a memo by mistake, or realised something is wrong before any approver
          has acted? You can recall it.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Open the memo and click <strong>Recall</strong>.</li>
          <li>You can recall a memo only if no approver has signed yet.</li>
          <li>The memo returns to draft status and you can edit it freely.</li>
          <li>Anyone notified about the original submission gets a recall notice.</li>
        </ul>
        <Callout tone="warning">
          Once any approver has signed, recall is no longer available. Use rework via an
          approver instead, or &mdash; in extreme cases &mdash; reject and create a new memo.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 10. NOTIFICATIONS
  // -------------------------------------------------------------------
  {
    id: "notifications",
    icon: Bell,
    title: "Notifications & Reminders",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          The system keeps you informed via email and in-app notifications. You don&rsquo;t have
          to constantly check the Dashboard &mdash; let the system tell you.
        </p>
        <div>
          <p className="font-semibold text-foreground mb-1">When you&rsquo;ll get an email</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A memo needs your approval (immediate).</li>
            <li>Your memo was approved, rejected, or returned for rework.</li>
            <li>Reminder if you haven&rsquo;t acted on a pending memo for over a day.</li>
            <li>For payment memos: when fully approved (asking you to bring originals), when originals are received, and when payment is released.</li>
            <li>Admin actions affecting you (e.g. an admin deleted one of your memos with reason).</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">In-app notifications</p>
          <p>
            The bell icon in the top bar shows recent notifications. Unread items are
            highlighted; click to mark as read or jump to the relevant memo.
          </p>
        </div>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 11. SEARCH & TRACKING
  // -------------------------------------------------------------------
  {
    id: "search-track",
    icon: Search,
    title: "Searching & Tracking Memos",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          The <strong>Memo List</strong> page shows every memo you have access to.
          Use it to find old memos and track in-progress ones.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Search by</strong> transmittal number, subject, or sender name.</li>
          <li><strong>Filter by</strong> status (Draft, Submitted, In Review, Approved, Rejected, Rework), department, memo type, or date range.</li>
          <li><strong>Click any row</strong> to open the memo and see its full workflow status, audit trail, and attachments.</li>
        </ul>
        <p>
          The <strong>Approval Workflow Status</strong> panel inside each memo shows a
          checklist of who has signed, who&rsquo;s pending, and who&rsquo;s still to come &mdash; the
          quickest way to see exactly where a memo stands.
        </p>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 12. PRINTING
  // -------------------------------------------------------------------
  {
    id: "print-export",
    icon: Printer,
    title: "Printing & Exporting to PDF",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Open any memo and click <strong>Print / Export PDF</strong>. The output is
          formatted with the company letterhead, signature grid, and full attachments
          list &mdash; ready to print or share.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Approval signatures appear in their proper columns (Finance, GM, CEO).</li>
          <li>Department Head&rsquo;s signature appears in the body of the memo.</li>
          <li>The transmittal number, date, and full audit trail are included.</li>
        </ul>
        <p className="text-muted-foreground">
          The same PDF is generated when Finance asks for the cover sheet during the
          payment originals process &mdash; print it from any device.
        </p>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 13. SETTINGS
  // -------------------------------------------------------------------
  {
    id: "settings",
    icon: Settings,
    title: "Settings & Profile",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Click your avatar in the top right and choose <strong>Settings</strong> to manage
          your personal account.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Profile</strong> &mdash; update your full name, initials, signature image, and contact info.</li>
          <li><strong>Password</strong> &mdash; change your password.</li>
          <li><strong>Delegation</strong> &mdash; set up a temporary delegate to handle your approvals during leave or travel. The delegate signs in their own name on your behalf, and the audit log records both.</li>
          <li><strong>Notification preferences</strong> &mdash; choose which events trigger email vs. in-app only.</li>
        </ul>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 14. ROLES & PERMISSIONS
  // -------------------------------------------------------------------
  {
    id: "roles",
    icon: Users,
    title: "Roles & Permissions",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          What you can do in the system depends on the roles assigned to your account.
          Roles are set by admins in User Management.
        </p>
        <div>
          <p className="font-semibold text-foreground mb-1">General roles</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Staff</strong> &mdash; can create memos, view memos they&rsquo;re part of.</li>
            <li><strong>Approver</strong> &mdash; can sign memos in approval chains.</li>
            <li><strong>Department Head</strong> &mdash; approves memos originating in their department.</li>
            <li><strong>Admin</strong> &mdash; manages users, workflows, settings, and the audit log.</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Finance signing roles</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Finance Manager</strong> &mdash; final finance authority.</li>
            <li><strong>Finance Dispatcher</strong> (Asst. Manager) &mdash; picks reviewers and signs off. Only one user holds this role at a time.</li>
            <li><strong>AP Accountant</strong> &mdash; initials on payments needing AP review.</li>
            <li><strong>AR Accountant</strong> &mdash; initials on receivables-related memos.</li>
            <li><strong>Budget Controller</strong> &mdash; initials on budget-related memos.</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Senior signing roles</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>General Manager</strong> &mdash; signs in the GM column. Multiple users can hold this role (e.g. directors who act in this capacity).</li>
            <li><strong>CEO / Chairman</strong> &mdash; signs in the top column. Multiple users can hold this role.</li>
          </ul>
        </div>
        <Callout>
          A single user can hold multiple roles. For example, a Finance Manager who also
          approves at GM level would have both the Finance Manager and General Manager roles.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 15. FAQ
  // -------------------------------------------------------------------
  {
    id: "faq",
    icon: HelpCircle,
    title: "FAQ & Troubleshooting",
    content: (
      <div className="space-y-3 text-sm">
        <div>
          <p className="font-semibold text-foreground mb-1">A memo I&rsquo;m waiting on isn&rsquo;t moving. Where is it?</p>
          <p>
            Open the memo and look at the <strong>Approval Workflow Status</strong> panel.
            The pending approver is highlighted. They&rsquo;ve been notified &mdash; if it&rsquo;s been more
            than 24 hours, they&rsquo;ll have received a reminder. You can mention the transmittal
            number when chasing them up.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">I rejected a memo by mistake.</p>
          <p>
            Rejected memos can&rsquo;t be un-rejected. The creator will need to make a new memo,
            ideally referencing the original. Sorry &mdash; design choice for audit integrity.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">My signature image is blurry on the PDF.</p>
          <p>
            Go to Settings &rarr; Profile and re-upload a higher-resolution signature image (PNG
            with transparent background works best, ideally 600 px wide or larger).
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">An approver is on leave. How do I keep things moving?</p>
          <p>
            They should set up a delegate in their own Settings before going on leave. If
            they didn&rsquo;t, an admin can reassign the pending step to a different approver.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Microsoft Entra MFA prompt failed when I tried to approve.</p>
          <p>
            Most often this means the Microsoft Authenticator app on your phone is offline
            or out of sync. Open the app, refresh, then try approving again. If it keeps
            failing, contact ICT.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">I can&rsquo;t see a memo someone says they sent me.</p>
          <p>
            Check the To and Copies To fields &mdash; the memo may have gone to a colleague with
            a similar name. Also check that you&rsquo;re looking at the right tab (Pending
            Approvals vs. All Memos).
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Need help we haven&rsquo;t covered?</p>
          <p>
            Contact ICT. Include the transmittal number and a screenshot if possible &mdash;
            it makes diagnosis much faster.
          </p>
        </div>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 16. ADMIN-ONLY: USER MANAGEMENT
  // -------------------------------------------------------------------
  {
    id: "admin-users",
    icon: ShieldCheck,
    title: "Managing Users (Admin)",
    badge: "Admin",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Admins manage user accounts in <strong>Administration &rarr; User Management</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add user</strong> &mdash; full name, email, department, job title, initial password.</li>
          <li><strong>Assign roles</strong> &mdash; tick the roles that apply. Roles control sidebar visibility, signing column placement, and feature access.</li>
          <li><strong>Force password reset</strong> &mdash; flags the user to set a new password on next login.</li>
          <li><strong>Edit signature image</strong> &mdash; replace a user&rsquo;s signature if needed (e.g. they uploaded a poor-quality scan).</li>
          <li><strong>Deactivate</strong> &mdash; disables a user without deleting their data. Their past memos and signatures remain intact.</li>
        </ul>
        <Callout tone="warning">
          The <strong>Finance Dispatcher</strong> role is unique &mdash; only one user can hold
          it at a time. To transfer it, remove it from the current holder before assigning
          to another user. The system will warn you if you try to violate this.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 17. ADMIN-ONLY: WORKFLOWS
  // -------------------------------------------------------------------
  {
    id: "admin-workflows",
    icon: Workflow,
    title: "Workflow Templates (Admin)",
    badge: "Admin",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Workflow templates (&ldquo;presets&rdquo;) let memo creators pick a pre-built approval chain
          with one click. Manage them in <strong>Administration &rarr; Workflow Management</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Each template has a name, description, and an ordered list of steps.</li>
          <li>Each step specifies the approver (or a role-based slot) and the action type (Approve / Initial / Dispatch).</li>
          <li>Templates can be tied to specific memo types or departments &mdash; e.g. &ldquo;Payment - Standard&rdquo; might appear only when the user picks Payment as a memo type.</li>
          <li>Use <strong>Workflow Preview</strong> to see exactly what chain a given template will produce for a given memo.</li>
        </ul>
        <p>
          Department-specific templates (e.g. &ldquo;ICT For GM Approval&rdquo;) can be admin-curated
          and made available only to that department.
        </p>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 18. ADMIN-ONLY: AUDIT
  // -------------------------------------------------------------------
  {
    id: "admin-audit",
    icon: Shield,
    title: "Audit Log (Admin)",
    badge: "Admin",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Every action &mdash; submissions, approvals, dispatches, rejections, reworks, manual
          registrations, admin overrides &mdash; is recorded in the audit log. Admins access
          it from <strong>Administration &rarr; Audit Log</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Filter by user, memo, date, action type, or authentication factor (MFA vs. password-only).</li>
          <li>Each row includes timestamp, IP address, device fingerprint, and the user&rsquo;s roles at the moment of the action.</li>
          <li>Export to CSV for compliance reviews or external audits.</li>
        </ul>
        <Callout>
          The audit log is append-only. Records cannot be edited or deleted, only exported
          and inspected.
        </Callout>
      </div>
    ),
  },

  // -------------------------------------------------------------------
  // 19. ADMIN-ONLY: MANUAL REGISTRATION
  // -------------------------------------------------------------------
  {
    id: "admin-manual",
    icon: ClipboardEdit,
    title: "Manual Registration (Admin)",
    badge: "Admin",
    content: (
      <div className="space-y-3 text-sm">
        <p>
          Sometimes an approver signs a physical printout instead of using the system.
          To keep the digital record consistent, an admin can register their approval
          manually.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Open the memo and find the pending step.</li>
          <li>Click <strong>Register Manually</strong> (admin-only button).</li>
          <li>Enter the date the approver actually signed.</li>
          <li>Upload a scanned copy of the signed page.</li>
          <li>Add a note explaining the circumstances.</li>
        </ul>
        <p>
          The manual registration is logged in the audit trail with both the original
          signer&rsquo;s name and the admin who registered it. The PDF will show a &ldquo;Manually
          Registered&rdquo; indicator on that signature.
        </p>
        <Callout tone="warning">
          Manual registration should be exceptional, not routine. Encourage approvers to
          use the system directly &mdash; every manual registration is a small audit risk.
        </Callout>
      </div>
    ),
  },
];

// =====================================================================
// Component
// =====================================================================

const HelpGuide = () => {
  const { hasRole } = useAuth();

  const visibleSections = sections.filter(
    (s) => !s.badge || (s.badge === "Admin" && hasRole("admin"))
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <HelpCircle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help &amp; User Manual</h1>
          <p className="text-sm text-muted-foreground">
            How to use the Internal Memo System &mdash; features, scenarios, and reference.
          </p>
        </div>
      </div>

      {/* Quick orientation panel */}
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            New to the system?
          </p>
          <p className="text-sm text-muted-foreground">
            Start with <strong>Signing In</strong> and <strong>Dashboard &amp; Navigation</strong>
            below. To learn how a specific real-world task works end-to-end, jump to one
            of the <strong>Scenario</strong> sections &mdash; they walk through every step from
            creating the memo to closure.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" className="w-full">
            {visibleSections.map((section) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <section.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium">{section.title}</span>
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

      <Card className="bg-muted/40 border-border">
        <CardContent className="p-4 space-y-1 text-sm">
          <p className="font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Still stuck?
          </p>
          <p className="text-muted-foreground">
            Contact ICT with the transmittal number and a screenshot of what you&rsquo;re seeing.
            That speeds diagnosis significantly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpGuide;
