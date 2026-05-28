CREATE OR REPLACE FUNCTION public.clone_curriculum_v2(
  p_source_curriculum_id uuid,
  p_target_classroom_id uuid,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source public.curricula%ROWTYPE;
  v_new_curriculum_id uuid;
  v_track public.tracks%ROWTYPE;
  v_module public.modules%ROWTYPE;
  v_unit public.units%ROWTYPE;
  v_lesson public.lessons%ROWTYPE;
  v_new_track_id uuid;
  v_new_module_id uuid;
  v_new_unit_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.curricula
  WHERE id = p_source_curriculum_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source curriculum not found';
  END IF;

  INSERT INTO public.curricula (classroom_id, title, description, created_by)
  VALUES (
    p_target_classroom_id,
    COALESCE(NULLIF(trim(p_title), ''), v_source.title || ' Copy'),
    v_source.description,
    auth.uid()
  )
  RETURNING id INTO v_new_curriculum_id;

  FOR v_track IN
    SELECT * FROM public.tracks
    WHERE curriculum_id = p_source_curriculum_id
    ORDER BY order_index, created_at
  LOOP
    INSERT INTO public.tracks (curriculum_id, title, description, order_index)
    VALUES (v_new_curriculum_id, v_track.title, v_track.description, v_track.order_index)
    RETURNING id INTO v_new_track_id;

    FOR v_module IN
      SELECT * FROM public.modules
      WHERE track_id = v_track.id
      ORDER BY order_index, created_at
    LOOP
      INSERT INTO public.modules (track_id, title, description, order_index)
      VALUES (v_new_track_id, v_module.title, v_module.description, v_module.order_index)
      RETURNING id INTO v_new_module_id;

      FOR v_unit IN
        SELECT * FROM public.units
        WHERE module_id = v_module.id
        ORDER BY order_index, created_at
      LOOP
        INSERT INTO public.units (module_id, title, description, order_index)
        VALUES (v_new_module_id, v_unit.title, v_unit.description, v_unit.order_index)
        RETURNING id INTO v_new_unit_id;

        FOR v_lesson IN
          SELECT * FROM public.lessons
          WHERE unit_id = v_unit.id
          ORDER BY order_index, created_at
        LOOP
          INSERT INTO public.lessons (
            unit_id,
            title,
            content,
            objectives,
            resources,
            video_url,
            external_link,
            order_index,
            created_by
          )
          VALUES (
            v_new_unit_id,
            v_lesson.title,
            v_lesson.content,
            v_lesson.objectives,
            v_lesson.resources,
            v_lesson.video_url,
            v_lesson.external_link,
            v_lesson.order_index,
            auth.uid()
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_new_curriculum_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_curriculum_v2(uuid, uuid, text) TO authenticated;
