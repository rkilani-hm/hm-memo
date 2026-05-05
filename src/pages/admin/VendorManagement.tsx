import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Building2, Clock, Link2, Copy, Check } from 'lucide-react';
import {
  fetchVendors, fetchVendorTypes,
  STATUS_LABELS, statusBadgeVariant, type VendorStatus,
} from '@/lib/vendor-api';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, differenceInDays } from 'date-fns';

const ALL_STATUSES: VendorStatus[] = [
  'draft', 'submitted', 'approved_pending_sap_creation', 'active_in_sap',
  'update_submitted', 'update_approved_pending_sap_update', 'sap_update_completed',
  'rejected', 'inactive', 'blocked_documents_expired',
];

// Public registration URL — shown on this page so admins can share it
// with vendors. The path is fixed; the host is derived from the
// current browser location so this works in any deployment.
const getPublicRegistrationUrl = () =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/vendor/register`
    : '/vendor/register';

const VendorManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getPublicRegistrationUrl());
      setCopied(true);
      toast({ title: 'Copied', description: 'Public registration link copied to clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy the link manually.',
        variant: 'destructive',
      });
    }
  };

  const { data: vendors = [], isLoading, refetch } = useQuery({
    queryKey: ['vendors', { showDeleted }],
    queryFn: () => fetchVendors({ includeDeleted: showDeleted }),
  });

  const { data: vendorTypes = [] } = useQuery({
    queryKey: ['vendor-types'],
    queryFn: fetchVendorTypes,
  });

  // "Documents expiring soon" widget — query attachments with expiry
  // <= 60 days out across all active vendors.
  const { data: expiringSoon = [] } = useQuery({
    queryKey: ['vendor-attachments-expiring'],
    queryFn: async () => {
      const sixtyDaysFromNow = new Date();
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);
      const { data } = await supabase
        .from('vendor_attachments' as any)
        .select(`
          id, vendor_id, expiry_date, file_name,
          document_types(label_en),
          vendors!inner(legal_name_en, vendor_reference_no, status)
        `)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', sixtyDaysFromNow.toISOString().split('T')[0])
        .order('expiry_date');
      // Filter to vendors actually in active-ish states
      return (data as any[] || []).filter((r) =>
        ['active_in_sap', 'sap_update_completed', 'blocked_documents_expired'].includes(r.vendors?.status),
      );
    },
  });

  const typeMap = new Map(vendorTypes.map((t) => [t.id, t.label_en]));

  const filtered = vendors.filter((v) => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (typeFilter !== 'all' && v.vendor_type_id !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        v.legal_name_en, v.legal_name_ar, v.trading_name, v.vendor_reference_no,
        v.contact_name, v.contact_email, v.sap_vendor_code,
      ].filter(Boolean).map((s) => String(s).toLowerCase());
      if (!hay.some((s) => s.includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Vendor Master
          </h1>
          <p className="text-sm text-muted-foreground">
            Approved suppliers and ongoing registrations.
          </p>
        </div>
        <Button onClick={() => navigate('/admin/vendors/new')} className="gap-2">
          <Plus className="h-4 w-4" /> New Vendor
        </Button>
      </div>

      {/* Public registration link — admins can copy and share with vendors */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Link2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Public registration link</p>
              <p className="text-xs text-muted-foreground">
                Share this with suppliers to let them register themselves. They don't need an account.
              </p>
              <p className="text-xs font-mono text-foreground/80 truncate mt-0.5">
                {getPublicRegistrationUrl()}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyUrl}
            className="gap-1 shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </CardContent>
      </Card>

      {/* Documents expiring soon */}
      {expiringSoon.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="h-4 w-4 text-warning" />
              Documents Expiring Soon ({expiringSoon.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
              {expiringSoon.slice(0, 6).map((row) => {
                const days = differenceInDays(parseISO(row.expiry_date), new Date());
                const expired = days < 0;
                return (
                  <button
                    key={row.id}
                    onClick={() => navigate(`/admin/vendors/${row.vendor_id}`)}
                    className="text-left hover:bg-warning/10 px-2 py-1 rounded flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      <strong>{row.vendors.legal_name_en}</strong> — {row.document_types?.label_en}
                    </span>
                    <span className={expired ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                      {expired ? `expired ${-days}d ago` : `${days}d`}
                    </span>
                  </button>
                );
              })}
            </div>
            {expiringSoon.length > 6 && (
              <p className="text-xs text-muted-foreground">
                +{expiringSoon.length - 6} more — filter list by status to see all.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, reference, email, SAP code..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {vendorTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {vendors.length}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="show-deleted"
              checked={showDeleted}
              onCheckedChange={setShowDeleted}
            />
            <Label htmlFor="show-deleted" className="text-xs cursor-pointer">
              Show deleted
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Legal Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SAP Code</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No vendors match.</TableCell></TableRow>
              ) : filtered.map((v) => (
                <TableRow
                  key={v.id}
                  className={`cursor-pointer hover:bg-muted/50 ${(v as any).deleted_at ? 'opacity-60 bg-muted/20' : ''}`}
                  onClick={() => navigate(`/admin/vendors/${v.id}`)}
                >
                  <TableCell className="font-mono text-xs">{v.vendor_reference_no}</TableCell>
                  <TableCell>
                    <div className="font-medium flex items-center gap-2">
                      {v.legal_name_en}
                      {(v as any).deleted_at && (
                        <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                          Deleted
                        </Badge>
                      )}
                    </div>
                    {v.trading_name && (
                      <div className="text-xs text-muted-foreground">{v.trading_name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{typeMap.get(v.vendor_type_id) || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(v.status) as any} className="text-xs">
                      {STATUS_LABELS[v.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{v.sap_vendor_code || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {v.submitted_at ? format(parseISO(v.submitted_at), 'dd MMM yyyy') : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorManagement;
