// =====================================================================
// Public Holidays admin page
//
// Admins maintain the company's holiday calendar here. Holidays are
// excluded from the working-hours metric in the KPI reports, so a
// memo signed the day after Eid doesn't appear to be a slow response.
//
// Multi-day holidays (e.g. Eid Al-Fitr running 3 days) are stored as
// one row per day. The UI supports adding individual days; the user
// just adds three rows for three days. Could later add a "range"
// shortcut if the manual entry becomes tedious.
// =====================================================================

import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, CalendarDays } from 'lucide-react';

interface Holiday {
  date: string;          // YYYY-MM-DD (postgres DATE serializes this way)
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const formatDateLong = (iso: string): string => {
  // Postgres DATE comes back as "YYYY-MM-DD" — parse as local, not UTC,
  // so days don't shift across timezones.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const HolidaysManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state for the add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null); // YYYY-MM-DD when editing
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const { data: holidays = [], isLoading } = useQuery<Holiday[]>({
    queryKey: ['public-holidays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_holidays' as any)
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      return (data as any[] as Holiday[]) || [];
    },
  });

  const resetForm = () => {
    setEditingDate(null);
    setFormDate('');
    setFormName('');
    setFormDescription('');
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditingDate(h.date);
    setFormDate(h.date);
    setFormName(h.name);
    setFormDescription(h.description || '');
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formDate) throw new Error('Date is required');
      if (!formName.trim()) throw new Error('Name is required');

      const payload = {
        date: formDate,
        name: formName.trim(),
        description: formDescription.trim() || null,
      };

      if (editingDate) {
        // Edit: when the date itself changed, we need to delete the
        // old row and insert the new (DATE is the primary key, so
        // an UPDATE on the date column is fine but cleaner to delete
        // + insert when admins relabel a different day's date).
        if (editingDate !== formDate) {
          const { error: delErr } = await supabase
            .from('public_holidays' as any)
            .delete()
            .eq('date', editingDate);
          if (delErr) throw delErr;
          const { error: insErr } = await supabase
            .from('public_holidays' as any)
            .insert(payload as any);
          if (insErr) throw insErr;
        } else {
          const { error } = await supabase
            .from('public_holidays' as any)
            .update({ name: payload.name, description: payload.description })
            .eq('date', editingDate);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from('public_holidays' as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-holidays'] });
      toast({ title: editingDate ? 'Holiday updated' : 'Holiday added' });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => {
      toast({
        title: 'Could not save',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase
        .from('public_holidays' as any)
        .delete()
        .eq('date', date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-holidays'] });
      toast({ title: 'Holiday removed' });
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      toast({
        title: 'Could not delete',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  // Group by year for easier scanning when the list grows
  const groupedByYear = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const year = h.date.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(h);
    return acc;
  }, {});
  const years = Object.keys(groupedByYear).sort();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Public Holidays
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Days excluded from working-hours KPI calculations. Add each holiday day individually.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add holiday
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Holiday calendar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No holidays yet. Click <strong>Add holiday</strong> to start the calendar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Date</TableHead>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {years.map((year) => (
                  <Fragment key={year}>
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/50 font-semibold text-primary py-2">
                        {year}
                      </TableCell>
                    </TableRow>
                    {groupedByYear[year].map((h) => (
                      <TableRow key={h.date}>
                        <TableCell className="font-mono text-sm pl-6">
                          {formatDateLong(h.date)}
                        </TableCell>
                        <TableCell className="font-medium">{h.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {h.description || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(h)}
                              aria-label={`Edit ${h.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(h)}
                              aria-label={`Delete ${h.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDate ? 'Edit holiday' : 'Add holiday'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-name">Holiday name</Label>
              <Input
                id="holiday-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Eid Al-Fitr Day 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-description">Notes (optional)</Label>
              <Input
                id="holiday-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional context"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formDate || !formName.trim()}
            >
              {saveMutation.isPending ? 'Saving…' : editingDate ? 'Save changes' : 'Add holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The KPI report will count this day as a normal working day again.
              Past calculations are not retroactively changed; this only affects
              future re-aggregations of the report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.date)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HolidaysManagement;
