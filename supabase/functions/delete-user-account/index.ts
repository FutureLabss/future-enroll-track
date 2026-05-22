import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AccountType = "enrollment" | "staff";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerData, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerData.user) return json({ error: "Unauthorized" }, 401);

    const callerId = callerData.user.id;
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const { data: callerSuperadmin } = await admin
      .from("superadmins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();

    if (callerRolesErr) return json({ error: callerRolesErr.message }, 400);
    const isAdmin = (callerRoles || []).some((r) => r.role === "admin");
    if (!isAdmin && !callerSuperadmin) return json({ error: "Only admins can delete user accounts" }, 403);

    const { account_type, id } = await req.json() as { account_type?: AccountType; id?: string };
    if ((account_type !== "enrollment" && account_type !== "staff") || !id) {
      return json({ error: "account_type and id are required" }, 400);
    }

    if (account_type === "enrollment") {
      return await deleteEnrollmentAccount(admin, callerId, id);
    }

    return await deleteStaffAccount(admin, callerId, id);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function deleteEnrollmentAccount(admin: ReturnType<typeof createClient>, callerId: string, enrollmentId: string) {
  const { data: enrollment, error: enrollmentErr } = await admin
    .from("enrollments")
    .select("id, user_id, full_name, email")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (enrollmentErr) return json({ error: enrollmentErr.message }, 400);
  if (!enrollment) return json({ error: "Enrollment not found" }, 404);

  if (enrollment.user_id) {
    const guard = await canDeleteAuthUser(admin, enrollment.user_id, "student");
    if (!guard.ok) return json({ error: guard.error }, 403);
  }

  const { data: invoices, error: invoicesErr } = await admin
    .from("invoices")
    .select("id")
    .eq("enrollment_id", enrollmentId);
  if (invoicesErr) return json({ error: invoicesErr.message }, 400);

  const invoiceIds = (invoices || []).map((invoice) => invoice.id);
  if (invoiceIds.length > 0) {
    const paymentErr = await deleteRows(admin, "payments", "invoice_id", invoiceIds);
    if (paymentErr) return json({ error: paymentErr }, 400);
    const installmentErr = await deleteRows(admin, "installments", "invoice_id", invoiceIds);
    if (installmentErr) return json({ error: installmentErr }, 400);
  }

  for (const [table, column] of [
    ["invoices", "enrollment_id"],
    ["field_values", "enrollment_id"],
    ["notifications", "enrollment_id"],
    ["classroom_students", "enrollment_id"],
    ["cohort_students", "enrollment_id"],
  ] as const) {
    const err = await deleteRows(admin, table, column, [enrollmentId]);
    if (err) return json({ error: err }, 400);
  }

  const { error: deleteEnrollmentErr } = await admin
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId);
  if (deleteEnrollmentErr) return json({ error: deleteEnrollmentErr.message }, 400);

  const { error: auditErr } = await admin.from("audit_logs").insert({
    user_id: callerId,
    action: "delete",
    entity_type: "enrollment",
    entity_id: enrollmentId,
    details: { full_name: enrollment.full_name, email: enrollment.email, auth_user_deleted: !!enrollment.user_id },
  });
  if (auditErr) console.warn("Failed to write audit log:", auditErr.message);

  if (enrollment.user_id) {
    const { error: deleteUserErr } = await admin.auth.admin.deleteUser(enrollment.user_id);
    if (deleteUserErr) return json({ error: `Enrollment deleted, but auth user deletion failed: ${deleteUserErr.message}` }, 500);
  }

  return json({ success: true, auth_user_deleted: !!enrollment.user_id });
}

async function deleteStaffAccount(admin: ReturnType<typeof createClient>, callerId: string, staffId: string) {
  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("id, full_name, email")
    .eq("id", staffId)
    .maybeSingle();

  if (staffErr) return json({ error: staffErr.message }, 400);
  if (!staff) return json({ error: "Staff member not found" }, 404);

  const { data: assignment } = await admin
    .from("classroom_staff")
    .select("user_id")
    .eq("staff_id", staffId)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  let userId = assignment?.user_id as string | null;
  if (!userId && staff.email) {
    userId = await findAuthUserIdByEmail(admin, staff.email);
  }

  if (userId) {
    const guard = await canDeleteAuthUser(admin, userId, "staff");
    if (!guard.ok) return json({ error: guard.error }, 403);
  }

  const { error: deleteStaffErr } = await admin
    .from("staff")
    .delete()
    .eq("id", staffId);
  if (deleteStaffErr) return json({ error: deleteStaffErr.message }, 400);

  const { error: auditErr } = await admin.from("audit_logs").insert({
    user_id: callerId,
    action: "delete",
    entity_type: "staff",
    entity_id: staffId,
    details: { full_name: staff.full_name, email: staff.email, auth_user_deleted: !!userId },
  });
  if (auditErr) console.warn("Failed to write audit log:", auditErr.message);

  if (userId) {
    const { error: deleteUserErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserErr) return json({ error: `Staff deleted, but auth user deletion failed: ${deleteUserErr.message}` }, 500);
  }

  return json({ success: true, auth_user_deleted: !!userId });
}

async function canDeleteAuthUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  expectedRole: "student" | "staff",
) {
  const { data: superadmin } = await admin
    .from("superadmins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (superadmin) return { ok: false, error: "Cannot delete a superadmin auth account from this flow" };

  const { data: roles, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const roleNames = (roles || []).map((r) => r.role);
  if (roleNames.includes("admin")) return { ok: false, error: "Cannot delete an admin auth account from this flow" };
  if (roleNames.length > 0 && !roleNames.includes(expectedRole)) {
    return { ok: false, error: `Auth account is not a ${expectedRole} account` };
  }

  return { ok: true };
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const normalized = email.toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
    page += 1;
  }

  return null;
}

async function deleteRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) return null;
  const { error } = await admin.from(table).delete().in(column, values);
  return error?.message || null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
