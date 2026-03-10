import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, PenTool, FileText, Users, TrendingUp, Activity } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';

const COLORS = {
  digital: 'hsl(213, 52%, 23%)',    // primary navy
  manual: 'hsl(38, 66%, 48%)',      // accent gold
  success: 'hsl(142, 71%, 35%)',
  info: 'hsl(199, 89%, 48%)',
  warning: 'hsl(38, 92%, 50%)',
  destructive: 'hsl(0, 72%, 51%)',
  muted: 'hsl(213, 15%, 47%)',
};

const PIE_COLORS = [COLORS.digital, COLORS.manual, COLORS.muted];

const AuditDashboard = () => {
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  // Fetch ALL audit entries (up to 1000) for aggregation
  const { data: auditEntries = [], isLoading } = useQuery({
    queryKey: ['audit-dashboard-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  // ---- Compute chart data ----

  // 1. Signing method breakdown (pie)
  const digitalCount = auditEntries.filter(e => e.signing_method === 'digital').length;
  const manualCount = auditEntries.filter(e => e.signing_method === 'manual_paper').length;
  const otherCount = auditEntries.filter(e => !e.signing_method).length;
  const methodPieData = [
    { name: '🔐 Digital', value: digitalCount },
    { name: '📄 Manual', value: manualCount },
    { name: 'Other', value: otherCount },
  ].filter(d => d.value > 0);

  // 2. Actions per user (top 10 bar chart)
  const userActionMap: Record<string, number> = {};
  auditEntries.forEach(e => {
    userActionMap[e.user_id] = (userActionMap[e.user_id] || 0) + 1;
  });
  const actionsPerUser = Object.entries(userActionMap)
    .map(([userId, count]) => ({
      name: getProfile(userId)?.full_name?.split(' ')[0] || userId.slice(0, 8),
      fullName: getProfile(userId)?.full_name || userId,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 3. Daily activity (last 30 days area chart)
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const date = startOfDay(subDays(new Date(), 29 - i));
    return { date, dateStr: format(date, 'dd MMM'), digital: 0, manual: 0, other: 0 };
  });

  auditEntries.forEach(e => {
    const entryDate = format(startOfDay(new Date(e.created_at)), 'dd MMM');
    const dayEntry = last30.find(d => d.dateStr === entryDate);
    if (dayEntry) {
      if (e.signing_method === 'digital') dayEntry.digital++;
      else if (e.signing_method === 'manual_paper') dayEntry.manual++;
      else dayEntry.other++;
    }
  });

  // 4. Action type breakdown
  const actionCounts: Record<string, number> = {};
  auditEntries.forEach(e => {
    actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
  });
  const actionBreakdown = Object.entries(actionCounts)
    .map(([action, count]) => ({ action: formatActionLabel(action), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 5. Stats
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayActions = auditEntries.filter(e => e.created_at.startsWith(todayStr)).length;
  const uniqueUsers = new Set(auditEntries.map(e => e.user_id)).size;
  const delegateActions = auditEntries.filter(e => e.on_behalf_of_user_id).length;

  // 6. Device breakdown
  const deviceCounts: Record<string, number> = {};
  auditEntries.forEach(e => {
    const device = e.device_type || 'Unknown';
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
  });
  const deviceData = Object.entries(deviceCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading audit data...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-accent" />
          Audit Analytics
        </h1>
        <p className="text-muted-foreground text-sm">Activity insights across the last 1,000 audit entries</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase">Total Actions</p>
            </div>
            <p className="text-2xl font-bold">{auditEntries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" />
              <p className="text-xs text-muted-foreground uppercase">Today</p>
            </div>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{todayActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <PenTool className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground uppercase">Digital</p>
            </div>
            <p className="text-2xl font-bold text-primary">{digitalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-accent" />
              <p className="text-xs text-muted-foreground uppercase">Manual</p>
            </div>
            <p className="text-2xl font-bold text-accent">{manualCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-[hsl(var(--info))]" />
              <p className="text-xs text-muted-foreground uppercase">Delegate Actions</p>
            </div>
            <p className="text-2xl font-bold text-[hsl(var(--info))]">{delegateActions}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signing Method Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Signing Method Breakdown</CardTitle>
            <CardDescription>Digital vs Manual paper signing</CardDescription>
          </CardHeader>
          <CardContent>
            {methodPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={methodPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {methodPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No signing data yet</p>
            )}
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ background: COLORS.digital }} />
                Digital
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ background: COLORS.manual }} />
                Manual
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions per User Bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actions per User</CardTitle>
            <CardDescription>Top 10 most active users</CardDescription>
          </CardHeader>
          <CardContent>
            {actionsPerUser.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={actionsPerUser} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-xs">
                          <p className="font-semibold">{d.fullName}</p>
                          <p>{d.count} actions</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" fill={COLORS.digital} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Activity Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Activity — Last 30 Days</CardTitle>
            <CardDescription>Breakdown by signing method</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={last30} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="dateStr"
                  tick={{ fontSize: 10 }}
                  interval={Math.floor(last30.length / 7)}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="digital"
                  stackId="1"
                  stroke={COLORS.digital}
                  fill={COLORS.digital}
                  fillOpacity={0.6}
                  name="Digital"
                />
                <Area
                  type="monotone"
                  dataKey="manual"
                  stackId="1"
                  stroke={COLORS.manual}
                  fill={COLORS.manual}
                  fillOpacity={0.6}
                  name="Manual"
                />
                <Area
                  type="monotone"
                  dataKey="other"
                  stackId="1"
                  stroke={COLORS.muted}
                  fill={COLORS.muted}
                  fillOpacity={0.3}
                  name="Other"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Action Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Action Types</CardTitle>
            <CardDescription>Most frequent audit actions</CardDescription>
          </CardHeader>
          <CardContent>
            {actionBreakdown.length > 0 ? (
              <div className="space-y-2">
                {actionBreakdown.map((item, i) => {
                  const maxCount = actionBreakdown[0].count;
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="truncate font-medium">{item.action}</span>
                        <span className="text-muted-foreground ml-2 shrink-0">{item.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Device Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Device Breakdown</CardTitle>
          <CardDescription>Actions by device type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 flex-wrap">
            {deviceData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <div className="text-center">
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    {d.name === 'Desktop' ? '🖥️' : d.name === 'Mobile' ? '📱' : d.name === 'Tablet' ? '📱' : '❓'} {d.name}
                  </Badge>
                </div>
                <span className="text-lg font-bold">{d.value}</span>
                <span className="text-xs text-muted-foreground">
                  ({auditEntries.length > 0 ? ((d.value / auditEntries.length) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default AuditDashboard;
