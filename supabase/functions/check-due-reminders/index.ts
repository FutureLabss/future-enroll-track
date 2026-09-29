import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Overdue installments older than this stop generating daily emails; they
// remain visible on the outstanding-invoices dashboard for manual follow-up.
const OVERDUE_LOOKBACK_DAYS = 90;
// External sends run in parallel batches of this size.
const SEND_CONCURRENCY = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Calculate reminder dates
    const reminderDays = [7, 3, 1, 0]; // days before due
    const reminderDates = reminderDays.map((d) => {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      return date.toISOString().split("T")[0];
    });
    const lookback = new Date(today);
    lookback.setDate(lookback.getDate() - OVERDUE_LOOKBACK_DAYS);
    const lookbackStr = lookback.toISOString().split("T")[0];

    // Get unpaid installments due on reminder dates or overdue (bounded window)
    const { data: installments, error } = await supabase
      .from("installments")
      .select("id, amount, due_date, invoices(id, status, enrollments(id, amount_paid, total_amount))")
      .neq("status", "paid")
      .lte("due_date", reminderDates[0]) // due within 7 days or already past
      .gte("due_date", lookbackStr)
      .order("due_date");

    if (error) throw error;

    // Classify each installment; collect candidates before any I/O
    type Candidate = {
      enrollmentId: string;
      invoiceId: string;
      notifType: string;
      dueDate: string;
      amount: number;
    };
    const candidates: Candidate[] = [];

    for (const inst of installments || []) {
      const invoice = inst.invoices;
      const enrollment = invoice?.enrollments;
      if (!enrollment) continue;

      // Skip if invoice is paid or enrollment is fully settled — installments may
      // still be 'unpaid' when the admin approves via the verify flow (which sets
      // amount_paid directly without reconciling individual installment statuses).
      if (invoice.status === "paid") continue;
      if (Number(enrollment.amount_paid) >= Number(enrollment.total_amount) && Number(enrollment.total_amount) > 0) continue;

      const dueDate = inst.due_date;
      let notifType = "";

      if (dueDate < todayStr) {
        notifType = "overdue";
      } else if (dueDate === todayStr) {
        notifType = "payment_reminder";
      } else if (reminderDates.includes(dueDate)) {
        notifType = "payment_reminder";
      } else {
        continue;
      }

      candidates.push({
        enrollmentId: enrollment.id,
        invoiceId: invoice.id,
        notifType,
        dueDate,
        amount: Number(inst.amount),
      });
    }

    // One batched dedup check: which (enrollment, type) pairs already got a
    // notification today?
    const enrollmentIds = [...new Set(candidates.map((c) => c.enrollmentId))];
    const sentSet = new Set<string>();
    if (enrollmentIds.length > 0) {
      const { data: sentToday } = await supabase
        .from("notifications")
        .select("enrollment_id, type")
        .in("enrollment_id", enrollmentIds)
        .gte("created_at", `${todayStr}T00:00:00Z`);
      for (const n of sentToday || []) sentSet.add(`${n.enrollment_id}:${n.type}`);
    }

    // Drop already-notified pairs and dedupe within this run (an enrollment
    // with two qualifying installments gets one message per type)
    const toSend: Candidate[] = [];
    for (const c of candidates) {
      const key = `${c.enrollmentId}:${c.notifType}`;
      if (sentSet.has(key)) continue;
      sentSet.add(key);
      toSend.push(c);
    }

    // Send concurrently in bounded batches via the send-notification function
    const fnUrl = `${supabaseUrl}/functions/v1/send-notification`;
    let sentCount = 0;
    for (let i = 0; i < toSend.length; i += SEND_CONCURRENCY) {
      const batch = toSend.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.all(
        batch.map((c) =>
          fetch(fnUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: c.notifType,
              channel: "both" as const,
              enrollment_id: c.enrollmentId,
              invoice_id: c.invoiceId,
              extra: { due_date: c.dueDate, installment_amount: c.amount },
            }),
          })
            .then((r) => r.ok)
            .catch(() => false)
        )
      );
      sentCount += results.filter(Boolean).length;
    }

    return new Response(
      JSON.stringify({ success: true, reminders_sent: sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Reminder check error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
