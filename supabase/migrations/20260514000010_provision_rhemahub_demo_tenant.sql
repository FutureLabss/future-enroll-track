-- Provision RhemaHub as a fully seeded demo tenant.
-- Hub UUID: 00000000-0000-0000-0000-000000000002
-- Applied to production DB via MCP on 2026-05-14; this file is the git record.

-- Hub record
INSERT INTO public.hubs (id, name, slug, contact_email, plan, status)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'RhemaHub',
  'rhemahub',
  'admin@rhemahub.com',
  'enterprise',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Programs
INSERT INTO public.programs (id, name, description, hub_id)
VALUES
  ('d1000001-0000-0000-0000-000000000001'::uuid, 'Full-Stack Web Development', 'Comprehensive full-stack program covering HTML, CSS, JS, React, and Node.js', '00000000-0000-0000-0000-000000000002'::uuid),
  ('d1000001-0000-0000-0000-000000000002'::uuid, 'Data Science & Machine Learning', 'Python, pandas, scikit-learn, and real-world ML projects', '00000000-0000-0000-0000-000000000002'::uuid),
  ('d1000001-0000-0000-0000-000000000003'::uuid, 'UI/UX Design', 'Figma, design systems, user research, and prototyping', '00000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Classrooms
INSERT INTO public.classrooms (id, name, program_id, hub_id)
VALUES
  ('d2000001-0000-0000-0000-000000000001'::uuid, 'Web Dev Classroom', 'd1000001-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid),
  ('d2000001-0000-0000-0000-000000000002'::uuid, 'Data Science Lab', 'd1000001-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Cohorts
INSERT INTO public.cohorts (id, cohort_label, classroom_id, status)
VALUES
  ('d3000001-0000-0000-0000-000000000001'::uuid, 'Cohort Alpha — Jan 2026', 'd2000001-0000-0000-0000-000000000001'::uuid, 'active'),
  ('d3000001-0000-0000-0000-000000000002'::uuid, 'Cohort Beta — Apr 2026',  'd2000001-0000-0000-0000-000000000001'::uuid, 'upcoming'),
  ('d3000001-0000-0000-0000-000000000003'::uuid, 'DS Cohort 1 — Mar 2026',  'd2000001-0000-0000-0000-000000000002'::uuid, 'active')
ON CONFLICT (id) DO NOTHING;

-- Curriculum for Cohort Alpha
INSERT INTO public.curriculums (id, title, cohort_id)
VALUES ('d4000001-0000-0000-0000-000000000001'::uuid, 'Full-Stack Web Development — Complete Syllabus', 'd3000001-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Weeks
INSERT INTO public.curriculum_weeks (id, curriculum_id, week_number, title, objectives)
VALUES
  ('d5000001-0000-0000-0000-000000000001'::uuid, 'd4000001-0000-0000-0000-000000000001'::uuid, 1, 'Web Foundations', 'Understand how the web works; build and style your first HTML page.'),
  ('d5000001-0000-0000-0000-000000000002'::uuid, 'd4000001-0000-0000-0000-000000000001'::uuid, 2, 'JavaScript Fundamentals', 'Write interactive JS; understand the DOM; use modern ES6+ syntax.'),
  ('d5000001-0000-0000-0000-000000000003'::uuid, 'd4000001-0000-0000-0000-000000000001'::uuid, 3, 'React & Component Thinking', 'Build composable UIs with React, props, state, and hooks.')
ON CONFLICT (id) DO NOTHING;

-- Lessons
INSERT INTO public.lessons (id, week_id, title, lesson_order, objectives)
VALUES
  ('d6000001-0000-0000-0000-000000000001'::uuid, 'd5000001-0000-0000-0000-000000000001'::uuid, 'How the Internet Works', 1, 'DNS, HTTP, TCP/IP overview.'),
  ('d6000001-0000-0000-0000-000000000002'::uuid, 'd5000001-0000-0000-0000-000000000001'::uuid, 'HTML5 Essentials', 2, 'Semantic tags, forms, accessibility basics.'),
  ('d6000001-0000-0000-0000-000000000003'::uuid, 'd5000001-0000-0000-0000-000000000001'::uuid, 'CSS & Flexbox Layout', 3, 'Box model, responsive design, flexbox.'),
  ('d6000001-0000-0000-0000-000000000004'::uuid, 'd5000001-0000-0000-0000-000000000002'::uuid, 'Variables, Types & Functions', 1, 'let/const, arrow functions, template literals.'),
  ('d6000001-0000-0000-0000-000000000005'::uuid, 'd5000001-0000-0000-0000-000000000002'::uuid, 'DOM Manipulation', 2, 'querySelector, event listeners, fetch API.'),
  ('d6000001-0000-0000-0000-000000000006'::uuid, 'd5000001-0000-0000-0000-000000000003'::uuid, 'Intro to React', 1, 'JSX, components, create-react-app.'),
  ('d6000001-0000-0000-0000-000000000007'::uuid, 'd5000001-0000-0000-0000-000000000003'::uuid, 'useState & useEffect', 2, 'Managing local state and side effects.')
ON CONFLICT (id) DO NOTHING;

-- Materials
INSERT INTO public.lesson_materials (id, lesson_id, title, material_type, file_url)
VALUES
  ('d7000001-0000-0000-0000-000000000001'::uuid, 'd6000001-0000-0000-0000-000000000001'::uuid, 'Lecture Slides', 'pdf', 'https://admin.futurelabs.ng'),
  ('d7000001-0000-0000-0000-000000000002'::uuid, 'd6000001-0000-0000-0000-000000000001'::uuid, 'Intro Video', 'video', 'https://youtu.be/example1'),
  ('d7000001-0000-0000-0000-000000000003'::uuid, 'd6000001-0000-0000-0000-000000000002'::uuid, 'HTML Cheatsheet', 'pdf', 'https://admin.futurelabs.ng'),
  ('d7000001-0000-0000-0000-000000000004'::uuid, 'd6000001-0000-0000-0000-000000000002'::uuid, 'MDN Web Docs', 'link', 'https://developer.mozilla.org'),
  ('d7000001-0000-0000-0000-000000000005'::uuid, 'd6000001-0000-0000-0000-000000000003'::uuid, 'Flexbox Froggy', 'link', 'https://flexboxfroggy.com'),
  ('d7000001-0000-0000-0000-000000000006'::uuid, 'd6000001-0000-0000-0000-000000000004'::uuid, 'JS Crash Course', 'video', 'https://youtu.be/example2'),
  ('d7000001-0000-0000-0000-000000000007'::uuid, 'd6000001-0000-0000-0000-000000000005'::uuid, 'Workshop Exercises', 'file', 'https://admin.futurelabs.ng'),
  ('d7000001-0000-0000-0000-000000000008'::uuid, 'd6000001-0000-0000-0000-000000000007'::uuid, 'Hooks Reference', 'link', 'https://react.dev/reference/react'),
  ('d7000001-0000-0000-0000-000000000009'::uuid, 'd6000001-0000-0000-0000-000000000007'::uuid, 'Hooks Deep Dive Video', 'video', 'https://youtu.be/example3')
ON CONFLICT (id) DO NOTHING;
