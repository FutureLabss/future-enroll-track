
ALTER TABLE public.custom_fields DROP CONSTRAINT IF EXISTS custom_fields_field_type_check;
ALTER TABLE public.custom_fields ADD CONSTRAINT custom_fields_field_type_check
  CHECK (field_type IN ('text', 'textarea', 'select', 'date', 'number', 'checkbox', 'file'));
