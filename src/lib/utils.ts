import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * supabase.functions.invoke() throws a FunctionsHttpError on any non-2xx response
 * BEFORE reading the body, so `error.message` is always the SDK's generic
 * "Edge Function returned a non-2xx status code" and `data` is always undefined —
 * the real `{ error: "..." }` JSON our edge functions return is only reachable via
 * `error.context.json()`. This unwraps it, with a safe fallback for network-level
 * failures (FunctionsFetchError/FunctionsRelayError) whose context isn't a Response.
 */
export async function getFunctionErrorMessage(error: unknown, fallback = 'Something went wrong'): Promise<string> {
  const context = (error as any)?.context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // context body isn't JSON or was already consumed — fall through
    }
  }
  return (error as any)?.message || fallback;
}
