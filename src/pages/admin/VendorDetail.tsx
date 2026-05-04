import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  fetchVendorById, fetchVendorTypes, fetchAttachmentsForVendor, fetchAuditLogForVendor,
  fetchRequirementsForType, invokeStatusTransition,
  STATUS_LABELS, statusBadgeVariant,
  type VendorAttachment,
} from '@/lib/vendor-api';
import {
  ArrowLeft, Building2, CheckCircle2, XCircle, Loader2, ShieldAlert,
  FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const VendorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [sapDialogOpen, setSapDialogOpen] = useState(false);
  const [sapForm, setSapForm] = useState({
    sap_vendor_code: '', sap_account_group: '',
    sap_company_code: '', sap_purchasing_organization: '',
  });
  const [acting, setActing] = useState(false);

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
      const r = await invokeStatusTransition({ vendor_id: vendor.id, action, payload });
      if (r.error) {
        toast({ title: 'Action failed', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: 'Done', description: `Vendor moved to ${STATUS_LABELS[r.status as any] || r.status}.` });
        refresh();
      }
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Unknown error', variant: 'destructive' });
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
      </div>

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
          <DetailsCard vendor={vendor} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsCard
            vendorId={vendor.id}
            attachments={attachments}
            requirements={requirements as any}
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

const DetailsCard = ({ vendor }: { vendor: any }) => {
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Company</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Contact name" value={vendor.contact_name} />
          <Field label="Position" value={vendor.contact_position} />
          <Field label="Email" value={vendor.contact_email} />
          <Field label="Phone" value={vendor.contact_phone} />
          <Field label="Authorized signatory" value={vendor.signatory_name} />
          <Field label="Signatory position" value={vendor.signatory_position} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bank</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-base">SAP (internal)</CardTitle></CardHeader>
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
  vendorId, attachments, requirements,
}: {
  vendorId: string;
  attachments: VendorAttachment[];
  requirements: any[];
}) => {
  // Group attachments by document_type_id
  const byType: Record<string, VendorAttachment[]> = {};
  for (const a of attachments) {
    const k = a.document_type_id || 'other';
    (byType[k] ||= []).push(a);
  }

  return (
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
              {docs.map((d) => <DocumentRow key={d.id} attachment={d} />)}
            </div>
          );
        })}

        {/* Other / unmatched */}
        {byType['other'] && byType['other'].length > 0 && (
          <div className="border border-border rounded-md p-3">
            <p className="font-medium text-sm mb-2">Other</p>
            {byType['other'].map((d) => <DocumentRow key={d.id} attachment={d} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DocumentRow = ({ attachment: a }: { attachment: VendorAttachment }) => {
  const verdictBadge = (() => {
    switch (a.ai_verdict) {
      case 'accepted': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">Accepted</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
      case 'soft_pending': return <Badge variant="outline" className="text-[10px]">Manual review</Badge>;
      case 'pending': return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
    }
  })();

  return (
    <div className="bg-muted/30 rounded p-2 text-xs space-y-1 mt-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate font-medium">{a.file_name}</span>
        </div>
        {verdictBadge}
      </div>
      {a.expiry_date && (
        <p className="text-muted-foreground">
          Expires: <span className="font-mono">{format(parseISO(a.expiry_date), 'dd MMM yyyy')}</span>
          {a.expiry_source && <span className="ml-1 text-[10px]">({a.expiry_source.replace('_', ' ')})</span>}
        </p>
      )}
      {a.ai_summary && (
        <p className="text-muted-foreground italic">{a.ai_summary}</p>
      )}
      {a.ai_verdict === 'rejected' && a.ai_rejection_reason && (
        <p className="text-destructive">Reason: {a.ai_rejection_reason}</p>
      )}
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
