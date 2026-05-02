import { useState, Fragment } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  UserPlus,
  Pencil,
  UserX,
  UserCheck,
  KeyRound,
  Lock,
  MoreHorizontal,
  Search as SearchIcon,
} from 'lucide-react';
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

  // "Set new password" admin dialog (separate from the full edit dialog so
  // admins have a one-click path to reset a forgotten password without
  // touching the user's other fields).
  const [resetPwUser, setResetPwUser] = useState<{ user_id: string; full_name: string; email: string } | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwForceChange, setResetPwForceChange] = useState(true);

  // Search + deactivate-confirmation state
  const [searchQuery, setSearchQuery] = useState('');
  const [deactivateUser, setDeactivateUser] = useState<{
    user_id: string;
    full_name: string;
    is_active: boolean;
  } | null>(null);

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

  const forceResetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ force_password_reset: true })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-all'] });
      toast({ title: 'Password reset required', description: 'User will be forced to reset password at next login.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Direct admin password reset: admin types a new password and the user
  // can immediately use it. Useful when a user has lost access to email
  // (so the email-link recovery flow won't work).
  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetPwUser) throw new Error('No user selected');
      if (resetPwValue.length < 8) throw new Error('New password must be at least 8 characters');
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'update_user',
          user_id: resetPwUser.user_id,
          full_name: resetPwUser.full_name,        // required by edge fn shape
          email: resetPwUser.email,
          password: resetPwValue,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (resetPwForceChange) {
        await supabase
          .from('profiles')
          .update({ force_password_reset: true })
          .eq('user_id', resetPwUser.user_id);
      }

      // Audit log — best effort
      try {
        const { data: { user: actor } } = await supabase.auth.getUser();
        if (actor) {
          await supabase.from('audit_log').insert({
            user_id: actor.id,
            action: 'password_reset_by_admin',
            action_detail: resetPwForceChange ? 'with_force_reset_on_next_login' : 'set_directly',
            on_behalf_of_user_id: resetPwUser.user_id,
            on_behalf_of_name: resetPwUser.full_name,
            notes: `Admin set a new password for ${resetPwUser.email}.${resetPwForceChange ? ' Force-reset enabled.' : ''}`,
          } as any);
        }
      } catch (e) {
        console.warn('audit_log password_reset_by_admin entry failed:', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-all'] });
      toast({
        title: 'Password reset',
        description: `New password set for ${resetPwUser?.full_name}. Share it with them through a secure channel.`,
      });
      setResetPwUser(null);
      setResetPwValue('');
      setResetPwForceChange(true);
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

  // Dispatcher uniqueness: at most one user may hold the
  // finance_dispatcher role. If someone else already has it, we
  // disable the checkbox for the user being edited and show a clear
  // warning. The DB has a partial unique index enforcing this; the
  // UI just makes the constraint visible BEFORE the admin saves.
  const existingDispatcher = allRoles.find((r) => r.role === 'finance_dispatcher');
  const existingDispatcherIsThisUser = existingDispatcher?.user_id === editUserId;
  const someoneElseIsDispatcher = !!existingDispatcher && !existingDispatcherIsThisUser;
  const existingDispatcherProfile = existingDispatcher
    ? profiles.find((p) => p.user_id === existingDispatcher.user_id)
    : null;

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
                  {ALL_ROLES.map((role) => {
                    const isDispatcherRole = (role as string) === 'finance_dispatcher';
                    const blockedByUniqueness = isDispatcherRole && someoneElseIsDispatcher;
                    return (
                      <label
                        key={role}
                        className={`flex items-center gap-2 p-2 rounded border border-border cursor-pointer ${
                          blockedByUniqueness
                            ? 'opacity-60 cursor-not-allowed bg-muted/30'
                            : 'hover:bg-secondary/50'
                        }`}
                      >
                        <Checkbox
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={() => {
                            if (blockedByUniqueness) return;
                            toggleRole(role);
                          }}
                          disabled={blockedByUniqueness}
                        />
                        <span className="text-sm capitalize">{role.replace('_', ' ')}</span>
                      </label>
                    );
                  })}
                </div>
                {someoneElseIsDispatcher && (
                  <div className="text-xs rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-amber-700">
                    <p className="font-medium">Finance Dispatcher already assigned</p>
                    <p className="mt-0.5">
                      The Finance Dispatcher role is currently held by{' '}
                      <strong>{existingDispatcherProfile?.full_name || 'another user'}</strong>
                      {existingDispatcherProfile?.email ? ` (${existingDispatcherProfile.email})` : ''}.
                      Only one user may hold this role at a time. To transfer it, first remove the
                      role from {existingDispatcherProfile?.full_name?.split(' ')[0] || 'them'},
                      then assign it here.
                    </p>
                    <p className="mt-1 text-amber-700/80">
                      For temporary coverage during leave, the dispatcher should set up a
                      time-bounded delegation in their own Settings instead — that doesn't require
                      reassigning the role.
                    </p>
                  </div>
                )}
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
          {/* Search bar — filters in real time across name, email, job title.
              Sits in a thin band above the table, separated by a divider so
              it doesn't crowd the table header. */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or job title..."
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {(() => {
                const total = profiles.length;
                const q = searchQuery.trim().toLowerCase();
                const visible = q
                  ? profiles.filter((p) =>
                      [p.full_name, p.email, p.job_title]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(q)),
                    ).length
                  : total;
                return q ? `${visible} of ${total} users` : `${total} users`;
              })()}
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : profiles.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users yet</TableCell></TableRow>
              ) : (() => {
                const deptMap = new Map(departments.map(d => [d.id, d.name]));
                // Apply search filter first, then sort by department + name.
                const q = searchQuery.trim().toLowerCase();
                const matched = q
                  ? profiles.filter((p) =>
                      [p.full_name, p.email, p.job_title]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(q)),
                    )
                  : profiles;
                if (matched.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No users match &ldquo;{searchQuery}&rdquo;.
                      </TableCell>
                    </TableRow>
                  );
                }
                const sorted = [...matched].sort((a, b) => {
                  const dA = a.department_id ? (deptMap.get(a.department_id) || 'ZZZ') : 'ZZZ';
                  const dB = b.department_id ? (deptMap.get(b.department_id) || 'ZZZ') : 'ZZZ';
                  if (dA !== dB) return dA.localeCompare(dB);
                  return a.full_name.localeCompare(b.full_name);
                });
                let lastDept = '';
                return sorted.map((p) => {
                  const deptName = p.department_id ? (deptMap.get(p.department_id) || 'Unassigned') : 'Unassigned';
                  const showHeader = deptName !== lastDept;
                  lastDept = deptName;
                  return (
                    <Fragment key={p.id}>
                      {showHeader && (
                        <TableRow key={`dept-${deptName}`}>
                          <TableCell colSpan={6} className="bg-muted/50 font-semibold text-sm text-primary py-2">
                            {deptName}
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Inactive rows get a subtle name fade and a badge,
                          but the rest of the row stays fully readable so
                          admins can still review who they're un-deactivating. */}
                      <TableRow>
                        <TableCell className="font-medium pl-8">
                          <span className={!p.is_active ? 'text-muted-foreground' : ''}>
                            {p.full_name}
                          </span>
                          {!p.is_active && (
                            <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.email}</TableCell>
                        <TableCell>{deptName !== 'Unassigned' ? deptName : '—'}</TableCell>
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
                        <TableCell className="text-right">
                          {/* Single dropdown menu replaces the four ghost-icon
                              buttons that previously didn't fit in the column.
                              Each action gets a clear label so admins don't
                              have to guess at icons. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for ${p.full_name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Manage user</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit user details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setResetPwUser({
                                    user_id: p.user_id,
                                    full_name: p.full_name,
                                    email: p.email,
                                  });
                                  setResetPwValue('');
                                  setResetPwForceChange(true);
                                }}
                              >
                                <Lock className="h-4 w-4 mr-2" />
                                Set a new password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => forceResetMutation.mutate(p.user_id)}
                                disabled={p.force_password_reset}
                              >
                                <KeyRound
                                  className={`h-4 w-4 mr-2 ${p.force_password_reset ? 'text-warning' : ''}`}
                                />
                                {p.force_password_reset
                                  ? 'Reset already pending'
                                  : 'Force password reset'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* Deactivate is destructive — open a confirm dialog
                                  rather than firing instantly. Reactivate is safe,
                                  so it fires directly. */}
                              {p.is_active ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setDeactivateUser({
                                      user_id: p.user_id,
                                      full_name: p.full_name,
                                      is_active: p.is_active,
                                    })
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Deactivate user
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    toggleActiveMutation.mutate({
                                      userId: p.user_id,
                                      isActive: p.is_active,
                                    })
                                  }
                                  className="text-[hsl(var(--success))] focus:text-[hsl(var(--success))]"
                                >
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Reactivate user
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Set-new-password admin dialog */}
      <Dialog open={!!resetPwUser} onOpenChange={(o) => { if (!o) { setResetPwUser(null); setResetPwValue(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Set new password
            </DialogTitle>
          </DialogHeader>
          {resetPwUser && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/30 p-3 text-sm">
                Setting a new password for <strong>{resetPwUser.full_name}</strong> ({resetPwUser.email}).
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminNewPw">New password</Label>
                <Input
                  id="adminNewPw"
                  type="password"
                  value={resetPwValue}
                  onChange={(e) => setResetPwValue(e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground">
                  Share the new password with the user through a secure channel (in person, sealed envelope, or signed-in chat). Avoid email.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resetPwForceChange}
                  onChange={(e) => setResetPwForceChange(e.target.checked)}
                />
                Require user to change this password at next login (recommended)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setResetPwUser(null); setResetPwValue(''); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setPasswordMutation.mutate()}
                  disabled={resetPwValue.length < 8 || setPasswordMutation.isPending}
                >
                  {setPasswordMutation.isPending ? 'Saving…' : 'Set password'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation. Reactivation is reversible and fires
          directly from the dropdown; deactivation needs a second click
          because it removes the user's ability to sign in and act on
          memos. The dialog explains exactly what happens and what stays. */}
      <AlertDialog
        open={deactivateUser !== null}
        onOpenChange={(o) => !o && setDeactivateUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {deactivateUser?.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This user will no longer be able to sign in or act on memos.
              Their past memos, signatures, and audit records remain intact
              and visible. You can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivateUser) {
                  toggleActiveMutation.mutate({
                    userId: deactivateUser.user_id,
                    isActive: deactivateUser.is_active,
                  });
                  setDeactivateUser(null);
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
