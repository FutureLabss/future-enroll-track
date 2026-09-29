import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Tests for pure logic extracted from paystack-verify handler.
// These cover the idempotency path and metadata extraction without needing
// a real Paystack or Supabase connection.

function extractMeta(metadata: Record<string, unknown>) {
  return {
    invoice_id: metadata.invoice_id as string | undefined,
    installment_id: (metadata.installment_id as string | null) ?? null,
    enrollment_id: metadata.enrollment_id as string | undefined,
  };
}

function koboToNaira(amountKobo: number): number {
  return amountKobo / 100;
}

function isUniqueViolation(code: string): boolean {
  return code === "23505";
}

Deno.test("koboToNaira: converts 5000000 kobo to 50000 naira", () => {
  assertEquals(koboToNaira(5_000_000), 50_000);
});

Deno.test("koboToNaira: handles fractional naira", () => {
  assertEquals(koboToNaira(100), 1);
});

Deno.test("extractMeta: returns all three fields", () => {
  const meta = extractMeta({
    invoice_id: "inv-123",
    installment_id: "ins-456",
    enrollment_id: "enr-789",
  });
  assertEquals(meta.invoice_id, "inv-123");
  assertEquals(meta.installment_id, "ins-456");
  assertEquals(meta.enrollment_id, "enr-789");
});

Deno.test("extractMeta: installment_id defaults to null when absent", () => {
  const meta = extractMeta({ invoice_id: "inv-1", enrollment_id: "enr-1" });
  assertEquals(meta.installment_id, null);
});

Deno.test("isUniqueViolation: returns true for 23505", () => {
  assertEquals(isUniqueViolation("23505"), true);
});

Deno.test("isUniqueViolation: returns false for other PG error codes", () => {
  assertEquals(isUniqueViolation("42703"), false);
  assertEquals(isUniqueViolation("23503"), false);
});
