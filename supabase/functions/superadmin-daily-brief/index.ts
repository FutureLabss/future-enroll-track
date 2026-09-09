import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HUB_NAMES: Record<string, string> = {
  "00000000-0000-0000-0000-000000000001": "FutureLabs",
  "00000000-0000-0000-0000-000000000002": "RhemaHub",
};

const naira = (n: number) => `₦${Number(n).toLocaleString("en-NG")}`;

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FutureLabs <notifications@futurelabs.ng>", to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

function section(title: string, rows: string[]): string {
  return `
    <div style="margin:0 0 24px;">
      <h3 style="color:#1a1a2e;font-size:15px;margin:0 0 8px;">${title}</h3>
      ${rows.length
        ? `<div style="background:#f9fafb;border-radius:8px;padding:16px;border-left:4px solid #6366f1;">${rows.map((r) => `<p style="margin:4px 0;font-size:14px;">${r}</p>`).join("")}</div>`
        : `<p style="margin:4px 0;font-size:14px;color:#9ca3af;">Nothing to report.</p>`
      }
    </div>`;
}

type HubRow = { programs: { hub_id: string } | { hub_id: string }[] };

function hubIdOf(row: HubRow): string | undefined {
  const p = Array.isArray(row.programs) ? row.programs[0] : row.programs;
  return p?.hub_id;
}

function sumByHub(rows: { amount: number; hub_id?: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.hub_id) continue;
    out[r.hub_id] = (out[r.hub_id] || 0) + Number(r.amount);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStart = yesterday.toISOString().slice(0, 10);
    const yEnd = today.toISOString().slice(0, 10); // exclusive upper bound

    // 1. Revenue collected yesterday, per hub (FutureLabs: installments.paid_at, RhemaHub: payments.payment_date)
    const [instRevRes, payRevRes] = await Promise.all([
      supabase
        .from("installments")
        .select("amount, invoices!inner(status, enrollments!inner(programs!inner(hub_id)))")
        .eq("status", "paid")
        .neq("invoices.status", "cancelled")
        .gte("paid_at", yStart)
        .lt("paid_at", yEnd),
      supabase
        .from("payments")
        .select("amount, invoices!inner(status, enrollments!inner(programs!inner(hub_id)))")
        .neq("invoices.status", "cancelled")
        .eq("payment_date", yStart),
    ]);
    if (instRevRes.error) throw instRevRes.error;
    if (payRevRes.error) throw payRevRes.error;

    const revenueByHub = sumByHub([
      ...(instRevRes.data || []).map((r: any) => ({ amount: r.amount, hub_id: hubIdOf(r.invoices.enrollments) })),
      ...(payRevRes.data || []).map((r: any) => ({ amount: r.amount, hub_id: hubIdOf(r.invoices.enrollments) })),
    ]);

    // 2. New enrollments yesterday, per hub
    const { data: newEnrollments, error: enrollErr } = await supabase
      .from("enrollments")
      .select("id, full_name, programs!inner(hub_id, program_name)")
      .gte("created_at", yStart)
      .lt("created_at", yEnd);
    if (enrollErr) throw enrollErr;

    // 3. Pending invoice edit/delete requests (both hubs — this table has no hub scoping issue for superadmin, but we're on service role anyway)
    const { data: pendingChanges, error: changesErr } = await supabase
      .from("invoice_change_requests")
      .select("id, action, invoices(invoice_number, enrollments(full_name))")
      .eq("status", "pending");
    if (changesErr) throw changesErr;

    // 4. Pending bank-transfer payments awaiting approval
    const { data: pendingPayments, error: pendingErr } = await supabase
      .from("pending_payments")
      .select("id, amount, invoices(invoice_number, enrollments(full_name))")
      .eq("status", "pending");
    if (pendingErr) throw pendingErr;

    // 5. Installments that crossed into overdue since yesterday's brief (due_date = yesterday, still unpaid)
    const { data: newlyOverdue, error: overdueErr } = await supabase
      .from("installments")
      .select("amount, invoices!inner(status, invoice_number, enrollments(full_name))")
      .neq("status", "paid")
      .neq("invoices.status", "cancelled")
      .eq("due_date", yStart);
    if (overdueErr) throw overdueErr;

    // ── Build email ──────────────────────────────────────────────────────────
    const hubIds = Object.keys(HUB_NAMES);
    const revenueRows = hubIds.map((h) => `<strong>${HUB_NAMES[h]}:</strong> ${naira(revenueByHub[h] || 0)}`);
    const totalRevenue = Object.values(revenueByHub).reduce((s, n) => s + n, 0);

    const enrollmentRows = (newEnrollments || []).map((e: any) => {
      const hub = HUB_NAMES[hubIdOf(e) as string] || "Unknown hub";
      return `${e.full_name} — ${e.programs?.program_name || "—"} (${hub})`;
    });

    const changeRows = (pendingChanges || []).map((c: any) =>
      `${c.action === "edit" ? "Edit" : "Delete"} request — ${c.invoices?.invoice_number || "?"} (${c.invoices?.enrollments?.full_name || "?"})`
    );

    const pendingPaymentRows = (pendingPayments || []).map((p: any) =>
      `${naira(p.amount)} — ${p.invoices?.invoice_number || "?"} (${p.invoices?.enrollments?.full_name || "?"})`
    );

    const overdueRows = (newlyOverdue || []).map((i: any) =>
      `${naira(i.amount)} — ${i.invoices?.invoice_number || "?"} (${i.invoices?.enrollments?.full_name || "?"})`
    );

    const dateLabel = yesterday.toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const pendingActionCount = changeRows.length + pendingPaymentRows.length;

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">FutureLabs — Daily Brief</h1>
          <p style="color:#9ca3af;margin:8px 0 0;font-size:13px;">${dateLabel}</p>
        </div>
        <div style="padding:32px;">
          ${section(`Revenue collected (${naira(totalRevenue)} total)`, revenueRows)}
          ${section("New enrollments", enrollmentRows)}
          ${section(`Invoice requests awaiting your approval${changeRows.length ? ` (${changeRows.length})` : ""}`, changeRows)}
          ${section(`Bank-transfer payments awaiting approval${pendingPaymentRows.length ? ` (${pendingPaymentRows.length})` : ""}`, pendingPaymentRows)}
          ${section("Newly overdue installments", overdueRows)}
        </div>
        <div style="background:#f9fafb;padding:20px;text-align:center;font-size:12px;color:#6b7280;">
          <p>FutureLabs Admin — Daily Brief</p>
        </div>
      </div>`;

    const subject = pendingActionCount > 0
      ? `Daily Brief: ${naira(totalRevenue)} collected, ${pendingActionCount} awaiting approval`
      : `Daily Brief: ${naira(totalRevenue)} collected`;

    const messageText = [
      `Revenue: ${naira(totalRevenue)}`,
      `New enrollments: ${enrollmentRows.length}`,
      `Awaiting approval: ${pendingActionCount}`,
      `Newly overdue: ${overdueRows.length}`,
    ].join(" · ");

    // ── Deliver: email + in-app notification, per superadmin ──────────────────
    const { data: superadmins, error: superadminErr } = await supabase.from("superadmins").select("user_id");
    if (superadminErr) throw superadminErr;
    if (!superadmins || superadmins.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, note: "No superadmins found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];
    for (const { user_id } of superadmins) {
      const { data: profile } = await supabase.from("profiles").select("email").eq("user_id", user_id).maybeSingle();
      const errors: string[] = [];

      if (profile?.email) {
        try {
          await sendEmail(profile.email, subject, html);
        } catch (e: any) {
          errors.push(`email: ${e.message}`);
        }
      } else {
        errors.push("email: no profile email on file");
      }

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id,
        type: "daily_brief",
        title: subject,
        message: messageText,
        channel: "email",
      });
      if (notifErr) errors.push(`notification: ${notifErr.message}`);

      results.push(`${user_id}${errors.length ? ` ERRORS: ${errors.join(", ")}` : " OK"}`);
    }

    return new Response(JSON.stringify({ success: true, sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
