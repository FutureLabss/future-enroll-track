-- =====================================================================
-- Missing curriculum RPCs that were created directly in Supabase DB
-- but never committed to migrations.
-- =====================================================================

-- 1. get_classroom_curricula — list curricula for a classroom
DROP FUNCTION IF EXISTS public.get_classroom_curricula(uuid);
DROP FUNCTION IF EXISTS public.get_curriculum_tree(uuid);

CREATE OR REPLACE FUNCTION public.get_classroom_curricula(p_classroom_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'classroom_id', c.classroom_id,
      'title', c.title,
      'description', c.description,
      'created_at', c.created_at
    )
    ORDER BY c.created_at
  )
  FROM public.curricula c
  WHERE c.classroom_id = p_classroom_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_classroom_curricula(uuid) TO authenticated;

-- 2. get_curriculum_tree — tracks, modules, units for a curriculum
CREATE OR REPLACE FUNCTION public.get_curriculum_tree(p_curriculum_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'tracks', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'curriculum_id', t.curriculum_id,
          'title', t.title,
          'description', t.description,
          'order_index', t.order_index
        )
        ORDER BY t.order_index
      )
      FROM public.tracks t
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    ),
    'modules', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'track_id', m.track_id,
          'title', m.title,
          'description', m.description,
          'order_index', m.order_index
        )
        ORDER BY m.order_index
      )
      FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    ),
    'units', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'module_id', u.module_id,
          'title', u.title,
          'description', u.description,
          'order_index', u.order_index
        )
        ORDER BY u.order_index
      )
      FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_curriculum_tree(uuid) TO authenticated;
