-- Seed RhemaHub (00000000-0000-0000-0000-000000000002) with demo data:
-- 7 enrollments, 7 invoices, 4 payments, 4 expenses, 2 other_income records.
-- Applied to production DB via MCP on 2026-05-14; this file is the git record.

-- RhemaHub program UUIDs (created via UI, not fixed IDs):
-- Full-Stack Web Development : 6676249d-2ffe-434c-8fdb-18e890ad7e8e
-- Data Science & ML          : 93f9310d-9cff-4d3c-968f-47d00e839a18
-- UI/UX Design               : 7f2681c8-ad21-4332-af4f-da231ab105d2

INSERT INTO public.enrollments
  (id, full_name, email, phone, program_id, enrollment_status,
   total_amount, amount_paid, first_payment_date, last_payment_date, payment_type, created_at)
VALUES
  ('d8000001-0000-0000-0000-000000000001'::uuid, 'Adaeze Nwosu', 'adaeze@rhemademo.com', '+2348101234561',
   '6676249d-2ffe-434c-8fdb-18e890ad7e8e'::uuid, 'active', 120000, 120000, '2026-01-10', '2026-01-10', 'offline', '2026-01-10 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000002'::uuid, 'Emeka Obi', 'emeka@rhemademo.com', '+2348101234562',
   '6676249d-2ffe-434c-8fdb-18e890ad7e8e'::uuid, 'active', 120000, 60000, '2026-01-11', '2026-03-01', 'offline', '2026-01-11 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000003'::uuid, 'Fatima Aliyu', 'fatima@rhemademo.com', '+2348101234563',
   '93f9310d-9cff-4d3c-968f-47d00e839a18'::uuid, 'active', 95000, 95000, '2026-01-12', '2026-01-12', 'offline', '2026-01-12 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000004'::uuid, 'Kelechi Eze', 'kelechi@rhemademo.com', '+2348101234564',
   '7f2681c8-ad21-4332-af4f-da231ab105d2'::uuid, 'pending', 80000, 0, NULL, NULL, 'offline', '2026-03-01 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000005'::uuid, 'Ngozi Okonkwo', 'ngozi@rhemademo.com', '+2348101234565',
   '6676249d-2ffe-434c-8fdb-18e890ad7e8e'::uuid, 'active', 120000, 120000, '2026-01-14', '2026-01-14', 'offline', '2026-01-14 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000006'::uuid, 'Yusuf Abdullahi', 'yusuf@rhemademo.com', '+2348101234566',
   '93f9310d-9cff-4d3c-968f-47d00e839a18'::uuid, 'active', 95000, 0, NULL, NULL, 'offline', '2026-04-01 09:00:00+00'),
  ('d8000001-0000-0000-0000-000000000007'::uuid, 'Chisom Ike', 'chisom@rhemademo.com', '+2348101234567',
   '7f2681c8-ad21-4332-af4f-da231ab105d2'::uuid, 'pending', 80000, 0, NULL, NULL, 'offline', '2026-03-02 09:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoices
  (id, enrollment_id, invoice_number, total_amount, currency, status, payment_plan_type, created_at)
VALUES
  ('d9000001-0000-0000-0000-000000000001'::uuid, 'd8000001-0000-0000-0000-000000000001'::uuid, 'RH-INV-0041', 120000, 'NGN', 'paid',    'single',      '2026-01-10 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000002'::uuid, 'd8000001-0000-0000-0000-000000000002'::uuid, 'RH-INV-0042', 120000, 'NGN', 'active',   'installment', '2026-01-11 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000003'::uuid, 'd8000001-0000-0000-0000-000000000003'::uuid, 'RH-INV-0043',  95000, 'NGN', 'paid',    'single',      '2026-01-12 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000004'::uuid, 'd8000001-0000-0000-0000-000000000004'::uuid, 'RH-INV-0044',  80000, 'NGN', 'overdue', 'single',      '2026-03-01 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000005'::uuid, 'd8000001-0000-0000-0000-000000000005'::uuid, 'RH-INV-0045', 120000, 'NGN', 'paid',    'single',      '2026-01-14 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000006'::uuid, 'd8000001-0000-0000-0000-000000000006'::uuid, 'RH-INV-0046',  95000, 'NGN', 'active',  'single',      '2026-04-01 10:00:00+00'),
  ('d9000001-0000-0000-0000-000000000007'::uuid, 'd8000001-0000-0000-0000-000000000007'::uuid, 'RH-INV-0047',  80000, 'NGN', 'active',  'single',      '2026-03-02 10:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments (id, invoice_id, amount, payment_reference, payment_method, notes, created_at)
VALUES
  ('da000001-0000-0000-0000-000000000001'::uuid, 'd9000001-0000-0000-0000-000000000001'::uuid, 120000, 'PAY-RH-7821', 'Paystack',      NULL,               '2026-01-10 14:00:00+00'),
  ('da000001-0000-0000-0000-000000000002'::uuid, 'd9000001-0000-0000-0000-000000000003'::uuid,  95000, 'PAY-RH-7820', 'Bank Transfer', NULL,               '2026-01-12 14:00:00+00'),
  ('da000001-0000-0000-0000-000000000003'::uuid, 'd9000001-0000-0000-0000-000000000005'::uuid, 120000, 'PAY-RH-7819', 'Paystack',      NULL,               '2026-01-14 14:00:00+00'),
  ('da000001-0000-0000-0000-000000000004'::uuid, 'd9000001-0000-0000-0000-000000000002'::uuid,  60000, 'PAY-RH-7818', 'Bank Transfer', 'First instalment', '2026-03-01 14:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.expenses (id, category, vendor_name, amount, payment_date, payment_method, payment_reference, notes, hub_id, created_at)
VALUES
  ('db000001-0000-0000-0000-000000000001'::uuid, 'Payroll',   'Chidi Okafor',                  150000, '2026-05-01', 'Bank Transfer', 'PAY-STAFF-01', 'May 2026 tutor salary',            '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-01 09:00:00+00'),
  ('db000001-0000-0000-0000-000000000002'::uuid, 'Payroll',   'Amaka Eze',                     130000, '2026-05-01', 'Bank Transfer', 'PAY-STAFF-02', 'May 2026 tutor salary',            '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-01 09:00:00+00'),
  ('db000001-0000-0000-0000-000000000003'::uuid, 'Rent',      'Victoria Island Office Complex',  85000, '2026-05-05', 'Bank Transfer', 'RENT-MAY-26',  'May 2026 office rent',             '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-05 09:00:00+00'),
  ('db000001-0000-0000-0000-000000000004'::uuid, 'Equipment', 'TechStore Nigeria',               35000, '2026-05-08', 'Card',          'EQUIP-001',    'HDMI cables and adapters',         '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-08 09:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.other_income (id, category, payer_name, amount, payment_date, payment_method, payment_reference, notes, hub_id, created_at)
VALUES
  ('dc000001-0000-0000-0000-000000000001'::uuid, 'Workshop',   'Zenith Tech (Corporate)', 75000, '2026-05-07', 'Bank Transfer', 'INC-WS-001',   'One-day React workshop', '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-07 09:00:00+00'),
  ('dc000001-0000-0000-0000-000000000002'::uuid, 'Consulting', 'BuildNG Startup',         50000, '2026-05-10', 'Transfer',      'INC-CONS-001', 'Tech curriculum consulting', '00000000-0000-0000-0000-000000000002'::uuid, '2026-05-10 09:00:00+00')
ON CONFLICT (id) DO NOTHING;
