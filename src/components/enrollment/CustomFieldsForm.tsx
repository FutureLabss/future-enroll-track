import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Upload, Loader2, ImageIcon } from 'lucide-react';

interface CustomField {
  id: string;
  label: string;
  key: string;
  field_type: string;
  required: boolean;
  options: any;
  sort_order: number;
}

interface CustomFieldsFormProps {
  fields: CustomField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

// Group fields by category. profile_photo always goes first in basic info.
function groupFields(fields: CustomField[]) {
  const groups: { title: string; fields: CustomField[] }[] = [
    { title: 'Basic Personal Information', fields: [] },
    { title: 'Education Background', fields: [] },
    { title: 'Employment Status', fields: [] },
    { title: 'Training Program Information', fields: [] },
    { title: 'Demographic Information', fields: [] },
  ];

  for (const f of fields) {
    if (f.key === 'profile_photo' || f.sort_order <= 6) groups[0].fields.push(f);
    else if (f.sort_order <= 10) groups[1].fields.push(f);
    else if (f.sort_order <= 13) groups[2].fields.push(f);
    else if (f.sort_order <= 16) groups[3].fields.push(f);
    else groups[4].fields.push(f);
  }

  // Ensure profile_photo is the first field in basic info
  groups[0].fields.sort((a, b) => {
    if (a.key === 'profile_photo') return -1;
    if (b.key === 'profile_photo') return 1;
    return a.sort_order - b.sort_order;
  });

  return groups.filter(g => g.fields.length > 0);
}

export function CustomFieldsForm({ fields, values, onChange }: CustomFieldsFormProps) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const groups = groupFields(fields);

  const handleFileUpload = async (key: string, file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }
    setUploadingKey(key);
    try {
      const ext = file.name.split('.').pop();
      const path = `${key}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('student-photos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('student-photos').getPublicUrl(path);
      onChange(key, urlData.publicUrl);
      toast.success('Photo uploaded');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploadingKey(null);
    }
  };

  const renderField = (field: CustomField) => {
    const value = values[field.key] || '';
    const options: string[] = Array.isArray(field.options) ? field.options : [];

    switch (field.field_type) {
      case 'file':
        return (
          <div className="mt-1.5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {value ? (
                  <img src={value} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm font-medium transition-colors">
                  {uploadingKey === field.key ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> {value ? 'Change Photo' : 'Upload Photo'}</>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingKey === field.key}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(field.key, f);
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG. Max 5MB.</p>
              </div>
            </div>
          </div>
        );
      case 'select':
        return (
          <Select value={value} onValueChange={v => onChange(field.key, v)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'textarea':
        return (
          <Textarea
            required={field.required}
            value={value}
            onChange={e => onChange(field.key, e.target.value)}
            className="mt-1.5"
            placeholder={`Enter ${field.label.toLowerCase()}`}
            rows={3}
          />
        );
      case 'date':
        return (
          <Input
            required={field.required}
            type="date"
            value={value}
            onChange={e => onChange(field.key, e.target.value)}
            className="mt-1.5"
          />
        );
      case 'number':
        return (
          <Input
            required={field.required}
            type="number"
            value={value}
            onChange={e => onChange(field.key, e.target.value)}
            className="mt-1.5"
          />
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2 mt-1.5">
            <Checkbox
              checked={value === 'true'}
              onCheckedChange={checked => onChange(field.key, String(checked))}
            />
            <span className="text-sm text-foreground">{field.label}</span>
          </div>
        );
      default:
        return (
          <Input
            required={field.required}
            value={value}
            onChange={e => onChange(field.key, e.target.value)}
            className="mt-1.5"
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
    }
  };

  // Conditional visibility: only show current_academic_level when highest_education is SIWES/IT
  const isFieldVisible = (field: CustomField) => {
    if (field.key === 'current_academic_level') {
      return values['highest_education'] === 'SIWES/IT (Internship)';
    }
    return true;
  };

  return (
    <>
      {groups.map(group => {
        const visibleFields = group.fields.filter(isFieldVisible);
        if (visibleFields.length === 0) return null;
        return (
          <div key={group.title} className="border-t border-border pt-6">
            <h2 className="font-heading font-semibold text-lg text-foreground mb-4">{group.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleFields.map(field => (
                <div
                  key={field.id}
                  className={
                    field.field_type === 'textarea' || field.field_type === 'file'
                      ? 'sm:col-span-2'
                      : ''
                  }
                >
                  {field.field_type !== 'checkbox' && (
                    <Label>{field.label} {field.required && '*'}</Label>
                  )}
                  {renderField(field)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
