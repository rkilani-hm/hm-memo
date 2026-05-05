import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  fetchMyTemplates, saveTemplate, type MemoTemplate,
} from '@/lib/vendor-api';
import { BookmarkPlus, FolderOpen, Settings2, Loader2 } from 'lucide-react';

interface TemplateMenuProps {
  // The current memo content. Used when saving as a new template.
  current: {
    subject_text?: string | null;
    body_html?: string | null;
    action_comments?: string | null;
    memo_types?: string[] | null;
  };
  // Called when the user picks a template to apply. The parent decides
  // how to apply (overwrite vs merge — typically with confirmation if
  // the form already has content).
  onApply: (template: MemoTemplate) => void;
}

/**
 * Memo template menu — three actions:
 *   Save current content as a new template
 *   Apply an existing template (replaces current form content)
 *   Manage templates (navigates to /memo-templates)
 *
 * Personal scope only — each user sees only their own templates.
 */
export function MemoTemplateMenu({ current, onApply }: TemplateMenuProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['my-templates'], queryFn: fetchMyTemplates,
  });

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveTemplate({
        name: name.trim(),
        description: description.trim() || null,
        subject_text: current.subject_text || null,
        body_html: current.body_html || null,
        action_comments: current.action_comments || null,
        memo_types: current.memo_types || null,
      });
      toast({ title: 'Template saved', description: `"${name.trim()}" added to your templates.` });
      queryClient.invalidateQueries({ queryKey: ['my-templates'] });
      setSaveOpen(false);
      setName('');
      setDescription('');
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <FolderOpen className="h-4 w-4" />
            Templates
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => setSaveOpen(true)} className="gap-2">
            <BookmarkPlus className="h-4 w-4" /> Save current as template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Apply a template
          </DropdownMenuLabel>
          {isLoading ? (
            <DropdownMenuItem disabled><Loader2 className="h-3 w-3 animate-spin mr-2" />Loading...</DropdownMenuItem>
          ) : templates.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground italic">
              You haven't saved any templates yet.
            </DropdownMenuItem>
          ) : (
            templates.slice(0, 10).map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => onApply(t)}
                className="flex flex-col items-start py-1.5"
              >
                <span className="font-medium text-sm">{t.name}</span>
                {t.description && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-full">
                    {t.description}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/memo-templates')} className="gap-2">
            <Settings2 className="h-4 w-4" /> Manage templates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Saves the current subject, body, action comments, and "transmitted for" types.
              Recipients and workflow are NOT saved — those vary per memo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly status report"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="A note to yourself about when to use this template"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
