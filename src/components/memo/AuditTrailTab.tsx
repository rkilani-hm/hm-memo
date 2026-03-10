import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles } from '@/lib/memo-api';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone, Tablet, Globe, MapPin } from 'lucide-react';
import { format } from 'date-fns';

interface AuditTrailTabProps {
  memoId: string;
}

const ACTION_COLORS: Record<string, string> = {
  memo_created: 'border-l-[hsl(var(--info))]',
  memo_drafted: 'border-l-muted-foreground',
  memo_submitted: 'border-l-primary',
  memo_approved: 'border-l-[hsl(var(--success))]',
  memo_rejected: 'border-l-destructive',
  memo_rework: 'border-l-[hsl(var(--warning))]',
  workflow_started: 'border-l-primary',
  manual_signature_registered: 'border-l-accent',
  manual_initial_registered: 'border-l-accent',
  digital_signature_applied: 'border-l-[hsl(var(--success))]',
  digital_initial_applied: 'border-l-[hsl(var(--success))]',
};

const ACTION_ICONS: Record<string, string> = {
  memo_created: '📝',
  memo_drafted: '📝',
  memo_submitted: '📤',
  memo_approved: '✅',
  memo_rejected: '❌',
  memo_rework: '🔄',
  workflow_started: '⚙️',
  manual_signature_registered: '📄',
  manual_initial_registered: '📄',
  digital_signature_applied: '🔐',
  digital_initial_applied: '🔐',
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  Desktop: <Monitor className="h-3 w-3 inline" />,
  Mobile: <Smartphone className="h-3 w-3 inline" />,
  Tablet: <Tablet className="h-3 w-3 inline" />,
};

const AuditTrailTab = ({ memoId }: AuditTrailTabProps) => {
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['memo-audit-trail', memoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('memo_id', memoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!memoId,
  });

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading audit trail...</p>;
  if (entries.length === 0) return <p className="text-center text-muted-foreground py-8">No audit entries for this memo.</p>;

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
        📜 Audit Trail
      </h3>
      <div className="space-y-3">
        {entries.map((entry, idx) => {
          const usr = getProfile(entry.user_id);
          const borderColor = ACTION_COLORS[entry.action] || 'border-l-muted-foreground';
          const icon = ACTION_ICONS[entry.action] || '•';
          const location = [entry.ip_geolocation_city, entry.ip_geolocation_country].filter(Boolean).join(', ');
          const isManual = entry.signing_method === 'manual_paper';

          return (
            <div
              key={entry.id}
              className={`border-l-4 ${borderColor} pl-4 py-3 ${isManual ? 'bg-accent/5 rounded-r-md' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {icon} {entry.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                  <p className="text-sm text-foreground mt-0.5">
                    {usr?.full_name || 'Unknown'} {usr?.job_title ? `(${usr.job_title})` : ''}
                    {entry.signing_method && (
                      <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                        {entry.signing_method === 'digital' ? '🔐 Digital' : '📄 Paper'}
                      </Badge>
                    )}
                  </p>
                  {entry.on_behalf_of_name && (
                    <p className="text-xs text-accent font-medium mt-0.5">
                      On behalf of: {entry.on_behalf_of_name}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.created_at), 'dd MMM yyyy, h:mm a')}
                </p>
              </div>

              {/* Details row */}
              <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted-foreground">
                {entry.ip_address && (
                  <span>IP: {entry.ip_address} {location && `(${location})`}</span>
                )}
                {entry.device_type && (
                  <span className="flex items-center gap-1">
                    {DEVICE_ICONS[entry.device_type]} {entry.browser || entry.device_type}
                  </span>
                )}
              </div>

              {entry.notes && (
                <p className="text-xs mt-1 italic text-muted-foreground">Notes: "{entry.notes}"</p>
              )}
              {entry.scan_attachment_url && (
                <p className="text-xs mt-1">📎 <a href={entry.scan_attachment_url} target="_blank" rel="noopener" className="text-primary underline">Scan attached</a></p>
              )}

              {idx < entries.length - 1 && (
                <div className="border-b border-dashed border-border mt-3" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuditTrailTab;
