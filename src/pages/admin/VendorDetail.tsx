import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchVendorById, fetchVendorTypes, fetchAttachmentsForVendor, fetchAuditLogForVendor,
  fetchRequirementsForType, invokeStatusTransition,
  setAttachmentHumanStatus, batchSendToVendor, sendSingleToVendor,
  postAttachmentMessage, fetchMessagesForAttachment,
  getAttachmentSignedUrl,
  HUMAN_STATUS_LABEL,
  STATUS_LABELS, statusBadgeVariant,
  type VendorAttachment, type AttachmentHumanStatus, type AttachmentMessage,
} from '@/lib/vendor-api';
import {
  ArrowLeft, Building2, CheckCircle2, XCircle, Loader2, ShieldAlert,
  FileText, Pencil, Trash2, RotateCcw, MessageSquare, Send, HelpCircle,
  Eye, Download,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const VendorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole('admin');

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [sapDialogOpen, setSapDialogOpen] = useState(false);
  const [sapForm, setSapForm] = useState({
    sap_vendor_code: '', sap_account_group: '',
    sap_company_code: '', sap_purchasing_organization: '',
  });
  const [acting, setActing] = useState(false);

  // Section edit dialog (admin only)
  const [editSection, setEditSection] = useState<SectionKey | null>(null);

  // Delete confirmation dialog (admin only)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => fetchVendorById(id!),
    enabled: !!id,
  });

  const { data: vendorTypes = [] } = useQuery({
    queryKey: ['vendor-types'], queryFn: fetchVendorTypes,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['vendor-attachments', id],
    queryFn: () => fetchAttachmentsForVendor(id!),
    enabled: !!id,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['vendor-requirements', vendor?.vendor_type_id],
    queryFn: () => fetchRequirementsForType(vendor!.vendor_type_id),
    enabled: !!vendor?.vendor_type_id,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ['vendor-audit', id],
    queryFn: () => fetchAuditLogForVendor(id!),
    enabled: !!id,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['vendor', id] });
    queryClient.invalidateQueries({ queryKey: ['vendor-attachments', id] });
    queryClient.invalidateQueries({ queryKey: ['vendor-audit', id] });
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
  };

  const doAction = async (action: string, payload?: any) => {
    if (!vendor) return;
    setActing(true);
    try {
      const r: any = await invokeStatusTransition({ vendor_id: vendor.id, action, payload });
      if (r.error) {
        toast({ title: 'Action failed', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: 'Done', description: `Vendor moved to ${STATUS_LABELS[r.status as any] || r.status}.` });
        // If the action succeeded but emails failed, warn the user.
        // Without this, send-email failures were silently swallowed.
        if (Array.isArray(r.email_failures) && r.email_failures.length > 0) {
          const summary = r.email_failures
            .map((f: any) => `• ${f.to}: ${f.error}`)
            .slice(0, 3)
            .join('\n');
          toast({
            title: `${r.email_failures.length} email(s) could NOT be sent`,
            description: `${summary}${r.email_failures.length > 3 ? '\n…and more' : ''}\n\nPlease contact the recipients manually. Check Supabase function logs for full details.`,
            variant: 'destructive',
          });
        }
        refresh();
      }
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!vendor) return;
    if (deleteConfirmName.trim() !== vendor.legal_name_en.trim()) {
      toast({
        title: 'Confirmation does not match',
        description: 'Please type the vendor\'s exact legal name to confirm.',
        variant: 'destructive',
      });
      return;
    }
    setActing(true);
    try {
      const { error } = await supabase
        .from('vendors' as any)
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
        .eq('id', vendor.id);
      if (error) throw error;

      // Deactivate any vendor portal users so they're locked out
      await supabase
        .from('vendor_users' as any)
        .update({ is_active: false } as any)
        .eq('vendor_id', vendor.id);

      // Audit log
      await supabase.from('vendor_audit_log' as any).insert({
        vendor_id: vendor.id,
        action: 'admin_deleted',
        actor_user_id: user?.id,
        actor_kind: 'staff',
        notes: 'Vendor soft-deleted by admin. Portal users deactivated.',
        metadata: { from_status: vendor.status },
      } as any);

      toast({ title: 'Deleted', description: `${vendor.legal_name_en} has been moved to deleted.` });
      setDeleteOpen(false);
      setDeleteConfirmName('');
      navigate('/admin/vendors');
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleRestore = async () => {
    if (!vendor) return;
    setActing(true);
    try {
      const { error } = await supabase
        .from('vendors' as any)
        .update({ deleted_at: null, deleted_by: null } as any)
        .eq('id', vendor.id);
      if (error) throw error;

      // Reactivate any portal users
      await supabase
        .from('vendor_users' as any)
        .update({ is_active: true } as any)
        .eq('vendor_id', vendor.id);

      await supabase.from('vendor_audit_log' as any).insert({
        vendor_id: vendor.id,
        action: 'admin_restored',
        actor_user_id: user?.id,
        actor_kind: 'staff',
        notes: 'Vendor restored from deleted state.',
      } as any);

      toast({ title: 'Restored', description: `${vendor.legal_name_en} is back to active.` });
      refresh();
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }
  if (!vendor) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground">Vendor not found.</p>
        <Button variant="outline" onClick={() => navigate('/admin/vendors')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
        </Button>
      </div>
    );
  }

  const vendorType = vendorTypes.find((t) => t.id === vendor.vendor_type_id);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/vendors')} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Vendors
      </Button>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {vendor.legal_name_en}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{vendor.vendor_reference_no}</span>
            <Badge variant={statusBadgeVariant(vendor.status) as any} className="text-xs">
              {STATUS_LABELS[vendor.status]}
            </Badge>
            {vendorType && (
              <Badge variant="outline" className="text-xs">{vendorType.label_en}</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col md:items-end gap-2">
          <ActionButtons
            vendor={vendor}
            acting={acting}
            onApprove={() => doAction('approve')}
            onReject={() => setRejectOpen(true)}
            onMarkSapCreated={() => setSapDialogOpen(true)}
            onMarkSapUpdateDone={() => doAction('mark_sap_update_done')}
            onDeactivate={() => doAction('deactivate')}
            onReactivate={() => doAction('reactivate')}
          />
          {/* Admin-only delete / restore */}
          {isAdmin && (
            <div className="flex gap-2">
              {(vendor as any).deleted_at ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestore}
                  disabled={acting}
                  className="gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={acting}
                  className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {(vendor as any).deleted_at && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm flex items-start gap-2">
            <Trash2 className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive">This vendor is deleted</p>
              <p className="text-muted-foreground">
                Deleted on {format(parseISO((vendor as any).deleted_at), 'dd MMM yyyy HH:mm')}.
                Portal access for this vendor is disabled. Click Restore to undo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {vendor.blocked_reason && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm flex items-start gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Blocked</p>
              <p className="text-muted-foreground">{vendor.blocked_reason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="documents">Documents ({attachments.length})</TabsTrigger>
          <TabsTrigger value="audit">History ({auditLog.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <DetailsCard
            vendor={vendor}
            onEdit={(s) => isAdmin && setEditSection(s)}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsCard
            vendorId={vendor.id}
            vendorStatus={vendor.status}
            attachments={attachments}
            requirements={requirements as any}
            onChange={refresh}
          />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditCard log={auditLog} />
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              The vendor will receive a bilingual rejection email with this reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Explain why this registration is not being approved..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || acting}
              onClick={async () => {
                await doAction('reject', { reason: rejectReason.trim() });
                setRejectOpen(false);
                setRejectReason('');
              }}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SAP creation dialog */}
      <Dialog open={sapDialogOpen} onOpenChange={setSapDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Created in SAP</DialogTitle>
            <DialogDescription>
              Enter the SAP codes assigned to this vendor. The vendor's portal account will be created and they'll receive their access link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>SAP Vendor Code <span className="text-destructive">*</span></Label>
              <Input value={sapForm.sap_vendor_code} onChange={(e) => setSapForm({ ...sapForm, sap_vendor_code: e.target.value })} />
            </div>
            <div>
              <Label>Account Group</Label>
              <Input value={sapForm.sap_account_group} onChange={(e) => setSapForm({ ...sapForm, sap_account_group: e.target.value })} />
            </div>
            <div>
              <Label>Company Code</Label>
              <Input value={sapForm.sap_company_code} onChange={(e) => setSapForm({ ...sapForm, sap_company_code: e.target.value })} />
            </div>
            <div>
              <Label>Purchasing Organization</Label>
              <Input value={sapForm.sap_purchasing_organization} onChange={(e) => setSapForm({ ...sapForm, sap_purchasing_organization: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!sapForm.sap_vendor_code.trim() || acting}
              onClick={async () => {
                await doAction('mark_sap_created', sapForm);
                setSapDialogOpen(false);
              }}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section edit dialog (admin only) */}
      {editSection && (
        <VendorEditDialog
          vendor={vendor}
          section={editSection}
          open={!!editSection}
          onClose={() => setEditSection(null)}
          onSaved={refresh}
        />
      )}

      {/* Delete confirmation dialog (admin only) */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Vendor
            </DialogTitle>
            <DialogDescription>
              The vendor record will be soft-deleted — it stays in the database for audit purposes but is hidden from default views and the vendor's portal access is revoked. You can restore it later from the "Show deleted" filter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-destructive/10 border-l-2 border-destructive p-3 text-sm rounded">
              <p className="font-semibold mb-1">This will:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Hide the vendor from default lists and from procurement queues</li>
                <li>Lock out the vendor's portal account immediately</li>
                <li>Preserve all audit history and uploaded documents</li>
                <li>NOT remove anything from SAP — that must be done separately</li>
              </ul>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                To confirm, type the vendor's exact legal name:
                <span className="block font-mono font-bold mt-0.5">{vendor.legal_name_en}</span>
              </Label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Type the legal name to confirm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirmName(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmName.trim() !== vendor.legal_name_en.trim() || acting}
              onClick={handleSoftDelete}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

const ActionButtons = ({
  vendor, acting,
  onApprove, onReject, onMarkSapCreated, onMarkSapUpdateDone, onDeactivate, onReactivate,
}: {
  vendor: any; acting: boolean;
  onApprove: () => void; onReject: () => void;
  onMarkSapCreated: () => void; onMarkSapUpdateDone: () => void;
  onDeactivate: () => void; onReactivate: () => void;
}) => {
  const buttons = [];
  switch (vendor.status) {
    case 'submitted':
      buttons.push(
        <Button key="approve" onClick={onApprove} disabled={acting} className="gap-1">
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>,
        <Button key="reject" variant="destructive" onClick={onReject} disabled={acting}>
          Reject
        </Button>,
      );
      break;
    case 'approved_pending_sap_creation':
      buttons.push(
        <Button key="sap" onClick={onMarkSapCreated} disabled={acting} className="gap-1">
          <CheckCircle2 className="h-4 w-4" /> Mark Created in SAP
        </Button>,
      );
      break;
    case 'update_approved_pending_sap_update':
      buttons.push(
        <Button key="sap-upd" onClick={onMarkSapUpdateDone} disabled={acting}>
          Mark SAP Update Done
        </Button>,
      );
      break;
    case 'active_in_sap':
    case 'sap_update_completed':
      buttons.push(
        <Button key="deact" variant="outline" onClick={onDeactivate} disabled={acting}>
          Deactivate
        </Button>,
      );
      break;
    case 'inactive':
      buttons.push(
        <Button key="react" variant="outline" onClick={onReactivate} disabled={acting}>
          Reactivate
        </Button>,
      );
      break;
  }
  return <div className="flex gap-2 flex-wrap">{buttons}</div>;
};

// =====================================================================
// Section editor — pops a dialog with the editable fields for the
// section, saves directly to vendors row + writes audit log entry.
// =====================================================================

type SectionKey = 'company' | 'contact' | 'bank' | 'signatory';

interface VendorEditDialogProps {
  vendor: any;
  section: SectionKey;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const SECTION_FIELDS: Record<SectionKey, Array<{ key: string; label: string; required?: boolean }>> = {
  company: [
    { key: 'legal_name_en',     label: 'Legal name (English)', required: true },
    { key: 'legal_name_ar',     label: 'Legal name (Arabic)' },
    { key: 'trading_name',      label: 'Trading name' },
    { key: 'country',           label: 'Country' },
    { key: 'city',              label: 'City' },
    { key: 'address_line1',     label: 'Address line 1' },
    { key: 'address_line2',     label: 'Address line 2' },
    { key: 'industry_activity', label: 'Industry / activity' },
    { key: 'website',           label: 'Website' },
  ],
  contact: [
    { key: 'contact_name',     label: 'Contact name', required: true },
    { key: 'contact_position', label: 'Position' },
    { key: 'contact_email',    label: 'Email', required: true },
    { key: 'contact_phone',    label: 'Phone' },
  ],
  signatory: [
    { key: 'signatory_name',     label: 'Authorized signatory' },
    { key: 'signatory_position', label: 'Signatory position' },
    { key: 'signatory_civil_id_or_passport', label: 'Civil ID / passport' },
  ],
  bank: [
    { key: 'bank_name',           label: 'Bank name' },
    { key: 'bank_branch',         label: 'Branch' },
    { key: 'bank_account_name',   label: 'Account holder' },
    { key: 'bank_currency',       label: 'Currency' },
    { key: 'bank_account_number', label: 'Account number' },
    { key: 'bank_iban',           label: 'IBAN' },
    { key: 'bank_swift_bic',      label: 'SWIFT/BIC' },
  ],
};

const SECTION_LABELS: Record<SectionKey, string> = {
  company: 'Company', contact: 'Contact', signatory: 'Authorized Signatory', bank: 'Bank',
};

const VendorEditDialog = ({ vendor, section, open, onClose, onSaved }: VendorEditDialogProps) => {
  const { toast } = useToast();
  const fields = SECTION_FIELDS[section];
  const [values, setValues] = useState<Record<string, string>>({});
  const [bankConfirmed, setBankConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form values when the dialog opens (fresh state per opening)
  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const f of fields) {
        init[f.key] = vendor[f.key] || '';
      }
      setValues(init);
      setBankConfirmed(false);
    }
  }, [open, vendor, section]);

  const isBank = section === 'bank';

  // Compute changed fields (only persist diffs to keep the audit log clean)
  const changedFields = (() => {
    const diff: Record<string, { old: any; new: any }> = {};
    for (const f of fields) {
      const oldVal = vendor[f.key] || null;
      const newVal = values[f.key]?.trim() || null;
      if (oldVal !== newVal) diff[f.key] = { old: oldVal, new: newVal };
    }
    return diff;
  })();

  const requiredOk = fields
    .filter((f) => f.required)
    .every((f) => (values[f.key] || '').trim().length > 0);
  const hasChanges = Object.keys(changedFields).length > 0;
  const canSave = hasChanges && requiredOk && (!isBank || bankConfirmed);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const updatePayload: Record<string, any> = {};
      for (const k of Object.keys(changedFields)) {
        updatePayload[k] = (values[k]?.trim() || null);
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('vendors' as any)
        .update(updatePayload)
        .eq('id', vendor.id);
      if (error) throw error;

      // Audit log — record exactly which fields changed
      await supabase.from('vendor_audit_log' as any).insert({
        vendor_id: vendor.id,
        action: `admin_edit_${section}`,
        actor_user_id: user?.id,
        actor_kind: 'staff',
        notes: `Admin edited ${SECTION_LABELS[section]} section`,
        metadata: {
          section,
          changed_fields: changedFields,
          fields_changed_count: Object.keys(changedFields).length,
        },
      } as any);

      toast({ title: 'Saved', description: `${SECTION_LABELS[section]} updated.` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {SECTION_LABELS[section]}</DialogTitle>
          <DialogDescription>
            Changes apply immediately. The audit log will record what changed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">
                {f.label}{f.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                value={values[f.key] || ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        {isBank && hasChanges && (
          <div className="flex items-start gap-2 p-3 bg-warning/10 border-l-2 border-warning rounded text-xs">
            <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Bank details are a high-risk change.</p>
              <p className="text-muted-foreground mb-2">
                Make sure the new bank information has been verified through a trusted channel (e.g., signed bank letter from the vendor). Bank fraud often starts with an unauthenticated email asking for "an updated IBAN."
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={bankConfirmed} onCheckedChange={(c) => setBankConfirmed(c === true)} className="mt-0.5" />
                <span>I have verified these bank details with the vendor through a trusted channel.</span>
              </label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DetailsCard = ({ vendor, onEdit }: { vendor: any; onEdit?: (s: SectionKey) => void }) => {
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );

  const SectionHeader = ({ title, section, hideEdit }: { title: string; section?: SectionKey; hideEdit?: boolean }) => (
    <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
      <CardTitle className="text-base">{title}</CardTitle>
      {section && !hideEdit && onEdit && (
        <Button variant="ghost" size="sm" onClick={() => onEdit(section)} className="gap-1 h-7">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      )}
    </CardHeader>
  );

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Company" section="company" />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Legal name (English)" value={vendor.legal_name_en} />
          <Field label="Legal name (Arabic)" value={vendor.legal_name_ar} />
          <Field label="Trading name" value={vendor.trading_name} />
          <Field label="Country" value={vendor.country} />
          <Field label="City" value={vendor.city} />
          <Field label="Address" value={[vendor.address_line1, vendor.address_line2].filter(Boolean).join(', ')} />
          <Field label="Industry / activity" value={vendor.industry_activity} />
          <Field label="Website" value={vendor.website} />
        </CardContent>
      </Card>

      <Card>
        <SectionHeader title="Contact" section="contact" />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Contact name" value={vendor.contact_name} />
          <Field label="Position" value={vendor.contact_position} />
          <Field label="Email" value={vendor.contact_email} />
          <Field label="Phone" value={vendor.contact_phone} />
        </CardContent>
      </Card>

      <Card>
        <SectionHeader title="Authorized Signatory" section="signatory" />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Authorized signatory" value={vendor.signatory_name} />
          <Field label="Signatory position" value={vendor.signatory_position} />
          <Field label="Civil ID / passport" value={vendor.signatory_civil_id_or_passport} />
        </CardContent>
      </Card>

      <Card>
        <SectionHeader title="Bank" section="bank" />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bank name" value={vendor.bank_name} />
          <Field label="Branch" value={vendor.bank_branch} />
          <Field label="Account holder" value={vendor.bank_account_name} />
          <Field label="Currency" value={vendor.bank_currency} />
          <Field label="Account number" value={vendor.bank_account_number} />
          <Field label="IBAN" value={vendor.bank_iban} />
          <Field label="SWIFT/BIC" value={vendor.bank_swift_bic} />
        </CardContent>
      </Card>

      <Card>
        <SectionHeader title="SAP (internal — managed via Mark Created in SAP action)" hideEdit />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SAP Vendor Code" value={vendor.sap_vendor_code} />
          <Field label="Account Group" value={vendor.sap_account_group} />
          <Field label="Company Code" value={vendor.sap_company_code} />
          <Field label="Purchasing Org" value={vendor.sap_purchasing_organization} />
          <Field label="Created in SAP" value={vendor.sap_created_at ? format(parseISO(vendor.sap_created_at), 'dd MMM yyyy') : null} />
          <Field label="Last SAP update" value={vendor.sap_last_update_at ? format(parseISO(vendor.sap_last_update_at), 'dd MMM yyyy') : null} />
          <Field label="Update reference" value={vendor.sap_last_update_reference} />
        </CardContent>
      </Card>
    </div>
  );
};

const DocumentsCard = ({
  vendorId, vendorStatus, attachments, requirements, onChange,
}: {
  vendorId: string;
  vendorStatus: string;
  attachments: VendorAttachment[];
  requirements: any[];
  onChange: () => void;
}) => {
  const { toast } = useToast();
  const [batchSending, setBatchSending] = useState(false);

  // Group attachments by document_type_id. Within each group, sort
  // newest first so docs[0] is the current/latest.
  const byType: Record<string, VendorAttachment[]> = {};
  for (const a of attachments) {
    const k = a.document_type_id || 'other';
    (byType[k] ||= []).push(a);
  }

  // Latest-per-slot view — used for review summary counts. When a
  // vendor replaces a file, an older one is still in attachments,
  // but only the newest is the active one for review purposes.
  const latestPerSlot: VendorAttachment[] = [];
  for (const docs of Object.values(byType)) {
    if (docs.length > 0) latestPerSlot.push(docs[0]);
  }

  // Counts for the review dashboard banner — based on latest-per-slot
  const reviewedAttachments = latestPerSlot.filter((a) =>
    (a as any).human_status && (a as any).human_status !== 'pending_review',
  );
  const pendingItems = latestPerSlot.filter((a) =>
    (a as any).human_status === 'rejected' || (a as any).human_status === 'clarification_requested',
  );
  const stillPending = latestPerSlot.filter((a) =>
    !(a as any).human_status || (a as any).human_status === 'pending_review',
  );
  const allApproved = latestPerSlot.length > 0 && latestPerSlot.every((a) => (a as any).human_status === 'approved');

  // Show review controls only when the vendor is in a state where
  // review actions make sense — i.e. they've submitted something we
  // haven't fully approved yet. Once Active in SAP, the docs are
  // historical, not under active review.
  const isReviewable = ['submitted', 'awaiting_vendor_response'].includes(vendorStatus);

  const handleBatchSend = async () => {
    setBatchSending(true);
    try {
      const r: any = await batchSendToVendor(vendorId);
      if (r.error && !r.partial) {
        toast({ title: 'Could not send', description: r.error, variant: 'destructive' });
      } else if (r.status === 'no_changes_needed') {
        toast({ title: r.message || 'All approved', description: 'You can now click Approve on the vendor.' });
      } else if (r.partial || r.email_sent === false) {
        // Partial success: decisions saved, vendor status updated,
        // but email failed. Loud warning so procurement follows up.
        toast({
          title: 'Decisions saved — but email failed',
          description: r.error || 'The vendor email could not be sent. Please contact the vendor manually. Check the audit log on this page for the exact error.',
          variant: 'destructive',
        });
        onChange();
      } else {
        toast({ title: 'Sent to vendor', description: `${r.items_sent} item(s) sent. Vendor status moved to "Awaiting Vendor Response".` });
        onChange();
      }
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setBatchSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Review summary + batch send button */}
      {isReviewable && attachments.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-xs flex-1">
              <p className="font-semibold text-foreground">Document review</p>
              <p className="text-muted-foreground">
                Approve, reject, or ask a question on each document. When you're ready,
                send your feedback to the vendor in one batched email.
              </p>
              <p className="mt-1 text-muted-foreground">
                <strong>{reviewedAttachments.length}</strong> reviewed •
                <strong className="text-warning"> {pendingItems.length}</strong> pending vendor response •
                <strong> {stillPending.length}</strong> still to review
              </p>
            </div>
            {pendingItems.length > 0 && (
              <Button onClick={handleBatchSend} disabled={batchSending} size="sm" className="gap-1 shrink-0">
                {batchSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send feedback to vendor ({pendingItems.length})
              </Button>
            )}
            {allApproved && (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                All documents approved — use Approve action
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requirements.map((req) => {
            const docs = byType[req.document_type_id] || [];
            return (
              <div key={req.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-sm">
                      {req.document_type?.label_en}
                      {req.is_required && !req.is_conditional && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </p>
                    {req.condition_label_en && (
                      <p className="text-[11px] text-muted-foreground">{req.condition_label_en}</p>
                    )}
                  </div>
                  {docs.length === 0 ? (
                    req.is_required && !req.is_conditional ? (
                      <Badge variant="destructive" className="text-[10px]">Missing</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Not provided</Badge>
                    )
                  ) : null}
                </div>
                {docs.map((d, idx) => (
                  <DocumentRow
                    key={d.id}
                    attachment={d}
                    isLatest={idx === 0}
                    isReviewable={isReviewable && idx === 0}
                    onChange={onChange}
                  />
                ))}
              </div>
            );
          })}

          {byType['other'] && byType['other'].length > 0 && (
            <div className="border border-border rounded-md p-3">
              <p className="font-medium text-sm mb-2">Other</p>
              {byType['other'].map((d, idx) => (
                <DocumentRow
                  key={d.id}
                  attachment={d}
                  isLatest={idx === 0}
                  isReviewable={isReviewable && idx === 0}
                  onChange={onChange}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const DocumentRow = ({
  attachment: a, isReviewable, isLatest, onChange,
}: {
  attachment: VendorAttachment;
  isReviewable: boolean;
  isLatest: boolean;
  onChange: () => void;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [decisionDialog, setDecisionDialog] = useState<'rejected' | 'clarification_requested' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [acting, setActing] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [openingFile, setOpeningFile] = useState<'view' | 'download' | null>(null);
  const [sendingNow, setSendingNow] = useState(false);

  // Open the file in a new tab (view) or trigger download. Both use a
  // short-lived signed URL since the bucket is private. Errors fall
  // back to a toast with the storage message.
  const handleOpenFile = async (mode: 'view' | 'download') => {
    setOpeningFile(mode);
    try {
      const url = await getAttachmentSignedUrl(a.id, { download: mode === 'download' });
      // Open in a new tab. For downloads the Content-Disposition header
      // (set via the storage API's `download` option) tells the browser
      // to save rather than render.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({
        title: mode === 'download' ? 'Download failed' : 'Could not open file',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setOpeningFile(null);
    }
  };

  // "Send now" — fire an immediate per-attachment notice for THIS one
  // attachment, separate from the batched dispatch on the parent card.
  // Only available when the attachment is currently rejected or
  // clarification_requested (otherwise there's nothing to send).
  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const r: any = await sendSingleToVendor(a.id);
      if (r.error && !r.partial) {
        toast({ title: 'Could not send', description: r.error, variant: 'destructive' });
      } else if (r.partial || r.email_sent === false) {
        toast({
          title: 'Decision saved — but email failed',
          description: r.error || 'The vendor email could not be sent. Please contact the vendor manually.',
          variant: 'destructive',
        });
        onChange();
      } else {
        toast({
          title: 'Sent to vendor',
          description: 'Vendor was notified about this document. Status moved to Awaiting Vendor Response.',
        });
        onChange();
      }
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSendingNow(false);
    }
  };

  // Lazy-load thread messages only when expanded
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['vendor-attachment-messages', a.id],
    queryFn: () => fetchMessagesForAttachment(a.id),
    enabled: showThread,
  });

  // -- AI verdict (informational) --
  const aiBadge = (() => {
    switch (a.ai_verdict) {
      case 'accepted': return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">AI: Accepted</Badge>;
      case 'rejected': return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">AI: Rejected</Badge>;
      case 'soft_pending': return <Badge variant="outline" className="text-[10px]">AI: Manual review</Badge>;
      case 'pending': return null;
    }
  })();

  // -- Human verdict (authoritative) --
  const humanStatus = (a as any).human_status as AttachmentHumanStatus | undefined || 'pending_review';
  const humanBadge = (() => {
    switch (humanStatus) {
      case 'approved': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">✓ Approved</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-[10px]">Rejected — vendor must replace</Badge>;
      case 'clarification_requested': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">? Clarification requested</Badge>;
      case 'pending_review': return <Badge variant="outline" className="text-[10px]">Pending your review</Badge>;
    }
  })();

  const doDecision = async (status: AttachmentHumanStatus, reason?: string) => {
    setActing(true);
    try {
      const r = await setAttachmentHumanStatus({ attachment_id: a.id, status, reason });
      if (r.error) {
        toast({ title: 'Action failed', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: 'Saved', description: `Marked ${HUMAN_STATUS_LABEL[status].en.toLowerCase()}.` });
        onChange();
        setDecisionDialog(null);
        setDecisionReason('');
      }
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const r = await postAttachmentMessage({ attachment_id: a.id, message: newMessage.trim() });
      if (r.error) {
        toast({ title: 'Could not send', description: r.error, variant: 'destructive' });
      } else {
        setNewMessage('');
        await refetchMessages();
      }
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div className={`bg-muted/30 rounded p-2 text-xs space-y-2 mt-1 ${!isLatest ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate font-medium">{a.file_name}</span>
          {!isLatest && (
            <Badge variant="outline" className="text-[9px]">Previous version</Badge>
          )}
          {/* View / Download — always available regardless of AI verdict
              or human status. Procurement can spot-check any file at any
              point. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] gap-1"
            disabled={openingFile !== null}
            onClick={() => handleOpenFile('view')}
            title="Open file in a new tab"
          >
            {openingFile === 'view' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
            View
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] gap-1"
            disabled={openingFile !== null}
            onClick={() => handleOpenFile('download')}
            title="Download a copy"
          >
            {openingFile === 'download' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Download
          </Button>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {aiBadge}
          {humanBadge}
        </div>
      </div>

      {a.expiry_date && (
        <p className="text-muted-foreground">
          Expires: <span className="font-mono">{format(parseISO(a.expiry_date), 'dd MMM yyyy')}</span>
        </p>
      )}

      {a.ai_summary && (
        <p className="text-muted-foreground italic">{a.ai_summary}</p>
      )}

      {(a as any).human_status_reason && humanStatus !== 'approved' && (
        <div className="bg-background border-l-2 border-warning px-2 py-1 rounded">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your note to vendor:</p>
          <p>{(a as any).human_status_reason}</p>
        </div>
      )}

      {/* Per-attachment review actions */}
      {isReviewable && (
        <div className="flex items-center gap-1 flex-wrap pt-1">
          <Button
            size="sm"
            variant={humanStatus === 'approved' ? 'default' : 'outline'}
            className="h-6 px-2 text-[10px] gap-1"
            disabled={acting}
            onClick={() => doDecision('approved')}
          >
            <CheckCircle2 className="h-3 w-3" /> Approve
          </Button>
          <Button
            size="sm"
            variant={humanStatus === 'clarification_requested' ? 'default' : 'outline'}
            className="h-6 px-2 text-[10px] gap-1"
            disabled={acting}
            onClick={() => setDecisionDialog('clarification_requested')}
          >
            <HelpCircle className="h-3 w-3" /> Ask
          </Button>
          <Button
            size="sm"
            variant={humanStatus === 'rejected' ? 'destructive' : 'outline'}
            className="h-6 px-2 text-[10px] gap-1"
            disabled={acting}
            onClick={() => setDecisionDialog('rejected')}
          >
            <XCircle className="h-3 w-3" /> Reject
          </Button>
          {humanStatus !== 'pending_review' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-muted-foreground"
              disabled={acting}
              onClick={() => doDecision('pending_review')}
            >
              Undo
            </Button>
          )}
          {/* Send now — emails the vendor immediately for THIS one
              attachment, separate from the batched dispatch. Visible
              only when there's something to actually send. */}
          {(humanStatus === 'rejected' || humanStatus === 'clarification_requested') && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] gap-1"
              disabled={sendingNow}
              onClick={handleSendNow}
              title="Email the vendor about this one attachment now (instead of waiting to batch)"
            >
              {sendingNow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send now
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1 ml-auto"
            onClick={() => setShowThread((s) => !s)}
          >
            <MessageSquare className="h-3 w-3" />
            {showThread ? 'Hide' : 'Thread'} {messages.length > 0 && `(${messages.length})`}
          </Button>
        </div>
      )}

      {/* Message thread (lazy-loaded when expanded) */}
      {showThread && (
        <div className="bg-background rounded p-2 space-y-2 border border-border">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-[10px]">No messages yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {messages.map((m: AttachmentMessage) => (
                <div key={m.id} className={`flex ${m.author_kind === 'procurement' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`px-2 py-1 rounded max-w-[80%] ${
                    m.author_kind === 'procurement'
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted text-foreground'
                  }`}>
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5 opacity-60">
                      {m.author_kind === 'procurement' ? 'Procurement' : 'Vendor'} • {format(parseISO(m.created_at), 'dd MMM HH:mm')}
                    </p>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Reply to vendor..."
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button size="sm" className="h-7 px-2" disabled={!newMessage.trim() || sendingMessage} onClick={handleSendMessage}>
              {sendingMessage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      )}

      {/* Decision dialog (reject / clarification) */}
      <Dialog open={decisionDialog !== null} onOpenChange={(v) => !v && setDecisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog === 'rejected' ? 'Reject this document' : 'Ask the vendor a question'}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog === 'rejected'
                ? 'Tell the vendor what was wrong so they know what to upload instead. The reason will be included in the bundled email when you click "Send feedback to vendor".'
                : 'What would you like to clarify? The vendor can reply and/or upload a new file.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder={decisionDialog === 'rejected'
              ? 'e.g. The IBAN doesn\'t match the company name on the bank letter.'
              : 'e.g. Is this the bank account that will receive payment, or a different one?'}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecisionDialog(null); setDecisionReason(''); }}>Cancel</Button>
            <Button
              variant={decisionDialog === 'rejected' ? 'destructive' : 'default'}
              disabled={!decisionReason.trim() || acting}
              onClick={() => doDecision(decisionDialog!, decisionReason.trim())}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const AuditCard = ({ log }: { log: any[] }) => (
  <Card>
    <CardContent className="p-0">
      {log.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground text-center">No history yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {log.map((row) => (
            <div key={row.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.action}</span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(row.created_at), 'dd MMM yyyy HH:mm')}
                </span>
              </div>
              {row.notes && <p className="text-xs text-muted-foreground mt-1">{row.notes}</p>}
              {row.metadata && (
                <p className="text-[10px] text-muted-foreground font-mono mt-1">
                  {row.metadata.from_status} → {row.metadata.to_status}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

export default VendorDetail;
