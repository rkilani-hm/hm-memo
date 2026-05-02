// =====================================================================
// Department × Stage Time Report
// =====================================================================
//
// Reports how long memos spend in each approval stage, broken down by:
//   - Origin department (department of the memo's "from" user)
//   - Team / column the signer fits into (Finance, GM, CEO/Chairman,
//     Department Head, etc.) — derived from signer_roles_at_signing
//   - Individual signer within the team (drill-down)
//
// All times are wall-clock durations: the moment a step starts (i.e.
// the previous step signed, or for parallel reviewers the dispatch
// fired) until the moment the step is signed. Pending steps are
// excluded from time averages — counting them would skew durations
// upward indefinitely.
//
// Dispatch flows handled correctly:
//   - Parallel reviewers (AP / AR / Budget) all start when the
//     dispatcher fires, so per-person times can vary widely.
//   - The team's wall-clock time is MAX(end of all parallel) - start,
//     not the SUM, because the steps overlap in time.
//
// Permissions: this report is rendered inside the admin Approval
// Performance page which is already admin-gated. It uses the same
// pre-fetched approval_steps + memos data, so no new server query.
// =====================================================================

import { useMemo, useState, Fragment } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Building2, Users, Timer, Info } from 'lucide-react';
import {
  DEFAULT_WORKING_HOURS,
  formatWorkingHours,
  workingHoursBetween,
} from '@/lib/working-hours';

type Step = {
  id: string;
  memo_id: string;
  approver_user_id: string | null;
  step_order: number;
  status: string | null;
  signed_at: string | null;
  created_at: string | null;
  signer_roles_at_signing: any;
  parent_dispatch_step_id: string | null;
  is_dispatcher: boolean | null;
  stage_level: string | null;
};
type Memo = {
  id: string;
  department_id: string | null;
  created_at: string | null;
  status: string | null;
};
type Profile = { user_id: string; full_name: string };
type Department = { id: string; name: string };

interface Props {
  steps: Step[];
  memos: Memo[];
  profiles: Profile[];
  departments: Department[];
  // Optional date filter — caller passes the active range so the
  // existing page-level filter applies to this report too.
  dateFromIso?: string | null;
  dateToIso?: string | null;
  // Public holidays as YYYY-MM-DD strings. Excluded from
  // working-hours calculations. Empty / undefined means "no
  // holidays known yet" — the report still works, it just doesn't
  // skip holiday days.
  holidayDates?: string[];
}

// Map a snapshot of signer roles → which "team column" the step belongs in.
// Mirrors finance-dispatch-grid's logic but scoped to reporting buckets.
function teamForStep(step: Step): { key: string; label: string } {
  const snapshot = (step.signer_roles_at_signing as string[] | null) || [];
  const stageLevel = (step.stage_level || '').toLowerCase();

  const has = (r: string) => snapshot.includes(r);

  if (
    has('finance_manager') ||
    has('finance_dispatcher') ||
    has('ap_accountant') ||
    has('ar_accountant') ||
    has('budget_controller') ||
    has('finance')
  ) {
    return { key: 'finance', label: 'Finance' };
  }
  if (has('general_manager') || has('gm')) return { key: 'gm', label: 'GM' };
  if (has('ceo') || has('chairman')) return { key: 'ceo', label: 'CEO / Chairman' };
  if (has('department_head')) return { key: 'dept_head', label: 'Department Head' };

  // Fall back on stage_level when snapshot empty/missing
  if (stageLevel.includes('finance')) return { key: 'finance', label: 'Finance' };
  if (stageLevel === 'gm' || stageLevel.includes('general manager')) return { key: 'gm', label: 'GM' };
  if (stageLevel === 'ceo' || stageLevel.includes('ceo') || stageLevel.includes('chairman')) {
    return { key: 'ceo', label: 'CEO / Chairman' };
  }
  if (stageLevel.includes('department') || stageLevel.includes('head')) {
    return { key: 'dept_head', label: 'Department Head' };
  }

  return { key: 'other', label: 'Other / Approver' };
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  if (d < 30) return `${d.toFixed(1)}d`;
  return `${(d / 30).toFixed(1)}mo`;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface PersonRollup {
  userId: string;
  name: string;
  durationsHours: number[];        // wall-clock per step
  durationsWorkHours: number[];    // working-hours per step (Sun-Thu 8-17)
}

interface TeamRollup {
  teamKey: string;
  teamLabel: string;
  // Per-memo team durations (max-of-parallel for dispatched flows).
  // Two parallel arrays — same indices, different time models.
  memoTeamHours: number[];        // wall-clock
  memoTeamWorkHours: number[];    // working-hours
  byPerson: Map<string, PersonRollup>;
}

interface DeptRollup {
  deptId: string;
  deptName: string;
  memoCount: number;
  // teams keyed by team key (finance, gm, ceo, ...)
  teams: Map<string, TeamRollup>;
}

const DepartmentStageTimeReport = ({
  steps, memos, profiles, departments, dateFromIso, dateToIso, holidayDates,
}: Props) => {
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  // Build the working-hours config once per holiday-list change so
  // workingHoursBetween() can skip holiday days. When the admin adds
  // a holiday on the Holidays page, the report re-computes and
  // updates "Avg (work)" without a manual refresh.
  const workConfig = useMemo(() => ({
    ...DEFAULT_WORKING_HOURS,
    excludeDates: new Set(holidayDates || []),
  }), [holidayDates]);

  // ---- Computation ---------------------------------------------------
  const rollups = useMemo<DeptRollup[]>(() => {
    const memoMap = new Map(memos.map((m) => [m.id, m]));
    const fromIso = dateFromIso ? new Date(dateFromIso).toISOString() : null;
    const toIso = dateToIso ? new Date(dateToIso).toISOString() : null;

    // Filter memos by date range (using created_at).
    const memosInScope = memos.filter((m) => {
      if (!m.created_at) return false;
      if (fromIso && m.created_at < fromIso) return false;
      if (toIso && m.created_at > toIso) return false;
      return true;
    });
    const memoIdsInScope = new Set(memosInScope.map((m) => m.id));

    // Group steps by memo
    const stepsByMemo = new Map<string, Step[]>();
    for (const s of steps) {
      if (!memoIdsInScope.has(s.memo_id)) continue;
      const list = stepsByMemo.get(s.memo_id) || [];
      list.push(s);
      stepsByMemo.set(s.memo_id, list);
    }

    // Build department rollups
    const deptRollups = new Map<string, DeptRollup>();
    const ensureDeptRollup = (deptId: string | null): DeptRollup => {
      const id = deptId || '__unassigned';
      let r = deptRollups.get(id);
      if (!r) {
        r = {
          deptId: id,
          deptName: deptId ? (deptMap.get(deptId) || 'Unknown Department') : 'Unassigned',
          memoCount: 0,
          teams: new Map(),
        };
        deptRollups.set(id, r);
      }
      return r;
    };
    const ensureTeamRollup = (dept: DeptRollup, t: { key: string; label: string }): TeamRollup => {
      let r = dept.teams.get(t.key);
      if (!r) {
        r = {
          teamKey: t.key,
          teamLabel: t.label,
          memoTeamHours: [],
          memoTeamWorkHours: [],
          byPerson: new Map(),
        };
        dept.teams.set(t.key, r);
      }
      return r;
    };

    for (const [memoId, memoSteps] of stepsByMemo.entries()) {
      const memo = memoMap.get(memoId);
      if (!memo) continue;

      const dept = ensureDeptRollup(memo.department_id);
      dept.memoCount += 1;

      // Sort steps by step_order to walk timeline.
      const sorted = [...memoSteps].sort((a, b) => a.step_order - b.step_order);

      // For each step, compute its start time:
      //   - parent_dispatch_step_id present? start = parent's signed_at
      //   - else: start = previous step's signed_at, OR memo.created_at for first step
      // End time = signed_at (skip if pending/null).
      const stepStartByStepId = new Map<string, string | null>();

      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        // Dispatch routing events (is_dispatcher) are skipped from the
        // report as their "duration" is the dispatcher's decision time,
        // not approval time. They're still considered when computing
        // start times for spawned reviewer steps via parent_dispatch_step_id.
        if (cur.is_dispatcher) {
          stepStartByStepId.set(cur.id, null);
          continue;
        }

        let startIso: string | null = null;
        if (cur.parent_dispatch_step_id) {
          const parent = sorted.find((s) => s.id === cur.parent_dispatch_step_id);
          startIso = parent?.signed_at || null;
        } else if (i === 0) {
          startIso = memo.created_at;
        } else {
          // Walk backward to find the previous non-dispatcher signed step.
          for (let j = i - 1; j >= 0; j--) {
            const prev = sorted[j];
            if (prev.is_dispatcher) continue;
            if (prev.signed_at) {
              startIso = prev.signed_at;
              break;
            }
          }
          // Fall back to memo.created_at if no previous signed step.
          if (!startIso) startIso = memo.created_at;
        }
        stepStartByStepId.set(cur.id, startIso);
      }

      // Now bucket each completed step into team & person rollups.
      // Track per-team-per-memo end times to compute team totals.
      const teamPerMemoEnds = new Map<string, { start: string; ends: string[] }>();

      for (const step of sorted) {
        if (step.is_dispatcher) continue;
        if (!step.signed_at) continue; // pending — skip from time averages
        if (step.status !== 'approved') continue; // rejected/rework not counted
        const start = stepStartByStepId.get(step.id);
        if (!start) continue;

        const startMs = new Date(start).getTime();
        const endMs = new Date(step.signed_at).getTime();
        const durHours = (endMs - startMs) / 3_600_000;
        if (durHours < 0) continue; // data weirdness — skip
        const durWorkHours = workingHoursBetween(start, step.signed_at, workConfig);

        const team = teamForStep(step);
        const teamRollup = ensureTeamRollup(dept, team);

        // Person-level rollup
        const userId = step.approver_user_id;
        if (userId) {
          let pr = teamRollup.byPerson.get(userId);
          if (!pr) {
            pr = {
              userId,
              name: profileMap.get(userId)?.full_name || 'Unknown',
              durationsHours: [],
              durationsWorkHours: [],
            };
            teamRollup.byPerson.set(userId, pr);
          }
          pr.durationsHours.push(durHours);
          pr.durationsWorkHours.push(durWorkHours);
        }

        // Per-memo team end-time tracker
        const tracker = teamPerMemoEnds.get(team.key) || { start, ends: [] };
        tracker.ends.push(step.signed_at);
        // Keep the EARLIEST start across overlapping parallel steps
        // (different parallel reviewers all start at the same dispatch
        // moment; using the earliest is the correct team-arrival time).
        if (new Date(start).getTime() < new Date(tracker.start).getTime()) {
          tracker.start = start;
        }
        teamPerMemoEnds.set(team.key, tracker);
      }

      // For each team, compute the team's wall-clock + working-hours
      // duration on this memo: max(ends) - start. This handles parallel
      // reviewers correctly (their times overlap; team time is not the
      // sum).
      for (const [teamKey, tracker] of teamPerMemoEnds.entries()) {
        if (tracker.ends.length === 0) continue;
        const startMs = new Date(tracker.start).getTime();
        const lastEndMs = Math.max(...tracker.ends.map((e) => new Date(e).getTime()));
        const durHours = (lastEndMs - startMs) / 3_600_000;
        if (durHours < 0) continue;
        const lastEndIso = new Date(lastEndMs).toISOString();
        const durWorkHours = workingHoursBetween(tracker.start, lastEndIso, workConfig);

        const teamRollup = dept.teams.get(teamKey);
        if (teamRollup) {
          teamRollup.memoTeamHours.push(durHours);
          teamRollup.memoTeamWorkHours.push(durWorkHours);
        }
      }
    }

    // Convert to a sorted array (alphabetical by department).
    return Array.from(deptRollups.values()).sort((a, b) =>
      a.deptName.localeCompare(b.deptName),
    );
  }, [steps, memos, deptMap, profileMap, dateFromIso, dateToIso, workConfig]);

  // ---- UI: collapsible department + team + person hierarchy --------
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const toggleDept = (id: string) =>
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleTeam = (key: string) =>
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const expandAll = () => {
    const allDepts = new Set(rollups.map((d) => d.deptId));
    const allTeams = new Set<string>();
    for (const d of rollups) {
      for (const t of d.teams.keys()) allTeams.add(`${d.deptId}::${t}`);
    }
    setExpandedDepts(allDepts);
    setExpandedTeams(allTeams);
  };
  const collapseAll = () => {
    setExpandedDepts(new Set());
    setExpandedTeams(new Set());
  };

  if (rollups.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
          No memo data in the selected date range.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4 text-primary" />
            Time per stage by originating department
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Click a department to expand teams; click a team to see individuals.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expand all</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Collapse all</Button>
        </div>
      </CardHeader>
      <div className="px-6 pb-3">
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs text-foreground/80">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            <strong>Avg (all)</strong> is wall-clock time including weekends and after-hours.{' '}
            <strong>Avg (work)</strong> counts only working hours: Sun–Thu, 08:00–17:00, excluding configured public holidays. Min and Max are wall-clock.
            Times are formatted as <code>m</code> (minutes), <code>h</code> (hours), <code>d</code> (days), <code>wd</code> (working days = 9 hrs), <code>mo</code> (months).
          </span>
        </div>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36%]">Department / Team / Person</TableHead>
              <TableHead className="text-right">Memos</TableHead>
              <TableHead className="text-right" title="Average wall-clock time, including weekends and after-hours">Avg (all)</TableHead>
              <TableHead className="text-right" title="Average working-hours time. Sun–Thu, 08:00–17:00, excluding public holidays.">Avg (work)</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rollups.map((dept) => {
              const deptExpanded = expandedDepts.has(dept.deptId);
              const teamCount = dept.teams.size;

              // Department-level summary: average across all teams' average
              // memo time. Weighted by memo count to favour departments
              // with more data.
              const allTeamMemoHours: number[] = [];
              const allTeamMemoWorkHours: number[] = [];
              for (const t of dept.teams.values()) {
                allTeamMemoHours.push(...t.memoTeamHours);
                allTeamMemoWorkHours.push(...t.memoTeamWorkHours);
              }
              const deptAvg = avg(allTeamMemoHours);
              const deptAvgWork = avg(allTeamMemoWorkHours);
              const deptMin = allTeamMemoHours.length > 0 ? Math.min(...allTeamMemoHours) : 0;
              const deptMax = allTeamMemoHours.length > 0 ? Math.max(...allTeamMemoHours) : 0;

              return (
                <Fragment key={dept.deptId}>
                  {/* Department row */}
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50 bg-muted/20 font-semibold"
                    onClick={() => toggleDept(dept.deptId)}
                  >
                    <TableCell className="font-semibold">
                      <div className="flex items-center gap-1.5">
                        {deptExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        {dept.deptName}
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {teamCount} team{teamCount === 1 ? '' : 's'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{dept.memoCount}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatHours(deptAvg)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatWorkingHours(deptAvgWork)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(deptMin)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(deptMax)}</TableCell>
                  </TableRow>

                  {/* Teams */}
                  {deptExpanded &&
                    Array.from(dept.teams.values())
                      .sort((a, b) => a.teamLabel.localeCompare(b.teamLabel))
                      .map((team) => {
                        const teamFullKey = `${dept.deptId}::${team.teamKey}`;
                        const teamExpanded = expandedTeams.has(teamFullKey);
                        const teamAvg = avg(team.memoTeamHours);
                        const teamAvgWork = avg(team.memoTeamWorkHours);
                        const teamMin = team.memoTeamHours.length > 0 ? Math.min(...team.memoTeamHours) : 0;
                        const teamMax = team.memoTeamHours.length > 0 ? Math.max(...team.memoTeamHours) : 0;

                        return (
                          <Fragment key={teamFullKey}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => toggleTeam(teamFullKey)}
                            >
                              <TableCell className="pl-10">
                                <div className="flex items-center gap-1.5">
                                  {teamExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm">{team.teamLabel}</span>
                                  <Badge variant="secondary" className="ml-1 text-[10px]">
                                    {team.byPerson.size} {team.byPerson.size === 1 ? 'person' : 'people'}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm">{team.memoTeamHours.length}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatHours(teamAvg)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatWorkingHours(teamAvgWork)}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(teamMin)}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(teamMax)}</TableCell>
                            </TableRow>

                            {/* Persons */}
                            {teamExpanded &&
                              Array.from(team.byPerson.values())
                                .sort((a, b) => avg(b.durationsHours) - avg(a.durationsHours))
                                .map((person) => {
                                  const pAvg = avg(person.durationsHours);
                                  const pAvgWork = avg(person.durationsWorkHours);
                                  const pMin = person.durationsHours.length > 0 ? Math.min(...person.durationsHours) : 0;
                                  const pMax = person.durationsHours.length > 0 ? Math.max(...person.durationsHours) : 0;
                                  return (
                                    <TableRow key={person.userId} className="hover:bg-muted/20">
                                      <TableCell className="pl-20 text-sm text-foreground/85">
                                        {person.name}
                                      </TableCell>
                                      <TableCell className="text-right text-sm text-muted-foreground">
                                        {person.durationsHours.length}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-xs">{formatHours(pAvg)}</TableCell>
                                      <TableCell className="text-right font-mono text-xs">{formatWorkingHours(pAvgWork)}</TableCell>
                                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(pMin)}</TableCell>
                                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatHours(pMax)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                          </Fragment>
                        );
                      })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default DepartmentStageTimeReport;
