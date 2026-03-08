import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CustomFieldsForm } from '@/components/enrollment/CustomFieldsForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function CompleteProfileBanner() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [completedFieldCount, setCompletedFieldCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Get student's enrollments
      const { data: enrs } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', user.id);
      setEnrollments(enrs || []);

      // Get required custom fields
      const { data: fields } = await supabase
        .from('custom_fields')
        .select('*')
        .eq('active', true)
        .eq('visible_to_student', true)
        .order('sort_order');
      setCustomFields(fields || []);

      if (enrs?.length && fields?.length) {
        // Check existing field values for the first enrollment
        const { data: existing } = await supabase
          .from('field_values')
          .select('field_id, value')
          .eq('enrollment_id', enrs[0].id);

        const existingMap: Record<string, string> = {};
        let filled = 0;
        (existing || []).forEach(fv => {
          const field = fields.find(f => f.id === fv.field_id);
          if (field && fv.value) {
            existingMap[field.key] = fv.value;
            filled++;
          }
        });
        setCustomValues(existingMap);
        setCompletedFieldCount(filled);
      }

      setLoading(false);
    };

    load();
  }, [user]);

  if (loading || !enrollments.length || !customFields.length) return null;

  const requiredFields = customFields.filter(f => f.required);
  const allRequiredFilled = requiredFields.every(f => customValues[f.key]?.trim());
  const isComplete = completedFieldCount >= customFields.length;

  if (isComplete) return null;

  const handleSave = async () => {
    const missingFields = requiredFields.filter(f => !customValues[f.key]?.trim());
    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      // Save for all enrollments
      for (const enrollment of enrollments) {
        // Delete existing values first
        await supabase
          .from('field_values')
          .delete()
          .eq('enrollment_id', enrollment.id);

        const fieldValues = customFields
          .filter(f => customValues[f.key])
          .map(f => ({
            enrollment_id: enrollment.id,
            field_id: f.id,
            value: customValues[f.key],
          }));

        if (fieldValues.length > 0) {
          const { error } = await supabase.from('field_values').insert(fieldValues);
          if (error) throw error;
        }
      }

      setCompletedFieldCount(customFields.length);
      setOpen(false);
      toast.success('Profile information saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6 p-4 rounded-xl border border-warning/30 bg-warning/5 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Complete your profile information</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Please fill in the required fields to complete your enrollment.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Complete Now
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading">Complete Your Profile</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Fill in the information below to complete your enrollment profile.
            </p>
          </DialogHeader>

          <div className="space-y-2">
            <CustomFieldsForm
              fields={customFields}
              values={customValues}
              onChange={(key, value) => setCustomValues(prev => ({ ...prev, [key]: value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Information'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
