import { supabase } from '@/lib/supabase';

// RPCs added after the last type generation are missing from Database['public']['Functions'].
interface UntypedRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function untypedRpc(fn: string, args?: Record<string, unknown>) {
  return (supabase as unknown as UntypedRpcClient).rpc(fn, args);
}
