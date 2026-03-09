

# Al Hamra Internal Memo & Approval Platform — Implementation Plan

## Design System
- **Primary**: Navy blue (#1B3A5C), **Accent**: Gold (#C8952E), **Background**: White with light gray accents
- **Font**: Century Gothic (with fallbacks)
- Clean, corporate look matching existing paper memo format
- Responsive: desktop sidebar layout, mobile-friendly approval views

---

## Phase 1 — Core MVP

### Step 1: Database Schema & Auth Setup
- Enable Supabase Auth via Lovable Cloud
- Create tables: `departments`, `profiles` (linked to auth.users), `user_roles`, `memos`, `memo_attachments`, `approval_steps`, `workflow_templates`, `audit_log`, `notifications`
- Set up RLS policies using `has_role()` security definer function
- Create storage buckets for attachments and signatures
- Seed departments and sample users

### Step 2: Authentication & User Management
- Login page with email/password (Al Hamra branded)
- Admin panel to create/edit users with department, role, and job title
- Auto-logout after inactivity
- Profile settings page (foundation for signature management later)

### Step 3: Memo Creation Form
- Full transmittal format form matching the paper layout:
  - TO (user picker), FROM (auto-filled), DATE (auto-filled)
  - Auto-generated transmittal number (`HM/{DEPT}-IM/{SEQ}/{YEAR}`)
  - "Transmitted For" 3×3 checkbox grid
  - Subject field
  - Rich text description editor (TipTap) with table support
  - Continuation pages, initials, copies-to fields
- File attachment uploads (multi-file, up to 25MB each, stored in Supabase Storage)
- Save as Draft or Submit

### Step 4: Approval Workflow Engine
- Basic sequential approval routing based on memo type:
  - PAYMENTS → Dept Head → Finance → GM
  - ACTION → Dept Head → Recipient
  - REQUEST → Dept Head → Relevant Dept → GM
  - INFORMATION → Dept Head → Recipient (acknowledgment only)
- Password re-entry verification on Approve/Reject
- Mandatory rejection reason on Reject
- Rework flow: send back to creator with comments
- Only designated next approver can act
- All actions logged to audit trail

### Step 5: Memo List & Detail Views
- Filterable/searchable memo list (by department, status, date, type, creator)
- Individual memo detail view showing:
  - Full transmittal format display
  - Approval trail timeline with statuses
  - Comments thread for rework discussions
  - Attachment list with download
  - Status badge (Draft / Submitted / In Review / Approved / Rejected / Rework)

### Step 6: Dashboard
- Role-based dashboard showing:
  - Pending approvals (most prominent)
  - Submitted memos with statuses
  - Recent activity timeline
  - Stats: total memos this month, pending count, avg approval time

---

## Phase 2 — Enhanced Features

### Step 7: Signature Management
- Settings page for each user to:
  - Upload signature image (PNG/JPG)
  - Draw signature on canvas (react-signature-canvas)
  - Type name with signature font selection
  - Set default signature
- Signature stamped onto memo on approval (after password verification)
- Signatures are timestamped and immutable

### Step 8: PDF Generation
- Print/export generates a PDF matching the paper memo format exactly:
  - Company logo, table header, checkbox grid, description with tables
  - Signature images overlaid in approval section
  - Footer with page count, attachment count, initials, copies-to

### Step 9: Admin Workflow Configuration
- Admin UI to configure approval chains per department and memo type
- Parallel vs. sequential steps
- Required vs. optional approvers
- Escalation rules (auto-escalate after X days)

### Step 10: Mobile-Responsive Design
- Tablet: adapted memo review layout
- Mobile: streamlined approval view, memo details, basic creation
- Biometric auth option (WebAuthn) for mobile approval confirmation

### Step 11: Email Notifications (when ready)
- Edge function to send emails on: submit, approve, reject, rework, reminders
- Emails include memo number, subject, preview, and direct link
- Configurable reminder intervals

---

## Sample Data
- 5 seeded users across ICT, Finance, and General Management
- 4 sample memos matching the described examples (memos 0027–0031)

