-- ── 1. Add new columns to lessons ────────────────────────────────────────────
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS video_url      text,
  ADD COLUMN IF NOT EXISTS external_link  text;

-- ── 2. Update curriculum_add_lesson ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.curriculum_add_lesson(
  p_unit_id      uuid,
  p_title        text,
  p_content      text    DEFAULT NULL,
  p_objectives   text    DEFAULT NULL,
  p_video_url    text    DEFAULT NULL,
  p_external_link text   DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order int; v_id uuid;
BEGIN
  SELECT COALESCE(MAX(order_index) + 1, 0) INTO v_order FROM lessons WHERE unit_id = p_unit_id;
  INSERT INTO lessons (unit_id, title, content, objectives, video_url, external_link, order_index)
  VALUES (p_unit_id, p_title, p_content, p_objectives, p_video_url, p_external_link, v_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ── 3. Update curriculum_update_lesson ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.curriculum_update_lesson(
  p_id            uuid,
  p_title         text    DEFAULT NULL,
  p_content       text    DEFAULT NULL,
  p_objectives    text    DEFAULT NULL,
  p_order_index   integer DEFAULT NULL,
  p_video_url     text    DEFAULT NULL,
  p_external_link text    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE lessons SET
    title         = COALESCE(p_title, title),
    content       = COALESCE(p_content, content),
    objectives    = COALESCE(p_objectives, objectives),
    video_url     = COALESCE(p_video_url, video_url),
    external_link = COALESCE(p_external_link, external_link),
    order_index   = COALESCE(p_order_index, order_index),
    updated_at    = NOW()
  WHERE id = p_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.curriculum_add_lesson(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_update_lesson(uuid, text, text, text, integer, text, text) TO authenticated;
