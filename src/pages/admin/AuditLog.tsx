import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, ShieldCheck, Download, ChevronDown, ChevronRight, Monitor, Smartphone, Tablet, FileText, Pen, Lock, KeyRound } from 'lucide-react';
import { format } from 'date-fns';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  memo_created: { label: 'Memo Created', color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]' },
  memo_drafted: { label: 'Memo Drafted', color: 'bg-muted text-muted-foreground' },
  memo_submitted: { label: 'Memo Submitted', color: 'bg-primary/10 text-primary' },
  memo_approved: { label: 'Approved', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' },
  memo_rejected: { label: 'Rejected', color: 'bg-destructive/10 text-destructive' },
  memo_rework: { label: 'Rework Requested', color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]' },
  workflow_started: { label: 'Workflow Started', color: 'bg-primary/10 text-primary' },
  manual_signature_registered: { label: 'Manual Signature', color: 'bg-accent/10 text-accent' },
  manual_initial_registered: { label: 'Manual Initial', color: 'bg-accent/10 text-accent' },
  digital_signature_applied: { label: 'Digital Signature', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' },
  digital_initial_applied: { label: 'Digital Initial', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' },
  delegate_assigned: { label: 'Delegate Assigned', color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]' },
  delegate_removed: { label: 'Delegate Removed', color: 'bg-destructive/10 text-destructive' },
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  Desktop: <Monitor className="h-3 w-3" />,
  Mobile: <Smartphone className="h-3 w-3" />,
  Tablet: <Tablet className="h-3 w-3" />,
};

const AuditLog = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterMemo, setFilterMemo] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit-log', filterUser, filterAction, filterMethod, filterMemo, filterDateFrom, filterDateTo, page],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterUser !== 'all') query = query.eq('user_id', filterUser);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterMethod !== 'all') query = query.eq('signing_method', filterMethod);
      if (filterMemo.trim()) query = query.ilike('transmittal_no', `%${filterMemo.trim()}%`);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`);

      const { data, error, count } = await query;
      if (error) throw error;
      return { entries: data || [], total: count || 0 };
    },
  });

  const entries = auditData?.entries || [];
  const total = auditData?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  const exportCSV = () => {
    if (!entries.length) return;
    const headers = ['Timestamp', 'User', 'On Behalf Of', 'Action', 'Memo', 'Method', 'IP Address', 'Location', 'Device', 'Browser', 'Notes'];
    const rows = entries.map(e => {
      const usr = getProfile(e.user_id);
      return [
        format(new Date(e.created_at), 'yyyy-MM-dd HH:mm:ss'),
        usr?.full_name || e.user_id,
        e.on_behalf_of_name || '—',
        e.action,
        e.transmittal_no || '—',
        e.signing_method || '—',
        e.ip_address || '—',
        [e.ip_geolocation_city, e.ip_geolocation_country].filter(Boolean).join(', ') || '—',
        e.device_type || '—',
        e.browser || '—',
        e.notes || '—',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueActions = [...new Set(entries.map(e => e.action))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm">Forensic-grade activity trail — immutable, append-only</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={entries.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Total Entries</p>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Digital Actions</p>
            <p className="text-2xl font-bold text-[hsl(var(--info))]">
              {entries.filter(e => e.signing_method === 'digital').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Manual Registrations</p>
            <p className="text-2xl font-bold text-accent">
              {entries.filter(e => e.signing_method === 'manual_paper').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Unique Users</p>
            <p className="text-2xl font-bold">
              {new Set(entries.map(e => e.user_id)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.keys(ACTION_LABELS).map(a => (
                    <SelectItem key={a} value={a}>{ACTION_LABELS[a].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={filterMethod} onValueChange={(v) => { setFilterMethod(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="digital">🔐 Digital</SelectItem>
                  <SelectItem value="manual_paper">📄 Manual Paper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Memo No.</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Search transmittal..."
                value={filterMemo}
                onChange={(e) => { setFilterMemo(e.target.value); setPage(0); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>On Behalf Of</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No audit entries found</TableCell></TableRow>
                ) : entries.map((entry) => {
                  const usr = getProfile(entry.user_id);
                  const isExpanded = expandedId === entry.id;
                  const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, color: 'bg-muted text-muted-foreground' };
                  const location = [entry.ip_geolocation_city, entry.ip_geolocation_country].filter(Boolean).join(', ');
                  const isManual = entry.signing_method === 'manual_paper';

                  return (
                    <Collapsible key={entry.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : entry.id)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className={`cursor-pointer hover:bg-muted/50 ${isManual ? 'border-l-4 border-l-accent' : ''}`}>
                            <TableCell className="px-2">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{usr?.full_name || '—'}</TableCell>
                            <TableCell className="text-sm">
                              {entry.on_behalf_of_name ? (
                                <span className="text-accent font-medium">{entry.on_behalf_of_name}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${actionInfo.color}`}>{actionInfo.label}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{entry.transmittal_no || '—'}</TableCell>
                            <TableCell>
                              {entry.signing_method === 'digital' && <Badge variant="outline" className="text-[10px] gap-1">🔐 Digital</Badge>}
                              {entry.signing_method === 'manual_paper' && <Badge className="text-[10px] bg-accent/20 text-accent gap-1">📄 Paper</Badge>}
                              {!entry.signing_method && <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{entry.ip_address || '—'}</TableCell>
                            <TableCell className="text-xs">{location || '—'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs">
                                {DEVICE_ICONS[entry.device_type || ''] || null}
                                <span>{entry.browser || '—'}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                {/* Authentication Factors — full-width, prominent at top */}
                                {(() => {
                                  const af = (entry.details as any)?.auth_factors;
                                  if (!af) {
                                    return (
                                      <div className="col-span-2 md:col-span-4">
                                        <p className="font-bold text-muted-foreground uppercase mb-1">Authentication Factors</p>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {entry.password_verified && (
                                            <Badge variant="outline" className="text-[10px] gap-1">
                                              <KeyRound className="h-3 w-3" /> Password
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                            (legacy entry — no detailed factor record)
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="col-span-2 md:col-span-4">
                                      <p className="font-bold text-muted-foreground uppercase mb-1">Authentication Factors</p>
                                      <div className="flex gap-1.5 flex-wrap items-center">
                                        {af.signature?.applied && (
                                          <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 bg-emerald-500/5">
                                            <Pen className="h-3 w-3" /> Signature applied
                                          </Badge>
                                        )}
                                        {af.password?.verified && (
                                          <Badge variant="outline" className="text-[10px] gap-1 border-blue-500/40 text-blue-700 bg-blue-500/5">
                                            <KeyRound className="h-3 w-3" /> Password verified
                                          </Badge>
                                        )}
                                        {af.mfa?.verified ? (
                                          <Badge variant="outline" className="text-[10px] gap-1 border-violet-500/40 text-violet-700 bg-violet-500/5">
                                            <ShieldCheck className="h-3 w-3" />
                                            MFA: {af.mfa.method ? af.mfa.method.replace(/_/g, ' ') : 'verified'}
                                            {af.mfa.upn ? ` (${af.mfa.upn})` : ''}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                                            <Shield className="h-3 w-3" /> MFA not required
                                          </Badge>
                                        )}
                                        {af.manual_paper && (
                                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-700 bg-amber-500/5">
                                            <FileText className="h-3 w-3" />
                                            Manual paper{af.manual_paper.registered_by_name ? ` by ${af.manual_paper.registered_by_name}` : ''}
                                          </Badge>
                                        )}
                                        {af.mfa?.verified_at && (
                                          <span className="text-[10px] text-muted-foreground ml-1">
                                            MFA verified at {format(new Date(af.mfa.verified_at), 'dd MMM HH:mm:ss')}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase mb-1">User Agent</p>
                                  <p className="break-all">{entry.user_agent_raw || '—'}</p>
                                </div>
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase mb-1">OS</p>
                                  <p>{entry.os || '—'}</p>
                                </div>
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase mb-1">Session ID</p>
                                  <p className="font-mono">{entry.session_id || '—'}</p>
                                </div>
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase mb-1">Action Detail</p>
                                  <p>{entry.action_detail || '—'}</p>
                                </div>
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase mb-1">Previous → New Status</p>
                                  <p>{entry.previous_status || '—'} → {entry.new_status || '—'}</p>
                                </div>
                                {entry.notes && (
                                  <div className="col-span-2">
                                    <p className="font-bold text-muted-foreground uppercase mb-1">Notes</p>
                                    <p>{entry.notes}</p>
                                  </div>
                                )}
                                {entry.scan_attachment_url && (
                                  <div>
                                    <p className="font-bold text-muted-foreground uppercase mb-1">Scan</p>
                                    <a href={entry.scan_attachment_url} target="_blank" rel="noopener" className="text-primary underline">View Scan</a>
                                  </div>
                                )}
                                {entry.details && typeof entry.details === 'object' && (
                                  <div className="col-span-2">
                                    <p className="font-bold text-muted-foreground uppercase mb-1">Extra Details</p>
                                    <pre className="text-[10px] bg-background rounded p-2 overflow-auto max-h-32">{JSON.stringify(entry.details, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
