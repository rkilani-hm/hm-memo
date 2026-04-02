import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, GripVertical } from 'lucide-react';

export interface PdfSlotConfig {
  step_indices: number[];
  stacked?: boolean;
}

export interface PdfLayout {
  signoff_step: number | null;
  grid: (PdfSlotConfig | null)[][];
}

export const DEFAULT_PDF_LAYOUT: PdfLayout = {
  signoff_step: null,
  grid: [[null, null, null], [null, null, null], [null, null, null]],
};

interface WorkflowStep {
  approver_user_id: string;
  label: string;
  stage_level?: string;
  action_type?: string;
  parallel_group?: number | null;
}

interface PdfLayoutEditorProps {
  steps: WorkflowStep[];
  layout: PdfLayout;
  onChange: (layout: PdfLayout) => void;
  profiles: { user_id: string; full_name: string }[];
}

const CELL_LABELS = [
  ['Top-Left', 'Top-Middle', 'Top-Right'],
  ['Bottom-Left', 'Bottom-Middle', 'Bottom-Right'],
];

const PdfLayoutEditor = ({ steps, layout, onChange, profiles }: PdfLayoutEditorProps) => {
  const getStepLabel = (idx: number) => {
    const step = steps[idx];
    if (!step) return `Step ${idx + 1}`;
    const prof = profiles.find(p => p.user_id === step.approver_user_id);
    return prof?.full_name || step.label || `Step ${idx + 1}`;
  };

  // Get all step indices already assigned somewhere
  const usedIndices = new Set<number>();
  if (layout.signoff_step !== null) usedIndices.add(layout.signoff_step);
  layout.grid.forEach(row => row.forEach(cell => {
    if (cell) cell.step_indices.forEach(i => usedIndices.add(i));
  }));

  const availableSteps = steps.map((_, i) => i).filter(i => !usedIndices.has(i));

  const updateGrid = (rowIdx: number, colIdx: number, cell: PdfSlotConfig | null) => {
    const newGrid = layout.grid.map((row, ri) =>
      row.map((c, ci) => (ri === rowIdx && ci === colIdx ? cell : c))
    );
    onChange({ ...layout, grid: newGrid });
  };

  const addStepToCell = (rowIdx: number, colIdx: number, stepIdx: number) => {
    const existing = layout.grid[rowIdx][colIdx];
    if (existing) {
      updateGrid(rowIdx, colIdx, {
        ...existing,
        step_indices: [...existing.step_indices, stepIdx],
      });
    } else {
      updateGrid(rowIdx, colIdx, { step_indices: [stepIdx], stacked: false });
    }
  };

  const removeStepFromCell = (rowIdx: number, colIdx: number, stepIdx: number) => {
    const existing = layout.grid[rowIdx][colIdx];
    if (!existing) return;
    const newIndices = existing.step_indices.filter(i => i !== stepIdx);
    if (newIndices.length === 0) {
      updateGrid(rowIdx, colIdx, null);
    } else {
      updateGrid(rowIdx, colIdx, { ...existing, step_indices: newIndices });
    }
  };

  const toggleStacked = (rowIdx: number, colIdx: number) => {
    const existing = layout.grid[rowIdx][colIdx];
    if (existing) {
      updateGrid(rowIdx, colIdx, { ...existing, stacked: !existing.stacked });
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">PDF Approval Layout</Label>
      <p className="text-xs text-muted-foreground">
        Assign workflow steps to PDF grid slots. Each template must have its own layout.
      </p>

      {/* Sign-off step */}
      <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
        <Label className="text-sm font-medium">Sign-off Block (right-aligned, in memo body)</Label>
        <Select
          value={layout.signoff_step !== null ? String(layout.signoff_step) : '__none__'}
          onValueChange={(v) => {
            onChange({
              ...layout,
              signoff_step: v === '__none__' ? null : parseInt(v),
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">None</SelectItem>
            {steps.map((_, i) => {
              const isUsedElsewhere = usedIndices.has(i) && layout.signoff_step !== i;
              if (isUsedElsewhere) return null;
              return (
                <SelectItem key={i} value={String(i)} className="text-xs">
                  #{i + 1} — {getStepLabel(i)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Approvals Grid */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Approvals Grid (3×2)</Label>
        <div className="border rounded-lg overflow-hidden">
          {/* Red header */}
          <div className="bg-destructive text-destructive-foreground text-center py-1.5 text-xs font-bold tracking-widest uppercase">
            Approvals
          </div>
          <div className="grid grid-cols-3 gap-0">
            {layout.grid.map((row, rowIdx) =>
              row.map((cell, colIdx) => (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className="border p-2 min-h-[100px] flex flex-col gap-1 bg-background"
                >
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    {CELL_LABELS[rowIdx][colIdx]}
                  </p>

                  {/* Assigned steps */}
                  {cell?.step_indices.map((si) => (
                    <div key={si} className="flex items-center gap-1 text-xs">
                      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Badge variant="secondary" className="text-[10px] py-0 px-1 truncate max-w-[100px]">
                        #{si + 1} {getStepLabel(si).split(' ')[0]}
                      </Badge>
                      <button
                        className="text-destructive hover:text-destructive/80 shrink-0"
                        onClick={() => removeStepFromCell(rowIdx, colIdx, si)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Stacked toggle */}
                  {cell && cell.step_indices.length > 1 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Switch
                        checked={cell.stacked || false}
                        onCheckedChange={() => toggleStacked(rowIdx, colIdx)}
                        className="scale-75"
                      />
                      <span className="text-[9px] text-muted-foreground">Stack</span>
                    </div>
                  )}

                  {/* Add step dropdown */}
                  {availableSteps.length > 0 && (
                    <Select
                      value=""
                      onValueChange={(v) => addStepToCell(rowIdx, colIdx, parseInt(v))}
                    >
                      <SelectTrigger className="h-6 text-[10px] mt-auto w-full">
                        <SelectValue placeholder="+ Add step" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSteps.map((si) => (
                          <SelectItem key={si} value={String(si)} className="text-xs">
                            #{si + 1} — {getStepLabel(si)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfLayoutEditor;
