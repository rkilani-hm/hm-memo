import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { FilePlus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  in_review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  rework: 'bg-accent/10 text-accent',
};

const MemoList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  const filteredMemos = memos.filter((m) => {
    const matchesSearch =
      !search ||
      m.transmittal_no.toLowerCase().includes(search.toLowerCase()) ||
      m.subject.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
                onChange={(e) => setSearch(e.target.value)}
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

      {/* Memo Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading memos...</div>
          ) : filteredMemos.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">No memos found</p>
              <Button variant="outline" onClick={() => navigate('/memos/create')}>
                <FilePlus className="h-4 w-4 mr-2" />
                Create your first memo
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transmittal No.</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMemos.map((memo) => (
                  <TableRow
                    key={memo.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/memos/${memo.id}`)}
                  >
                    <TableCell className="font-mono text-sm font-medium">{memo.transmittal_no}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{memo.subject}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {memo.memo_types.slice(0, 2).map((type) => (
                          <Badge key={type} variant="secondary" className="text-xs capitalize">
                            {type.replace('_', ' ')}
                          </Badge>
                        ))}
                        {memo.memo_types.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{memo.memo_types.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[memo.status] || ''} capitalize`}>
                        {memo.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(memo.created_at), 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MemoList;
