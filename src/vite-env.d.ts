/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_EMAIL_SENDER?: string;
  readonly VITE_BANK_ACCOUNT_NAME?: string;
  readonly VITE_BANK_ACCOUNT_NUMBER?: string;
  readonly VITE_BANK_NAME?: string;
  readonly VITE_CALENDAR_DOMAIN?: string;
  readonly VITE_HUB_DOMAIN_SUFFIX?: string;
  readonly VITE_ONLINE_PAYMENTS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
