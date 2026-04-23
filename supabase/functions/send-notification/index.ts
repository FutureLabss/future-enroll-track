import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationPayload {
  type: string; // invoice_created, payment_received, payment_reminder, overdue, invoice_settled
  channel: "email" | "whatsapp" | "both";
  enrollment_id: string;
  invoice_id?: string;
  extra?: Record<string, any>;
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FutureLabs <notifications@futurelabs.ng>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error [${res.status}]: ${err}`);
  }
  return await res.json();
}

async function sendWhatsApp(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials not fully configured");
  }

  // Ensure the 'to' number has whatsapp: prefix
  const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const params = new URLSearchParams();
  params.append("From", fromNumber);
  params.append("To", toWhatsApp);
  params.append("Body", body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio API error [${res.status}]: ${err}`);
  }
  return await res.json();
}

function buildEmailContent(type: string, data: Record<string, any>): { subject: string; html: string } {
  const { full_name, invoice_number, total_amount, currency, due_date, amount_paid, payment_reference, payment_method, program_name, enrollment_id, FRONTEND_URL } = data;
  const currencySymbol = currency === "USD" ? "$" : "₦";
  const formattedAmount = `${currencySymbol}${Number(total_amount).toLocaleString()}`;
  const formattedPaid = amount_paid ? `${currencySymbol}${Number(amount_paid).toLocaleString()}` : "";

  const wrapper = (content: string) => `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FutureEnroll</h1>
      </div>
      <div style="padding: 32px;">
        ${content}
      </div>
      <div style="background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>FutureEnroll Payment Tracking System</p>
      </div>
    </div>`;

  const receiptBlock = `
    <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 16px 0; border: 1px solid #bbf7d0;">
      <h3 style="margin: 0 0 12px; color: #166534; font-size: 16px; text-align: center;">🧾 PAYMENT RECEIPT</h3>
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        ${payment_reference ? `<tr><td style="padding: 6px 0; color: #6b7280;">Reference</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${payment_reference}</td></tr>` : ""}
        <tr><td style="padding: 6px 0; color: #6b7280;">Invoice</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${invoice_number}</td></tr>
        ${program_name ? `<tr><td style="padding: 6px 0; color: #6b7280;">Program</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${program_name}</td></tr>` : ""}
        ${payment_method ? `<tr><td style="padding: 6px 0; color: #6b7280;">Method</td><td style="padding: 6px 0; text-align: right; font-weight: 600; text-transform: capitalize;">${payment_method.replace(/_/g, " ")}</td></tr>` : ""}
        <tr><td style="padding: 6px 0; color: #6b7280;">Date</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</td></tr>
        <tr style="border-top: 2px solid #166534;"><td style="padding: 10px 0; font-weight: 700; font-size: 16px;">Amount Paid</td><td style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 18px; color: #166534;">${formattedPaid}</td></tr>
      </table>
    </div>
    <p style="font-size: 11px; color: #9ca3af; text-align: center;">This is a system-generated receipt. No signature required.</p>`;

  switch (type) {
    case "invoice_created":
      return {
        subject: `Invoice ${invoice_number} Created`,
        html: wrapper(`
          <h2 style="color: #1a1a2e;">New Invoice Created</h2>
          <p>Hello ${full_name},</p>
          <p>A new invoice has been created for you:</p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Invoice:</strong> ${invoice_number}</p>
            <p style="margin: 4px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
            ${due_date ? `<p style="margin: 4px 0;"><strong>Due Date:</strong> ${due_date}</p>` : ""}
          </div>
          <p>Please ensure timely payment to avoid late fees.</p>
          <div style="margin-top: 24px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <h3 style="margin-top: 0;">Action Required: Complete Your Enrollment</h3>
            <p>Please complete your profile to finalize your enrollment.</p>
            <a href="${FRONTEND_URL}/students/${enrollment_id}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Enrollment Profile</a>
          </div>
        `),
      };

    case "payment_received":
      return {
        subject: `Payment Receipt - ${invoice_number}`,
        html: wrapper(`
          <h2 style="color: #1a1a2e;">Payment Confirmed</h2>
          <p>Hello ${full_name},</p>
          <p>We've received your payment. Here is your receipt:</p>
          ${receiptBlock}
          <p>Thank you for your payment!</p>
        `),
      };

    case "payment_reminder":
      return {
        subject: `Payment Reminder - ${invoice_number} (Due: ${due_date})`,
        html: wrapper(`
          <h2 style="color: #1a1a2e;">Payment Reminder</h2>
          <p>Hello ${full_name},</p>
          <p>This is a friendly reminder about your upcoming payment:</p>
          <div style="background: #fffbeb; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 4px 0;"><strong>Invoice:</strong> ${invoice_number}</p>
            <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${formattedAmount}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${due_date}</p>
          </div>
          <p>Please make your payment before the due date.</p>
        `),
      };

    case "overdue":
      return {
        subject: `⚠️ Overdue Payment - ${invoice_number}`,
        html: wrapper(`
          <h2 style="color: #dc2626;">Payment Overdue</h2>
          <p>Hello ${full_name},</p>
          <p>Your payment is now overdue:</p>
          <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #dc2626;">
            <p style="margin: 4px 0;"><strong>Invoice:</strong> ${invoice_number}</p>
            <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${formattedAmount}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${due_date}</p>
          </div>
          <p>Please make your payment as soon as possible.</p>
        `),
      };

    case "invoice_settled":
      return {
        subject: `✅ Invoice ${invoice_number} Fully Paid`,
        html: wrapper(`
          <h2 style="color: #22c55e;">Invoice Settled!</h2>
          <p>Hello ${full_name},</p>
          <p>Your invoice has been fully paid. Here is your final payment receipt:</p>
          ${receiptBlock}
          <p>Thank you for completing your payment!</p>
        `),
      };

    default:
      return { subject: "Notification", html: wrapper(`<p>${JSON.stringify(data)}</p>`) };
  }
}

function buildWhatsAppMessage(type: string, data: Record<string, any>): string {
  const { full_name, invoice_number, total_amount, currency, due_date, amount_paid, enrollment_id, FRONTEND_URL } = data;
  const sym = currency === "USD" ? "$" : "₦";
  const amt = `${sym}${Number(total_amount).toLocaleString()}`;
  const paid = amount_paid ? `${sym}${Number(amount_paid).toLocaleString()}` : "";

  switch (type) {
    case "invoice_created":
      return `🧾 *New Invoice Created*\n\nHi ${full_name},\nInvoice: ${invoice_number}\nAmount: ${amt}\n${due_date ? `Due: ${due_date}` : ""}\n\nAction Required: Please complete your enrollment profile here:\n${FRONTEND_URL}/students/${enrollment_id}\n\nPlease ensure timely payment.`;
    case "payment_received":
      return `✅ *Payment Received*\n\nHi ${full_name},\nInvoice: ${invoice_number}\nAmount Paid: ${paid}\n\nThank you!`;
    case "payment_reminder":
      return `⏰ *Payment Reminder*\n\nHi ${full_name},\nInvoice: ${invoice_number}\nAmount Due: ${amt}\nDue Date: ${due_date}\n\nPlease pay before the due date.`;
    case "overdue":
      return `⚠️ *Payment Overdue*\n\nHi ${full_name},\nInvoice: ${invoice_number}\nAmount Due: ${amt}\nDue Date: ${due_date}\n\nPlease pay immediately.`;
    case "invoice_settled":
      return `🎉 *Invoice Fully Paid*\n\nHi ${full_name},\nInvoice: ${invoice_number}\nTotal: ${amt}\n\nThank you for completing payment!`;
    default:
      return `Notification: ${type}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload: NotificationPayload = await req.json();
    const { type, channel, enrollment_id, invoice_id, extra } = payload;

    // Determine the base URL for links: prefer the caller's origin (so the link
    // always matches the domain the admin is using), fall back to the configured
    // FRONTEND_URL secret, then to the published Lovable URL.
    const requestOrigin = req.headers.get("origin") || req.headers.get("referer") || "";
    let originBase = "";
    if (requestOrigin) {
      try { originBase = new URL(requestOrigin).origin; } catch { originBase = ""; }
    }

    // Get enrollment data
    const { data: enrollment, error: enrollErr } = await supabase
      .from("enrollments")
      .select("*, programs(program_name)")
      .eq("id", enrollment_id)
      .single();
    if (enrollErr || !enrollment) throw new Error("Enrollment not found");

    // Get invoice data if provided
    let invoice = null;
    if (invoice_id) {
      const { data } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
      invoice = data;
    }

    // Get next due installment
    let nextDue = null;
    if (invoice_id) {
      const { data } = await supabase
        .from("installments")
        .select("*")
        .eq("invoice_id", invoice_id)
        .neq("status", "paid")
        .order("due_date")
        .limit(1);
      if (data && data.length > 0) nextDue = data[0];
    }

    const templateData = {
      full_name: enrollment.full_name,
      email: enrollment.email,
      phone: enrollment.phone,
      invoice_number: invoice?.invoice_number || "N/A",
      total_amount: invoice?.total_amount || enrollment.total_amount,
      currency: invoice?.currency || "NGN",
      due_date: nextDue?.due_date || extra?.due_date || "",
      amount_paid: extra?.amount_paid || enrollment.amount_paid,
      enrollment_id: enrollment_id,
      FRONTEND_URL: (() => {
        // Priority: caller origin (admin's current domain) > FRONTEND_URL secret > Lovable URL
        let url = originBase || Deno.env.get("FRONTEND_URL") || "https://future-enroll-track.lovable.app";
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        url = url.replace(/\/+$/, "");
        // Don't use preview/sandbox URLs in emails — they're not shareable
        if (/id-preview--|lovableproject\.com|sandbox/i.test(url)) {
          url = (Deno.env.get("FRONTEND_URL") || "https://future-enroll-track.lovable.app").replace(/\/+$/, "");
          if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        }
        return url;
      })(),
      ...extra,
    };
    console.log("[send-notification] origin:", requestOrigin, "→ base:", `${templateData.FRONTEND_URL}/students/${enrollment_id}`);

    const results: string[] = [];

    // Admin notification emails for new enrollments
    const ADMIN_NOTIFY_EMAILS = ["manny@futurelabs.com.ng", "hello@futurelabs.africa"];
    if (type === "invoice_created") {
      for (const adminEmail of ADMIN_NOTIFY_EMAILS) {
        try {
          const adminSubject = `New Enrollment: ${enrollment.full_name} - ${invoice?.invoice_number || "N/A"}`;
          const programName = enrollment.programs?.program_name || "N/A";
          const adminHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: #fff; margin: 0; font-size: 20px;">New Enrollment Alert</h1>
              </div>
              <div style="padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p><strong>Student:</strong> ${enrollment.full_name}</p>
                <p><strong>Email:</strong> ${enrollment.email}</p>
                <p><strong>Phone:</strong> ${enrollment.phone || "N/A"}</p>
                <p><strong>Program:</strong> ${programName}</p>
                <p><strong>Invoice:</strong> ${invoice?.invoice_number || "N/A"}</p>
                <p><strong>Amount:</strong> ${templateData.currency === "USD" ? "$" : "₦"}${Number(templateData.total_amount).toLocaleString()}</p>
              </div>
            </div>`;
          await sendEmail(adminEmail, adminSubject, adminHtml);
          results.push(`admin_email_sent_${adminEmail}`);
        } catch (e: unknown) {
          console.error(`Admin email error (${adminEmail}):`, e);
          results.push(`admin_email_failed_${adminEmail}`);
        }
      }
    }

    // Send email
    if (channel === "email" || channel === "both") {
      try {
        const { subject, html } = buildEmailContent(type, templateData);
        await sendEmail(enrollment.email, subject, html);
        results.push("email_sent");

        await supabase.from("notifications").insert({
          type,
          title: subject,
          message: `Email sent to ${enrollment.email}`,
          channel: "email",
          enrollment_id,
          user_id: enrollment.user_id,
          sent_at: new Date().toISOString(),
        });
      } catch (e: unknown) {
        console.error("Email error:", e);
        results.push(`email_failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Send WhatsApp
    if ((channel === "whatsapp" || channel === "both") && enrollment.phone) {
      try {
        const message = buildWhatsAppMessage(type, templateData);
        await sendWhatsApp(enrollment.phone, message);
        results.push("whatsapp_sent");

        await supabase.from("notifications").insert({
          type,
          title: `WhatsApp: ${type.replace(/_/g, " ")}`,
          message: `WhatsApp sent to ${enrollment.phone}`,
          channel: "whatsapp",
          enrollment_id,
          user_id: enrollment.user_id,
          sent_at: new Date().toISOString(),
        });
      } catch (e: unknown) {
        console.error("WhatsApp error:", e);
        results.push(`whatsapp_failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
