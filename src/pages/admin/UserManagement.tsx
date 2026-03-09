import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { UserPlus, Pencil, UserX, UserCheck } from 'lucide-react';
import { Constants } from '@/integrations/supabase/types';

type AppRole = 'admin' | 'department_head' | 'staff' | 'approver';
const ALL_ROLES = Constants.public.Enums.app_role as readonly AppRole[];

const UserManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(['staff']);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email,
          password,
          full_name: fullName,
          role: selectedRoles[0],
          department_id: departmentId || null,
          job_title: jobTitle || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (selectedRoles.length > 1) {
        for (const role of selectedRoles.slice(1)) {
          await supabase.functions.invoke('create-user', {
            body: { _assign_role_only: true, user_id: data.user_id, role },
          });
        }
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({ title: 'User created successfully' });
      resetForm();
    },
    onError: (e: Error) => toast({ title: 'Error creating user', description: e.message, variant: 'destructive' }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'update_user',
          user_id: editUserId,
          full_name: fullName,
          email,
          password: password || undefined,
          department_id: departmentId || null,
          job_title: jobTitle || null,
          roles: selectedRoles,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({ title: 'User updated successfully' });
      resetForm();
    },
    onError: (e: Error) => toast({ title: 'Error updating user', description: e.message, variant: 'destructive' }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !isActive })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['profiles-all'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: isActive ? 'User deactivated' : 'User reactivated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setOpen(false);
    setEditUserId(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setDepartmentId('');
    setJobTitle('');
    setSelectedRoles(['staff']);
  };

  const openEdit = (profile: typeof profiles[0]) => {
    setEditUserId(profile.user_id);
    setFullName(profile.full_name);
    setEmail(profile.email);
    setPassword('');
    setDepartmentId(profile.department_id || '');
    setJobTitle(profile.job_title || '');
    const userRoles = getUserRoles(profile.user_id) as AppRole[];
    setSelectedRoles(userRoles.length > 0 ? userRoles : ['staff']);
    setOpen(true);
  };

  const toggleRole = (role: AppRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const getUserRoles = (userId: string) =>
    allRoles.filter(r => r.user_id === userId).map(r => r.role);

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'department_head': return 'default';
      case 'approver': return 'secondary';
      default: return 'outline';
    }
  };

  const isEditing = !!editUserId;
  const isSaving = createUserMutation.isPending || updateUserMutation.isPending;

  const handleSave = () => {
    if (isEditing) {
      updateUserMutation.mutate();
    } else {
      createUserMutation.mutate();
    }
  };

  const canSave = isEditing
    ? !!fullName && !!email && (!password || password.length >= 6)
    : !!fullName && !!email && !!password && password.length >= 6;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm">Create and manage system users</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Create User</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit User' : 'Create New User'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ahmed Al Sabah" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@alhamra.com.kw" />
              </div>
              <div className="space-y-2">
                <Label>{isEditing ? 'New Password (leave blank to keep current)' : 'Password'}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEditing ? 'Leave blank to keep current' : 'Minimum 6 characters'} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Job Title</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Engineer" />
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-secondary/50 cursor-pointer">
                      <Checkbox checked={selectedRoles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                      <span className="text-sm capitalize">{role.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={!canSave || isSaving}
              >
                {isSaving ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : profiles.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users yet</TableCell></TableRow>
              ) : profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
                  <TableCell>{departments.find(d => d.id === p.department_id)?.name || '—'}</TableCell>
                  <TableCell>{p.job_title || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {getUserRoles(p.user_id).map(role => (
                        <Badge key={role} variant={roleBadgeVariant(role) as any} className="text-xs capitalize">
                          {role.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActiveMutation.mutate({ userId: p.user_id, isActive: p.is_active })}
                        title={p.is_active ? 'Deactivate user' : 'Reactivate user'}
                      >
                        {p.is_active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-[hsl(var(--success))]" />}
                      </Button>
                    </div>
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

export default UserManagement;
