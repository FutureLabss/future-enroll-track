import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

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

// Group fields by category based on sort_order ranges
function groupFields(fields: CustomField[]) {
  const groups: { title: string; fields: CustomField[] }[] = [
    { title: 'Basic Personal Information', fields: [] },
    { title: 'Education Background', fields: [] },
    { title: 'Employment Status', fields: [] },
    { title: 'Training Program Information', fields: [] },
    { title: 'Demographic Information', fields: [] },
  ];

  for (const f of fields) {
    if (f.sort_order <= 6) groups[0].fields.push(f);
    else if (f.sort_order <= 10) groups[1].fields.push(f);
    else if (f.sort_order <= 13) groups[2].fields.push(f);
    else if (f.sort_order <= 16) groups[3].fields.push(f);
    else groups[4].fields.push(f);
  }

  return groups.filter(g => g.fields.length > 0);
}

export function CustomFieldsForm({ fields, values, onChange }: CustomFieldsFormProps) {
  const groups = groupFields(fields);

  const renderField = (field: CustomField) => {
    const value = values[field.key] || '';
    const options: string[] = Array.isArray(field.options) ? field.options : [];

    switch (field.field_type) {
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

  return (
    <>
      {groups.map(group => (
        <div key={group.title} className="border-t border-border pt-6">
          <h2 className="font-heading font-semibold text-lg text-foreground mb-4">{group.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.fields.map(field => (
              <div key={field.id} className={field.field_type === 'textarea' ? 'sm:col-span-2' : ''}>
                {field.field_type !== 'checkbox' && (
                  <Label>{field.label} {field.required && '*'}</Label>
                )}
                {renderField(field)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
