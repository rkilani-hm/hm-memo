import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Bell, Clock, Send, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const ReminderSettings = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!hasRole('admin')) {
    navigate('/');
    return null;
  }

  const { data: slaSettings, isLoading: slaLoading } = useQuery({
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

  const { data: remindersLog = [] } = useQuery({
    queryKey: ['reminders-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders_log' as any)
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name');
      return data || [];
    },
  });

  const [slaHours, setSlaHours] = useState<number | null>(null);
  const [reminderHour, setReminderHour] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const displaySla = slaHours ?? (slaSettings as any)?.sla_hours ?? 48;
  const displayHour = reminderHour ?? (slaSettings as any)?.reminder_time_hour ?? 8;

  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!slaSettings) return;
      const { error } = await supabase
        .from('kpi_sla_settings' as any)
        .update({
          sla_hours: displaySla,
          reminder_time_hour: displayHour,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        } as any)
        .eq('id', (slaSettings as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-settings'] });
      toast({ title: 'Settings Updated' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const sendRemindersNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('reminder-overdue-approvals');
      if (error) throw error;
      toast({
        title: 'Reminders Sent',
        description: `${(data as any)?.reminders_sent || 0} reminder(s) sent to approvers.`,
      });
      queryClient.invalidateQueries({ queryKey: ['reminders-log'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const getProfileName = (userId: string) => {
    return profiles.find((p: any) => p.user_id === userId)?.full_name || userId.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reminder & SLA Settings</h1>
        <p className="text-sm text-muted-foreground">Configure daily reminders and SLA thresholds</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> SLA Configuration</CardTitle>
            <CardDescription>Set the approval SLA threshold and daily reminder time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>SLA Threshold (hours)</Label>
              <Input
                type="number"
                min={1}
                max={720}
                value={displaySla}
                onChange={e => setSlaHours(parseInt(e.target.value) || 48)}
              />
              <p className="text-xs text-muted-foreground">Approvals taking longer than this are marked overdue</p>
            </div>
            <div className="space-y-2">
              <Label>Daily Reminder Time (hour, Kuwait time)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={displayHour}
                onChange={e => setReminderHour(parseInt(e.target.value) || 8)}
              />
              <p className="text-xs text-muted-foreground">0-23 format. Default: 8 (8:00 AM)</p>
            </div>
            <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
              Save Settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" /> Manual Trigger</CardTitle>
            <CardDescription>Send reminders to all approvers with overdue pending memos</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={sendRemindersNow} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Send Reminders Now
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Reminders Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminders Log</CardTitle>
          <CardDescription>History of sent reminders</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Approver</TableHead>
                <TableHead>Memos Included</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remindersLog.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No reminders sent yet</TableCell></TableRow>
              ) : (
                remindersLog.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{getProfileName(r.approver_user_id)}</TableCell>
                    <TableCell><Badge variant="secondary">{(r.memo_ids || []).length} memos</Badge></TableCell>
                    <TableCell><Badge variant="outline">{r.delivery_method}</Badge></TableCell>
                    <TableCell className="text-sm">{format(parseISO(r.sent_at), 'dd MMM yyyy HH:mm')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReminderSettings;
