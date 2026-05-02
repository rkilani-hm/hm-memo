import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Download, Clock, CheckCircle2, XCircle, AlertTriangle, Users, Timer, TrendingUp } from 'lucide-react';
import { format, differenceInHours, differenceInMinutes, parseISO, isWithinInterval } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DepartmentStageTimeReport from '@/components/admin/DepartmentStageTimeReport';

interface ApproverKpi {
  userId: string;
  name: string;
  department: string;
  totalAssigned: number;
  totalApproved: number;
  totalRejected: number;
  totalPending: number;
  avgResponseHours: number;
  fastestResponseHours: number;
  slowestResponseHours: number;
  onTimeRate: number;
  overdueCount: number;
  steps: any[];
}

const ApprovalPerformance = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });

  const { data: allSteps = [], isLoading } = useQuery({
    queryKey: ['kpi-approval-steps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: memos = [] } = useQuery({
    queryKey: ['kpi-memos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('id, transmittal_no, subject, status, department_id, created_at, from_user_id');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: slaSettings } = useQuery({
    queryKey: ['sla-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_sla_settings' as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Holidays — used by the working-hours metric in the time-by-stage
  // report. Empty set is fine; the helper just won't exclude any
  // dates if no holidays are defined yet.
  const { data: holidays = [] } = useQuery({
    queryKey: ['public-holidays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_holidays' as any)
        .select('date');
      if (error) throw error;
      return (data as any[] as { date: string }[]) || [];
    },
  });

  const slaHours = (slaSettings as any)?.sla_hours ?? 48;

  const kpiData = useMemo(() => {
    const memoMap = new Map(memos.map(m => [m.id, m]));
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));

    // Group steps by approver
    const approverMap = new Map<string, any[]>();

    for (const step of allSteps) {
      const memo = memoMap.get(step.memo_id);
      if (!memo) continue;

      // Date filter
      if (dateFrom || dateTo) {
        const stepDate = parseISO(step.created_at);
        const from = dateFrom ? parseISO(dateFrom) : new Date(0);
        const to = dateTo ? new Date(parseISO(dateTo).getTime() + 86400000) : new Date();
        if (!isWithinInterval(stepDate, { start: from, end: to })) continue;
      }

      // Department filter
      if (deptFilter !== 'all' && memo.department_id !== deptFilter) continue;

      const arr = approverMap.get(step.approver_user_id) || [];
      arr.push({ ...step, memo });
      approverMap.set(step.approver_user_id, arr);
    }

    const kpis: ApproverKpi[] = [];

    for (const [userId, steps] of approverMap) {
      const profile = profileMap.get(userId);
      if (!profile) continue;

      const dept = profile.department_id ? departments.find(d => d.id === profile.department_id) : null;

      const approved = steps.filter(s => s.status === 'approved');
      const rejected = steps.filter(s => s.status === 'rejected' || s.status === 'rework');
      const pending = steps.filter(s => s.status === 'pending');

      // Calculate response times for completed steps
      const responseTimes: number[] = [];
      for (const s of [...approved, ...rejected]) {
        if (s.signed_at) {
          const hours = differenceInHours(parseISO(s.signed_at), parseISO(s.created_at));
          responseTimes.push(Math.max(0, hours));
        }
      }

      const avgResponseHours = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;
      const fastestResponseHours = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const slowestResponseHours = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

      // On-time rate: completed within SLA
      const onTimeCount = responseTimes.filter(h => h <= slaHours).length;
      const completedCount = responseTimes.length;
      const onTimeRate = completedCount > 0 ? (onTimeCount / completedCount) * 100 : 100;

      // Overdue: pending beyond SLA
      const now = new Date();
      const overdueCount = pending.filter(s => {
        const hours = differenceInHours(now, parseISO(s.created_at));
        return hours > slaHours;
      }).length;

      kpis.push({
        userId,
        name: profile.full_name,
        department: dept?.name || 'N/A',
        totalAssigned: steps.length,
        totalApproved: approved.length,
        totalRejected: rejected.length,
        totalPending: pending.length,
        avgResponseHours,
        fastestResponseHours,
        slowestResponseHours,
        onTimeRate,
        overdueCount,
        steps,
      });
    }

    // Status filter
    if (statusFilter === 'overdue') {
      return kpis.filter(k => k.overdueCount > 0);
    } else if (statusFilter === 'ontime') {
      return kpis.filter(k => k.onTimeRate >= 80);
    }

    return kpis;
  }, [allSteps, memos, profiles, departments, dateFrom, dateTo, deptFilter, statusFilter, slaHours]);

  // Org-wide totals
  const orgTotals = useMemo(() => {
    return {
      totalAssigned: kpiData.reduce((s, k) => s + k.totalAssigned, 0),
      totalApproved: kpiData.reduce((s, k) => s + k.totalApproved, 0),
      totalRejected: kpiData.reduce((s, k) => s + k.totalRejected, 0),
      totalPending: kpiData.reduce((s, k) => s + k.totalPending, 0),
      avgResponseHours: kpiData.length > 0
        ? kpiData.reduce((s, k) => s + k.avgResponseHours, 0) / kpiData.filter(k => k.avgResponseHours > 0).length || 0
        : 0,
      totalOverdue: kpiData.reduce((s, k) => s + k.overdueCount, 0),
    };
  }, [kpiData]);

  if (!hasRole('admin')) {
    navigate('/');
    return null;
  }

  const toggleRow = (userId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const getOnTimeColor = (rate: number) => {
    if (rate >= 80) return 'text-[hsl(var(--success))]';
    if (rate >= 50) return 'text-[hsl(var(--warning))]';
    return 'text-destructive';
  };

  const getOnTimeBadgeVariant = (rate: number): 'default' | 'secondary' | 'destructive' => {
    if (rate >= 80) return 'default';
    if (rate >= 50) return 'secondary';
    return 'destructive';
  };

  const exportToExcel = () => {
    const headers = ['Approver', 'Department', 'Assigned', 'Approved', 'Rejected', 'Pending', 'Avg Response (hrs)', 'Fastest (hrs)', 'Slowest (hrs)', 'On-Time %', 'Overdue'];
    const rows = kpiData.map(k => [
      k.name, k.department, k.totalAssigned, k.totalApproved, k.totalRejected, k.totalPending,
      k.avgResponseHours.toFixed(1), k.fastestResponseHours.toFixed(1), k.slowestResponseHours.toFixed(1),
      k.onTimeRate.toFixed(1), k.overdueCount,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approval-kpi-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatHours = (h: number) => {
    if (h === 0) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  // Minute-precision elapsed time formatter. Used in the per-step
  // Elapsed column so sub-hour responses ('8m', '45m') render as
  // real values instead of falling through to em-dash. Treats only
  // truly-zero elapsed time as 0m rather than em-dash, since the
  // step actually was signed at the moment it was assigned (rare
  // but technically possible).
  const formatElapsedMinutes = (mins: number) => {
    if (!Number.isFinite(mins) || mins < 0) return '—';
    if (mins < 1) return '0m';
    if (mins < 60) return `${Math.round(mins)}m`;
    const hours = mins / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 14) return `${days.toFixed(1)}d`;
    return `${Math.round(days)}d`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approval Performance</h1>
          <p className="text-sm text-muted-foreground">KPI metrics per approver (SLA: {slaHours}h)</p>
        </div>
        <Button onClick={exportToExcel} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Tabs defaultValue="by-approver" className="space-y-6">
        <TabsList>
          <TabsTrigger value="by-approver">By approver</TabsTrigger>
          <TabsTrigger value="by-stage">Time by department & stage</TabsTrigger>
        </TabsList>

        <TabsContent value="by-approver" className="space-y-6 mt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-3.5 w-3.5" /> Total Assigned</div>
            <p className="text-2xl font-bold text-foreground">{orgTotals.totalAssigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</div>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{orgTotals.totalApproved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><XCircle className="h-3.5 w-3.5" /> Rejected</div>
            <p className="text-2xl font-bold text-destructive">{orgTotals.totalRejected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-3.5 w-3.5" /> Pending</div>
            <p className="text-2xl font-bold text-[hsl(var(--warning))]">{orgTotals.totalPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Timer className="h-3.5 w-3.5" /> Avg Response</div>
            <p className="text-2xl font-bold text-foreground">{formatHours(orgTotals.avgResponseHours)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="h-3.5 w-3.5" /> Overdue</div>
            <p className="text-2xl font-bold text-destructive">{orgTotals.totalOverdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="overdue">Overdue Only</SelectItem>
                  <SelectItem value="ontime">On-Time Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Assigned</TableHead>
                <TableHead className="text-center">Approved</TableHead>
                <TableHead className="text-center">Rejected</TableHead>
                <TableHead className="text-center">Pending</TableHead>
                <TableHead className="text-center">Avg Response</TableHead>
                <TableHead className="text-center">Fastest</TableHead>
                <TableHead className="text-center">Slowest</TableHead>
                <TableHead className="text-center">On-Time %</TableHead>
                <TableHead className="text-center">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : kpiData.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No data found</TableCell></TableRow>
              ) : (
                kpiData.map(k => (
                  <Collapsible key={k.userId} open={expandedRows.has(k.userId)} onOpenChange={() => toggleRow(k.userId)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            {expandedRows.has(k.userId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium">{k.name}</TableCell>
                          <TableCell>{k.department}</TableCell>
                          <TableCell className="text-center">{k.totalAssigned}</TableCell>
                          <TableCell className="text-center text-[hsl(var(--success))]">{k.totalApproved}</TableCell>
                          <TableCell className="text-center text-destructive">{k.totalRejected}</TableCell>
                          <TableCell className="text-center">{k.totalPending}</TableCell>
                          <TableCell className="text-center">{formatHours(k.avgResponseHours)}</TableCell>
                          <TableCell className="text-center">{formatHours(k.fastestResponseHours)}</TableCell>
                          <TableCell className="text-center">{formatHours(k.slowestResponseHours)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={getOnTimeBadgeVariant(k.onTimeRate)} className={getOnTimeColor(k.onTimeRate)}>
                              {k.onTimeRate.toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {k.overdueCount > 0 ? (
                              <Badge variant="destructive">{k.overdueCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={12} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Transmittal No</TableHead>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Assigned</TableHead>
                                    <TableHead>Acted</TableHead>
                                    <TableHead>Elapsed</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {k.steps.slice(0, 20).map((s: any) => {
                                    // Use minutes-precision so steps signed inside
                                    // the same hour show real durations like "12m"
                                    // instead of falling through to "—" (which used
                                    // to happen because differenceInHours returned
                                    // 0 for sub-hour responses and formatHours(0)
                                    // intentionally renders "—").
                                    const startedIso = s.created_at;
                                    const endedIso = s.signed_at;
                                    const isPending = !endedIso;
                                    const elapsedMinutes = isPending
                                      ? differenceInMinutes(new Date(), parseISO(startedIso))
                                      : differenceInMinutes(parseISO(endedIso), parseISO(startedIso));
                                    return (
                                      <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/memos/${s.memo_id}`)}>
                                        <TableCell className="text-xs">{s.memo?.transmittal_no || '—'}</TableCell>
                                        <TableCell className="text-xs max-w-[200px] truncate">{s.memo?.subject || '—'}</TableCell>
                                        <TableCell>
                                          <Badge variant={s.status === 'approved' ? 'default' : s.status === 'pending' ? 'secondary' : 'destructive'} className="text-xs">
                                            {s.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                          {format(parseISO(startedIso), 'dd MMM yyyy HH:mm')}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                          {endedIso ? format(parseISO(endedIso), 'dd MMM yyyy HH:mm') : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap font-mono">
                                          {/* Pending rows show live age in warning color so they're
                                              still distinguishable. Completed rows show the actual
                                              elapsed time in default color. */}
                                          {isPending ? (
                                            <span className="text-[hsl(var(--warning))]">
                                              {formatElapsedMinutes(elapsedMinutes)} (pending)
                                            </span>
                                          ) : (
                                            formatElapsedMinutes(elapsedMinutes)
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                              {k.steps.length > 20 && <p className="text-xs text-muted-foreground mt-2">Showing 20 of {k.steps.length} records</p>}
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="by-stage" className="space-y-6 mt-0">
          <DepartmentStageTimeReport
            steps={allSteps as any}
            memos={memos as any}
            profiles={profiles as any}
            departments={departments as any}
            holidayDates={holidays.map((h: any) => h.date)}
            dateFromIso={dateFrom || null}
            dateToIso={dateTo || null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ApprovalPerformance;
