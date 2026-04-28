import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInvalidatePermissions } from '@/hooks/usePermissions';
import { routeAccessRules } from '@/lib/route-access-rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, Building2, Users, Check, X, Minus, Route as RouteIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Authorization = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidatePermissions = useInvalidatePermissions();
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const { data: resources = [] } = useQuery({
    queryKey: ['permission_resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_resources')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, job_title, department_id, is_active')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: deptPerms = [] } = useQuery({
    queryKey: ['department_permissions', selectedDeptId],
    queryFn: async () => {
      if (!selectedDeptId) return [];
      const { data, error } = await supabase
        .from('department_permissions')
        .select('*')
        .eq('department_id', selectedDeptId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDeptId,
  });

  const { data: userPerms = [] } = useQuery({
    queryKey: ['user_permissions', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', selectedUserId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUserId,
  });

  // Upsert department permission
  const upsertDeptPerm = useMutation({
    mutationFn: async ({ resourceKey, isAllowed }: { resourceKey: string; isAllowed: boolean | null }) => {
      if (isAllowed === null) {
        // Remove the permission (revert to default)
        const { error } = await supabase
          .from('department_permissions')
          .delete()
          .eq('department_id', selectedDeptId)
          .eq('resource_key', resourceKey);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('department_permissions')
          .upsert(
            { department_id: selectedDeptId, resource_key: resourceKey, is_allowed: isAllowed },
            { onConflict: 'department_id,resource_key' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department_permissions', selectedDeptId] });
      invalidatePermissions();
      toast({ title: 'Permission updated', description: 'Refresh the page if you don\'t see the change applied to navigation immediately.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Upsert user permission
  const upsertUserPerm = useMutation({
    mutationFn: async ({ resourceKey, isAllowed }: { resourceKey: string; isAllowed: boolean | null }) => {
      if (isAllowed === null) {
        const { error } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', selectedUserId)
          .eq('resource_key', resourceKey);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_permissions')
          .upsert(
            { user_id: selectedUserId, resource_key: resourceKey, is_allowed: isAllowed },
            { onConflict: 'user_id,resource_key' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_permissions', selectedUserId] });
      invalidatePermissions();
      toast({ title: 'Permission updated', description: 'The user will see the change after their next page navigation or sign-in.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const pageResources = resources.filter((r) => r.category === 'page');
  const contentResources = resources.filter((r) => r.category === 'content');

  const getDeptPermState = (key: string): boolean | null => {
    const p = deptPerms.find((dp) => dp.resource_key === key);
    return p ? p.is_allowed : null;
  };

  const getUserPermState = (key: string): boolean | null => {
    const p = userPerms.find((up) => up.resource_key === key);
    return p ? p.is_allowed : null;
  };

  const cyclePerm = (current: boolean | null): boolean | null => {
    if (current === null) return false; // default → denied
    if (current === false) return true; // denied → allowed
    return null; // allowed → default (remove)
  };

  const renderPermTable = (
    items: typeof resources,
    getState: (key: string) => boolean | null,
    onToggle: (key: string, val: boolean | null) => void,
    label: string
  ) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</h3>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2 font-medium">Resource</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-center px-4 py-2 font-medium w-32">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((r) => {
              const state = getState(r.resource_key);
              return (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{r.label}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.description}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5"
                      onClick={() => onToggle(r.resource_key, cyclePerm(state))}
                    >
                      {state === null && (
                        <>
                          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Default</span>
                        </>
                      )}
                      {state === true && (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs text-green-600">Allowed</span>
                        </>
                      )}
                      {state === false && (
                        <>
                          <X className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-xs text-destructive">Denied</span>
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Authorization Management</h1>
          <p className="text-sm text-muted-foreground">
            Control page and content access per department or per user. Click to cycle: Default → Denied → Allowed → Default.
          </p>
        </div>
      </div>

      <Tabs defaultValue="department">
        <TabsList>
          <TabsTrigger value="department" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            By Department
          </TabsTrigger>
          <TabsTrigger value="user" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            By User
          </TabsTrigger>
        </TabsList>

        {/* Department tab */}
        <TabsContent value="department" className="space-y-4 mt-4">
          <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select a department..." />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedDeptId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {departments.find((d) => d.id === selectedDeptId)?.name} — Permissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderPermTable(pageResources, getDeptPermState, (key, val) => upsertDeptPerm.mutate({ resourceKey: key, isAllowed: val }), 'Pages')}
                {renderPermTable(contentResources, getDeptPermState, (key, val) => upsertDeptPerm.mutate({ resourceKey: key, isAllowed: val }), 'Content')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* User tab */}
        <TabsContent value="user" className="space-y-4 mt-4">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select a user..." />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => {
                const dept = departments.find((d) => d.id === p.department_id);
                return (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name} — {p.job_title || 'No title'}{dept ? ` (${dept.code})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {selectedUserId && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {profiles.find((p) => p.user_id === selectedUserId)?.full_name} — Permission Overrides
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    User overrides take priority over department defaults
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderPermTable(pageResources, getUserPermState, (key, val) => upsertUserPerm.mutate({ resourceKey: key, isAllowed: val }), 'Pages')}
                {renderPermTable(contentResources, getUserPermState, (key, val) => upsertUserPerm.mutate({ resourceKey: key, isAllowed: val }), 'Content')}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Authorization;
