-- Clone a curriculum from one cohort to another.
-- Duplicates: curriculum → weeks → lessons → material metadata (not uploaded files).
-- If the target cohort already has a curriculum it is replaced.

CREATE OR REPLACE FUNCTION public.clone_curriculum_to_cohort(
  p_source_curriculum_id uuid,
  p_target_cohort_id       uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src              public.curriculums%ROWTYPE;
  v_new_cur_id       uuid;
  v_target_cls_id    uuid;
  v_week             public.curriculum_weeks%ROWTYPE;
  v_lesson           public.curriculum_lessons%ROWTYPE;
  v_new_week_id      uuid;
  v_new_lesson_id    uuid;
BEGIN
  -- Fetch source curriculum
  SELECT * INTO v_src FROM public.curriculums WHERE id = p_source_curriculum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source curriculum not found';
  END IF;

  -- Derive target classroom from target cohort
  SELECT classroom_id INTO v_target_cls_id
  FROM public.cohorts WHERE id = p_target_cohort_id;

  -- Replace any existing curriculum for the target cohort
  DELETE FROM public.curriculums WHERE cohort_id = p_target_cohort_id;

  -- Create new curriculum
  INSERT INTO public.curriculums (cohort_id, classroom_id, title)
  VALUES (p_target_cohort_id, v_target_cls_id, v_src.title)
  RETURNING id INTO v_new_cur_id;

  -- Copy weeks
  FOR v_week IN
    SELECT * FROM public.curriculum_weeks
    WHERE curriculum_id = p_source_curriculum_id
    ORDER BY week_number
  LOOP
    INSERT INTO public.curriculum_weeks (curriculum_id, week_number, title, objectives)
    VALUES (v_new_cur_id, v_week.week_number, v_week.title, v_week.objectives)
    RETURNING id INTO v_new_week_id;

    -- Copy lessons in that week
    FOR v_lesson IN
      SELECT * FROM public.curriculum_lessons
      WHERE curriculum_week_id = v_week.id
      ORDER BY lesson_order
    LOOP
      INSERT INTO public.curriculum_lessons (curriculum_week_id, title, objectives, lesson_order)
      VALUES (v_new_week_id, v_lesson.title, v_lesson.objectives, v_lesson.lesson_order)
      RETURNING id INTO v_new_lesson_id;

      -- Copy material metadata (file URLs are shared; files themselves are not duplicated)
      INSERT INTO public.lesson_materials (curriculum_lesson_id, title, material_type, file_url)
      SELECT v_new_lesson_id, title, material_type, file_url
      FROM public.lesson_materials
      WHERE curriculum_lesson_id = v_lesson.id;
    END LOOP;
  END LOOP;

  RETURN v_new_cur_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_curriculum_to_cohort(uuid, uuid) TO authenticated;
