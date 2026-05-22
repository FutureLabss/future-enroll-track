-- Update age_category custom field options to start from age 8
UPDATE public.custom_fields
SET options = '["8–12","13–17","18–24","25–34","35–44","45–54","55+"]'::jsonb
WHERE key = 'age_category';
