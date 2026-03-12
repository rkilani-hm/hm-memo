import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ChevronDown } from 'lucide-react';

interface Profile {
  user_id: string;
  full_name: string;
  job_title: string | null;
}

interface UserMultiSelectProps {
  profiles: Profile[];
  selected: string[];
  onChange: (selected: string[]) => void;
  excludeUserIds?: string[];
  placeholder?: string;
}

const UserMultiSelect = ({ profiles, selected, onChange, excludeUserIds = [], placeholder = 'Select users...' }: UserMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const available = profiles.filter(
    (p) => !excludeUserIds.includes(p.user_id) && !selected.includes(p.user_id)
  );

  const filtered = search
    ? available.filter((p) =>
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.job_title || '').toLowerCase().includes(search.toLowerCase())
      )
    : available;

  const toggle = (userId: string) => {
    if (selected.includes(userId)) {
      onChange(selected.filter((id) => id !== userId));
    } else {
      onChange([...selected, userId]);
    }
    setSearch('');
  };

  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap gap-1 min-h-[32px] items-center border border-input rounded-md px-2 py-1 cursor-pointer bg-background"
        onClick={() => setOpen(!open)}
      >
        {selected.map((uid) => {
          const p = getProfile(uid);
          return (
            <Badge key={uid} variant="secondary" className="text-xs gap-1 pr-1">
              {p?.full_name || 'Unknown'}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(uid); }}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {selected.length === 0 && (
          <span className="text-sm text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-input rounded-md bg-popover shadow-md max-h-48 overflow-auto">
          <div className="p-1.5 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-7 text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2 text-center">No users found</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.user_id}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent/50 flex justify-between items-center"
                onClick={(e) => { e.stopPropagation(); toggle(p.user_id); }}
              >
                <span>{p.full_name}</span>
                <span className="text-xs text-muted-foreground">{p.job_title || ''}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default UserMultiSelect;
