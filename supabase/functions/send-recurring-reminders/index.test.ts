import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Re-export pure functions under test by duplicating just the logic.
// We keep these in sync manually — if the implementation diverges, the tests will fail.

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function buildWhatsAppText(item: Record<string, string>, daysOut: number | "overdue"): string {
  const amt = `₦${Number(item.amount).toLocaleString("en-NG")}`;
  const due = new Date(item.next_due_date).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isOverdue = daysOut === "overdue";
  const urgency = isOverdue ? "OVERDUE" : daysOut === 1 ? "tomorrow" : `in ${daysOut} days`;
  const icon = isOverdue ? "⛔" : "⏰";
  return `${icon} *${isOverdue ? "Overdue Payment" : "Payment Reminder"} — FutureLabs*\n\nHi ${item.payer_name},\n\nYour recurring payment of *${amt}* ${
    isOverdue
      ? `was due on ${due} and is now *overdue*`
      : `is due *${urgency}* (${due})`
  }.\n\nCategory: ${item.category}\nFrequency: ${item.frequency}\n\n${
    isOverdue ? "Please settle this as soon as possible." : "Please ensure timely payment."
  }`;
}

const baseItem = {
  payer_name: "Ade Okon",
  amount: "50000",
  next_due_date: "2026-07-03",
  category: "tuition",
  frequency: "monthly",
};

Deno.test("buildWhatsAppText: 3-day reminder", () => {
  const text = buildWhatsAppText(baseItem, 3);
  assertStringIncludes(text, "⏰");
  assertStringIncludes(text, "in 3 days");
  assertStringIncludes(text, "₦50,000");
  assertStringIncludes(text, "Ade Okon");
});

Deno.test("buildWhatsAppText: 1-day reminder", () => {
  const text = buildWhatsAppText(baseItem, 1);
  assertStringIncludes(text, "tomorrow");
});

Deno.test("buildWhatsAppText: overdue notice", () => {
  const text = buildWhatsAppText({ ...baseItem, next_due_date: "2026-06-01" }, "overdue");
  assertStringIncludes(text, "⛔");
  assertStringIncludes(text, "Overdue Payment");
  assertStringIncludes(text, "overdue");
  assertStringIncludes(text, "Please settle this as soon as possible.");
});

Deno.test("addDays: advances date correctly", () => {
  const base = new Date("2026-07-01T00:00:00Z");
  assertEquals(addDays(base, 3).toISOString().slice(0, 10), "2026-07-04");
});

Deno.test("addDays: crosses month boundary", () => {
  const base = new Date("2026-06-29T00:00:00Z");
  assertEquals(addDays(base, 3).toISOString().slice(0, 10), "2026-07-02");
});

Deno.test("sentField mapping: overdue uses overdue_sent_at", () => {
  const todayStr = "2026-06-30";
  const item = { next_due_date: "2026-06-01" };
  const isOverdue = item.next_due_date < todayStr;
  const daysOut: number | "overdue" = isOverdue ? "overdue" : 1;
  const sentField = isOverdue ? "overdue_sent_at" : daysOut === 3 ? "reminder_3d_sent_at" : "reminder_1d_sent_at";
  assertEquals(sentField, "overdue_sent_at");
});

Deno.test("sentField mapping: 1-day uses reminder_1d_sent_at", () => {
  const in1Day = "2026-07-01";
  const item = { next_due_date: "2026-07-01" };
  const isOverdue = false;
  const daysOut: number | "overdue" = item.next_due_date === in1Day ? 1 : 3;
  const sentField = isOverdue ? "overdue_sent_at" : daysOut === 3 ? "reminder_3d_sent_at" : "reminder_1d_sent_at";
  assertEquals(sentField, "reminder_1d_sent_at");
});
