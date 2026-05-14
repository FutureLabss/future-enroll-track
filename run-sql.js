import fs from 'fs';
import { Client } from 'pg';

const connectionString = 'postgresql://postgres.xyufhtthhfgcbhaubiun:futurelabs123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to remote Supabase DB.');

    // 1. Promote user
    const promoteQuery = `
      INSERT INTO public.user_roles (user_id, role)
      SELECT id, 'admin' FROM auth.users WHERE email = 'manassehudim@gmail.com'
      ON CONFLICT DO NOTHING;
    `;
    const res1 = await client.query(promoteQuery);
    console.log('Promoted user: ', res1.rowCount, 'rows inserted/updated');

    // 2. Apply migrations
    const migrations = [
      'supabase/migrations/20260512000001_classroom_foundation.sql',
      'supabase/migrations/20260512000002_curriculum_lessons.sql',
      'supabase/migrations/20260512000003_attendance_assignments.sql'
    ];

    for (const m of migrations) {
      console.log(`Applying ${m}...`);
      const sql = fs.readFileSync(m, 'utf-8');
      await client.query(sql);
      console.log(`Success: ${m}`);
    }

    console.log('All done!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
