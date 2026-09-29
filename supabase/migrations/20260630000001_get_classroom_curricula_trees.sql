-- Replace N+1 calls (get_classroom_curricula + N×get_curriculum_tree) with a single RPC
-- that returns all curricula with their full track→module→unit tree for a classroom.
CREATE OR REPLACE FUNCTION public.get_classroom_curricula_trees(p_classroom_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id',           c.id,
        'classroom_id', c.classroom_id,
        'title',        c.title,
        'description',  c.description,
        'created_at',   c.created_at,
        'tracks', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id',           t.id,
              'curriculum_id', t.curriculum_id,
              'title',        t.title,
              'description',  t.description,
              'order_index',  t.order_index,
              'modules', COALESCE(
                (SELECT jsonb_agg(
                  jsonb_build_object(
                    'id',          m.id,
                    'track_id',    m.track_id,
                    'title',       m.title,
                    'description', m.description,
                    'order_index', m.order_index,
                    'units', COALESCE(
                      (SELECT jsonb_agg(
                        jsonb_build_object(
                          'id',          u.id,
                          'module_id',   u.module_id,
                          'title',       u.title,
                          'description', u.description,
                          'order_index', u.order_index,
                          'lessons',     '[]'::jsonb
                        )
                        ORDER BY u.order_index
                      )
                      FROM public.units u
                      WHERE u.module_id = m.id),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY m.order_index
                )
                FROM public.modules m
                WHERE m.track_id = t.id),
                '[]'::jsonb
              )
            )
            ORDER BY t.order_index
          )
          FROM public.tracks t
          WHERE t.curriculum_id = c.id),
          '[]'::jsonb
        )
      )
      ORDER BY c.created_at
    )
    FROM public.curricula c
    WHERE c.classroom_id = p_classroom_id),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_classroom_curricula_trees(uuid) TO authenticated;
