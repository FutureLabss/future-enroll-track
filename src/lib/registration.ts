import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// The migration extends the generated schema. Keep the boundary here until typegen runs.
export const registrationDb = supabase as SupabaseClient;
export interface RegistrationPlan { label: string; parts: { percent: number; days: number }[] }
export interface Registration {
  id: string; registration_number: string; registration_flow_version: number; program_id: string;
  program_name: string; full_name: string; email: string; phone: string; invoice_id: string;
  total_amount: number; amount_paid: number; initial_payment_amount: number;
  profile_completed_at: string | null; profile_available: boolean; eligible: boolean;
  registration_payment_option: 'full' | 'installment' | 'custom';
  custom_amount_status: 'pending' | 'approved' | 'rejected' | null;
  custom_review_reason: string | null; enrollment_status: string;
}
export interface RegistrationProgress { dashboard_access: boolean; registrations: Registration[] }
export async function getRegistrationProgress(): Promise<RegistrationProgress> {
  const { data, error } = await registrationDb.rpc('get_registration_progress');
  if (error) throw error;
  return data as RegistrationProgress;
}
export const formatNaira = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(amount));
export function registrationError(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}
export function validateReceipt(file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, JPG, PNG, or WebP receipt');
  if (file.size > 5 * 1024 * 1024) throw new Error('Receipt must be 5 MB or smaller');
}
export function planAmounts(fee: number, plan: RegistrationPlan) {
  let allocated = 0;
  return plan.parts.map((part, index) => {
    const amount = index === plan.parts.length - 1 ? Math.round((fee - allocated) * 100) / 100 : Math.round(fee * part.percent) / 100;
    allocated += amount;
    return { amount, days: part.days };
  });
}
