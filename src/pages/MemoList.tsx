import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDepartments, fetchProfiles } from '@/lib/memo-api';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FilePlus, Search, ChevronDown, Building2, UserCheck, Globe2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useMemo } from 'react';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  in_review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  rework: 'bg-accent/10 text-accent',
};

const MemoList = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptOpen, setDeptOpen] = useState(true);
  const [assignedOpen, setAssignedOpen] = useState(true);
  const [crossDeptOpen, setCrossDeptOpen] = useState(true);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: memos = [], isLoading } = useQuery({
    queryKey: ['memos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch approval steps to know assigned memos
  const { data: myApprovalSteps = [] } = useQuery({
    queryKey: ['my-approval-steps-all', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps')
        .select('memo_id')
        .eq('approver_user_id', user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch cross-dept rules to determine visibility badges
  const { data: crossDeptRules = [] } = useQuery({
    queryKey: ['cross-dept-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cross_department_rules')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
  });

  const userDeptId = profile?.department_id;
  const assignedMemoIds = new Set(myApprovalSteps.map(s => s.memo_id));
  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || '';
  const getDeptCode = (id: string) => departments.find(d => d.id === id)?.code || '';

  // Categorize memos
  const { deptMemos, assignedMemos, crossDeptMemos } = useMemo(() => {
    const dept: typeof memos = [];
    const assigned: typeof memos = [];
    const cross: typeof memos = [];

    for (const m of memos) {
      const isSameDept = m.department_id === userDeptId;
      const isOwner = m.from_user_id === user?.id;
      const isRecipient = m.to_user_id === user?.id;
      const isAssigned = assignedMemoIds.has(m.id);

      if (isSameDept || isOwner) {
        dept.push(m);
      } else if (isRecipient || isAssigned) {
        assigned.push(m);
      } else {
        cross.push(m);
      }
    }
    return { deptMemos: dept, assignedMemos: assigned, crossDeptMemos: cross };
  }, [memos, userDeptId, user?.id, assignedMemoIds]);

  // Determine visibility badge for a memo
  const getVisibilityBadge = (memo: any) => {
    const matchingRules = crossDeptRules.filter(r => {
      const sourceMatch = !r.source_department_ids?.length || r.source_department_ids.includes(memo.department_id);
      const typeMatch = !r.memo_type_filter?.length || memo.memo_types.some((t: any) => (r.memo_type_filter as any[]).includes(t));
      return sourceMatch && typeMatch;
    });

    if (matchingRules.length === 0) {
      return { label: '🏢 Dept Only', variant: 'outline' as const, tooltip: 'Visible to department members only' };
    }

    const viewerDeptNames = matchingRules.map(r => getDeptName(r.viewer_department_id)).filter(Boolean);
    const isCompanyWide = matchingRules.some(r => !r.source_department_ids?.length && !r.memo_type_filter?.length);

    if (isCompanyWide) {
      return { label: '🌐 Company-Wide', variant: 'default' as const, tooltip: `Visible to: ${viewerDeptNames.join(', ')}` };
    }

    if (viewerDeptNames.length === 1) {
      return {
        label: `🏢+${getDeptCode(matchingRules[0].viewer_department_id) || '?'}`,
        variant: 'secondary' as const,
        tooltip: `Also visible to: ${viewerDeptNames[0]}`,
      };
    }

    return {
      label: '👥 Custom',
      variant: 'secondary' as const,
      tooltip: `Also visible to: ${viewerDeptNames.join(', ')}`,
    };
  };

  const filterMemos = (list: typeof memos) =>
    list.filter(m => {
      const matchesSearch = !search ||
        m.transmittal_no.toLowerCase().includes(search.toLowerCase()) ||
        m.subject.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  const MemoTable = ({ memos: list }: { memos: typeof memos }) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground py-4 px-4">No memos in this section.</p>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Transmittal No.</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Visibility</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map(memo => {
            const vis = getVisibilityBadge(memo);
            return (
              <TableRow
                key={memo.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/memos/${memo.id}`)}
              >
                <TableCell className="font-mono text-sm font-medium">{memo.transmittal_no}</TableCell>
                <TableCell className="max-w-[250px] truncate">{memo.subject}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {memo.memo_types.slice(0, 2).map(type => (
                      <Badge key={type} variant="secondary" className="text-xs capitalize">
                        {type.replace('_', ' ')}
                      </Badge>
                    ))}
                    {memo.memo_types.length > 2 && (
                      <Badge variant="secondary" className="text-xs">+{memo.memo_types.length - 2}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${statusColors[memo.status] || ''} capitalize`}>
                    {memo.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={vis.variant} className="text-xs cursor-help">
                        {vis.label}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">{vis.tooltip}</p></TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(memo.created_at), 'dd/MM/yyyy')}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const SectionHeader = ({
    icon: Icon,
    title,
    count,
    open,
    onToggle,
  }: {
    icon: any;
    title: string;
    count: number;
    open: boolean;
    onToggle: () => void;
  }) => (
    <CollapsibleTrigger asChild onClick={onToggle}>
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
    </CollapsibleTrigger>
  );

  const filteredDept = filterMemos(deptMemos);
  const filteredAssigned = filterMemos(assignedMemos);
  const filteredCross = filterMemos(crossDeptMemos);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Memos</h1>
          <p className="text-sm text-muted-foreground">View and manage your memos</p>
        </div>
        <Button onClick={() => navigate('/memos/create')}>
          <FilePlus className="h-4 w-4 mr-2" />
          Create Memo
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by transmittal no. or subject..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="rework">Rework</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Loading memos...</CardContent></Card>
      ) : memos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No memos found</p>
            <Button variant="outline" onClick={() => navigate('/memos/create')}>
              <FilePlus className="h-4 w-4 mr-2" />
              Create your first memo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* My Department */}
          <Card>
            <Collapsible open={deptOpen} onOpenChange={setDeptOpen}>
              <SectionHeader
                icon={Building2}
                title="My Department"
                count={filteredDept.length}
                open={deptOpen}
                onToggle={() => setDeptOpen(!deptOpen)}
              />
              <CollapsibleContent>
                <CardContent className="p-0 border-t">
                  <MemoTable memos={filteredDept} />
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Assigned to Me */}
          <Card>
            <Collapsible open={assignedOpen} onOpenChange={setAssignedOpen}>
              <SectionHeader
                icon={UserCheck}
                title="Assigned to Me"
                count={filteredAssigned.length}
                open={assignedOpen}
                onToggle={() => setAssignedOpen(!assignedOpen)}
              />
              <CollapsibleContent>
                <CardContent className="p-0 border-t">
                  <MemoTable memos={filteredAssigned} />
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Cross-Department Visibility */}
          {filteredCross.length > 0 && (
            <Card>
              <Collapsible open={crossDeptOpen} onOpenChange={setCrossDeptOpen}>
                <SectionHeader
                  icon={Globe2}
                  title="Cross-Department Visibility"
                  count={filteredCross.length}
                  open={crossDeptOpen}
                  onToggle={() => setCrossDeptOpen(!crossDeptOpen)}
                />
                <CollapsibleContent>
                  <CardContent className="p-0 border-t">
                    <MemoTable memos={filteredCross} />
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoList;
