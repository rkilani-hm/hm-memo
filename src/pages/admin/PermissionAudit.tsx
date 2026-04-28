import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  History,
  Check,
  X,
  Minus,
  Search,
  User as UserIcon,
  Building2,
  Loader2,
  ShieldOff,
} from 'lucide-react';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface AuditRow {
  id: string;
  occurred_at: string;
  scope: 'user' | 'department';
  subject_user_id: string | null;
  subject_dept_id: string | null;
  resource_key: string;
  action: 'granted' | 'denied' | 'reset_to_default' | 'changed';
  old_value: boolean | null;
  new_value: boolean | null;
  changed_by: string | null;
  notes: string | null;
}

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Last 7 days',  days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time',     days: null },
];

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

const PermissionAudit = () => {
  const { hasRole } = useAuth();
  const [search, setSearch]       = useState('');
  const [days, setDays]           = useState<number | null>(30);
  const [actionFilter, setActionFilter] = useState<'all' | 'granted' | 'denied' | 'changed' | 'reset_to_default'>('all');
  const [scopeFilter, setScopeFilter]   = useState<'all' | 'user' | 'department'>('all');

  if (!hasRole('admin')) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <ShieldOff className="h-5 w-5" /> Admin access required.
      </div>
    );
  }

  // Lookups so we can show names rather than UUIDs
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-perm-audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-for-perm-audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, code');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: resources = [] } = useQuery({
    queryKey: ['permission_resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_resources')
        .select('resource_key, label, category')
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const profileById = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const p of profiles) m.set(p.user_id, { name: p.full_name || '—', email: p.email || '' });
    return m;
  }, [profiles]);

  const deptById = useMemo(() => {
    const m = new Map<string, { name: string; code: string }>();
    for (const d of departments as any[]) m.set(d.id, { name: d.name, code: d.code });
    return m;
  }, [departments]);

  const resourceLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of resources as any[]) m.set(r.resource_key, r.label);
    return m;
  }, [resources]);

  // The audit fetch
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['permission_audit', days, scopeFilter, actionFilter],
    queryFn: async () => {
      let q = (supabase as any)
        .from('permission_audit')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        q = q.gte('occurred_at', since.toISOString());
      }
      if (scopeFilter !== 'all') q = q.eq('scope', scopeFilter);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => {
      const subjectName =
        r.scope === 'user'
          ? profileById.get(r.subject_user_id || '')?.name || ''
          : deptById.get(r.subject_dept_id || '')?.name || '';
      const subjectEmail =
        r.scope === 'user'
          ? profileById.get(r.subject_user_id || '')?.email || ''
          : '';
      const actorName = profileById.get(r.changed_by || '')?.name || '';
      const resource = resourceLabel.get(r.resource_key) || r.resource_key;
      return (
        subjectName.toLowerCase().includes(s) ||
        subjectEmail.toLowerCase().includes(s) ||
        actorName.toLowerCase().includes(s) ||
        resource.toLowerCase().includes(s) ||
        r.resource_key.toLowerCase().includes(s)
      );
    });
  }, [rows, search, profileById, deptById, resourceLabel]);

  // Group by user / department for the other tabs
  const byUser = useMemo(() => {
    const m = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      if (r.scope !== 'user' || !r.subject_user_id) continue;
      const arr = m.get(r.subject_user_id) || [];
      arr.push(r);
      m.set(r.subject_user_id, arr);
    }
    return Array.from(m.entries()).sort(
      (a, b) => new Date(b[1][0].occurred_at).getTime() - new Date(a[1][0].occurred_at).getTime(),
    );
  }, [filtered]);

  const byDept = useMemo(() => {
    const m = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      if (r.scope !== 'department' || !r.subject_dept_id) continue;
      const arr = m.get(r.subject_dept_id) || [];
      arr.push(r);
      m.set(r.subject_dept_id, arr);
    }
    return Array.from(m.entries()).sort(
      (a, b) => new Date(b[1][0].occurred_at).getTime() - new Date(a[1][0].occurred_at).getTime(),
    );
  }, [filtered]);

  // ---- Render helpers ---------------------------------------------------

  const SubjectCell = ({ r }: { r: AuditRow }) => {
    if (r.scope === 'user') {
      const p = profileById.get(r.subject_user_id || '');
      return (
        <span className="inline-flex items-center gap-1.5">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{p?.name || '—'}</span>
          {p?.email && <span className="text-[11px] text-muted-foreground">({p.email})</span>}
        </span>
      );
    }
    const d = deptById.get(r.subject_dept_id || '');
    return (
      <span className="inline-flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{d?.name || '—'}</span>
        {d?.code && <span className="text-[11px] text-muted-foreground">({d.code})</span>}
      </span>
    );
  };

  const ActionBadge = ({ r }: { r: AuditRow }) => {
    const map: Record<AuditRow['action'], { label: string; cls: string; icon: React.ReactNode }> = {
      granted: {
        label: 'Granted',
        cls: 'border-emerald-500/40 text-emerald-700 bg-emerald-500/5',
        icon: <Check className="h-3 w-3" />,
      },
      denied: {
        label: 'Denied',
        cls: 'border-red-500/40 text-red-700 bg-red-500/5',
        icon: <X className="h-3 w-3" />,
      },
      changed: {
        label: 'Changed',
        cls: 'border-amber-500/40 text-amber-700 bg-amber-500/5',
        icon: <History className="h-3 w-3" />,
      },
      reset_to_default: {
        label: 'Reset to default',
        cls: 'border-muted text-muted-foreground',
        icon: <Minus className="h-3 w-3" />,
      },
    };
    const v = map[r.action];
    return (
      <Badge variant="outline" className={`text-[10px] gap-1 ${v.cls}`}>
        {v.icon}
        {v.label}
      </Badge>
    );
  };

  const ValueChange = ({ r }: { r: AuditRow }) => {
    const renderState = (v: boolean | null) => {
      if (v === null) return <span className="text-muted-foreground italic">default</span>;
      if (v === true) return <span className="text-emerald-700">allowed</span>;
      return <span className="text-red-700">denied</span>;
    };
    return (
      <span className="text-[11px]">
        {renderState(r.old_value)}
        <span className="mx-1.5 text-muted-foreground">→</span>
        {renderState(r.new_value)}
      </span>
    );
  };

  const ActorCell = ({ id }: { id: string | null }) => {
    if (!id) return <span className="text-muted-foreground italic">—</span>;
    const p = profileById.get(id);
    return p ? <span>{p.name}</span> : <span className="font-mono text-[10px]">{id.slice(0, 8)}…</span>;
  };

  // ---- Renders ---------------------------------------------------------

  const RecentTable = ({ data }: { data: AuditRow[] }) => (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">When</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Changed by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                No permission changes found for the current filter.
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">
                  <div>{formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {format(new Date(r.occurred_at), 'dd MMM yyyy HH:mm:ss')}
                  </div>
                </TableCell>
                <TableCell className="text-xs"><SubjectCell r={r} /></TableCell>
                <TableCell className="text-xs">
                  <div>{resourceLabel.get(r.resource_key) || r.resource_key}</div>
                  <code className="text-[10px] text-muted-foreground">{r.resource_key}</code>
                </TableCell>
                <TableCell><ActionBadge r={r} /></TableCell>
                <TableCell><ValueChange r={r} /></TableCell>
                <TableCell className="text-xs"><ActorCell id={r.changed_by} /></TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  const GroupedView = ({
    groups,
    nameFor,
    icon,
    emptyText,
  }: {
    groups: [string, AuditRow[]][];
    nameFor: (id: string) => string;
    icon: React.ReactNode;
    emptyText: string;
  }) => (
    <div className="space-y-3">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{emptyText}</p>
      ) : (
        groups.map(([id, items]) => (
          <Card key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {icon}
                {nameFor(id)}
                <Badge variant="outline" className="text-[10px]">{items.length} change{items.length === 1 ? '' : 's'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RecentTable data={items} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Permission Audit
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every grant, denial, and reset of access permissions across users and departments. Rows are immutable; written automatically by database triggers.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filters</CardTitle>
          <CardDescription className="text-xs">
            Search matches subject name/email, resource label or key, and the actor who made the change.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(v === 'null' ? null : parseInt(v, 10))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.label} value={r.days === null ? 'null' : String(r.days)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={scopeFilter} onValueChange={(v: any) => setScopeFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="department">Department</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v: any) => setActionFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="granted">Granted</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="changed">Changed</SelectItem>
                <SelectItem value="reset_to_default">Reset to default</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading audit history…
        </div>
      ) : (
        <Tabs defaultValue="recent">
          <TabsList>
            <TabsTrigger value="recent">Recent ({filtered.length})</TabsTrigger>
            <TabsTrigger value="by-user">By User ({byUser.length})</TabsTrigger>
            <TabsTrigger value="by-dept">By Department ({byDept.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="mt-3">
            <RecentTable data={filtered} />
          </TabsContent>

          <TabsContent value="by-user" className="mt-3">
            <GroupedView
              groups={byUser}
              nameFor={(id) => profileById.get(id)?.name || id}
              icon={<UserIcon className="h-4 w-4 text-primary" />}
              emptyText="No user-scope permission changes match the current filter."
            />
          </TabsContent>

          <TabsContent value="by-dept" className="mt-3">
            <GroupedView
              groups={byDept}
              nameFor={(id) => deptById.get(id)?.name || id}
              icon={<Building2 className="h-4 w-4 text-primary" />}
              emptyText="No department-scope permission changes match the current filter."
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default PermissionAudit;
