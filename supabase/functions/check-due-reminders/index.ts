import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get unpaid installments due on reminder dates or overdue
    const { data: installments, error } = await supabase
      .from("installments")
      .select("*, invoices(*, enrollments(*))")
      .neq("status", "paid")
      .lte("due_date", reminderDates[0]) // due within 7 days or already past
      .order("due_date");

    if (error) throw error;

    let sentCount = 0;

    for (const inst of installments || []) {
      const invoice = inst.invoices;
      const enrollment = invoice?.enrollments;
      if (!enrollment) continue;

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

      // Check if we already sent this notification today
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("enrollment_id", enrollment.id)
        .eq("type", notifType)
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Send notification via the send-notification function
      const notifPayload = {
        type: notifType,
        channel: "both" as const,
        enrollment_id: enrollment.id,
        invoice_id: invoice.id,
        extra: { due_date: dueDate },
      };

      // Call send-notification function internally
      const fnUrl = `${supabaseUrl}/functions/v1/send-notification`;
      await fetch(fnUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notifPayload),
      });

      sentCount++;
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
