import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Database } from '@/integrations/supabase/types';

type MemoType = Database['public']['Enums']['memo_type'];

const MEMO_TYPE_OPTIONS: { value: MemoType; label: string }[] = [
  { value: 'action', label: 'ACTION' },
  { value: 'announcement', label: 'ANNOUNCEMENT' },
  { value: 'review_comments', label: 'REVIEW & COMMENTS' },
  { value: 'payments', label: 'PAYMENTS' },
  { value: 'information', label: 'INFORMATION' },
  { value: 'filing', label: 'FILING' },
  { value: 'use_return', label: 'USE & RETURN' },
  { value: 'request', label: 'REQUEST' },
  { value: 'other', label: 'OTHER' },
];

interface TransmittedForGridProps {
  selected: MemoType[];
  onChange: (types: MemoType[]) => void;
}

const TransmittedForGrid = ({ selected, onChange }: TransmittedForGridProps) => {
  const toggleType = (type: MemoType) => {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Transmitted For
      </Label>
      <div className="grid grid-cols-3 gap-3 p-4 border border-input rounded-md bg-muted/20">
        {MEMO_TYPE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer text-sm hover:text-foreground transition-colors"
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggleType(option.value)}
            />
            <span className="font-medium">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default TransmittedForGrid;
export { MEMO_TYPE_OPTIONS };
export type { MemoType };
