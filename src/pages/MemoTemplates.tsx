import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  fetchMyTemplates, saveTemplate, deleteTemplate, type MemoTemplate,
} from '@/lib/vendor-api';
import { ArrowLeft, FolderOpen, Pencil, Trash2, Loader2, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const MemoTemplates = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<MemoTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['my-templates'], queryFn: fetchMyTemplates,
  });

  const handleEdit = (t: MemoTemplate) => {
    setEditing(t);
    setEditName(t.name);
    setEditDescription(t.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editing || !editName.trim()) return;
    setSaving(true);
    try {
      await saveTemplate({
        id: editing.id,
        name: editName.trim(),
        description: editDescription.trim() || null,
        // Don't change the content here — that would be done by re-saving
        // from the memo editor. This dialog is for renaming.
        subject_text: editing.subject_text,
        body_html: editing.body_html,
        action_comments: editing.action_comments,
        memo_types: editing.memo_types,
      });
      toast({ title: 'Updated' });
      queryClient.invalidateQueries({ queryKey: ['my-templates'] });
      setEditing(null);
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteTemplate(id);
      toast({ title: 'Deleted', description: `"${name}" removed.` });
      queryClient.invalidateQueries({ queryKey: ['my-templates'] });
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Strip HTML for the body preview — quick & defensive
  const previewText = (html: string | null): string => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="h-6 w-6 text-primary" />
          My Memo Templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Templates you've saved. Rename or delete them here. To save a new template, use the
          "Save as template" option from the New Memo page.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="font-medium">No templates yet</p>
            <p className="text-xs">
              Open the New Memo page, fill in some content, then click <strong>Templates → Save current as template</strong> to make it reusable.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Updated {format(parseISO(t.updated_at), 'dd MMM yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} className="gap-1 h-7">
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(t.id, t.name)}
                      disabled={deletingId === t.id}
                      className="gap-1 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </Button>
                  </div>
                </div>
                {t.subject_text && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Subject:</span> {t.subject_text}
                  </div>
                )}
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {previewText(t.body_html) || <em>(no body content)</em>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Template</DialogTitle>
            <DialogDescription>
              Update the name and description. To change the content, re-save from the New Memo page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={!editName.trim() || saving} onClick={handleSaveEdit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MemoTemplates;
