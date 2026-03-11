import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles } from '@/lib/memo-api';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, User, Globe } from 'lucide-react';
import { format } from 'date-fns';

interface VersionHistoryProps {
  memoId: string;
}

const VersionHistory = ({ memoId }: VersionHistoryProps) => {
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['memo-versions', memoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memo_versions')
        .select('*')
        .eq('memo_id', memoId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!memoId,
  });

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  if (isLoading) return <p className="text-center text-muted-foreground py-4">Loading versions...</p>;

  if (versions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No version history yet.</p>
        <p className="text-xs mt-1">Edits to this memo will be tracked here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
        <History className="h-4 w-4" /> Version History
      </h3>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-3">
          {versions.map((v: any) => {
            const editor = getProfile(v.changed_by_user_id);
            const changes = v.changes as Record<string, any>;
            const changedFields = Object.keys(changes);

            return (
              <div key={v.id} className="border-l-4 border-l-primary/40 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <User className="h-3 w-3 text-primary" />
                      {editor?.full_name || 'Unknown'}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        v{v.version_number}
                      </Badge>
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {changedFields.map(field => (
                        <p key={field} className="text-xs text-muted-foreground">
                          Changed <span className="font-medium text-foreground">{field.replace('_', ' ')}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(v.created_at), 'dd MMM yyyy, h:mm a')}
                  </p>
                </div>
                {v.ip_address && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Globe className="h-3 w-3" /> {v.ip_address}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default VersionHistory;
