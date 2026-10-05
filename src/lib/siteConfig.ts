export interface BankTransferConfig {
  accountName: string;
  accountNumber: string;
  bankName: string;
  enabled: boolean;
}

export interface SiteConfig {
  organizationName: string;
  productName: string;
  tagline: string;
  logoPath: string;
  markPath: string;
  faviconPath: string;
  supportEmail: string;
  frontendUrl: string;
  emailSender: string;
  calendarDomain: string;
  calendarProductId: string;
  onlinePaymentsEnabled: boolean;
  bankTransfer: BankTransferConfig;
}

type PublicEnv = Record<string, string | undefined>;
const env = (value: string | undefined) => value?.trim() ?? '';

export function createSiteConfig(source: PublicEnv, browserOrigin = ''): SiteConfig {
  const bankTransfer = {
    accountName: env(source.VITE_BANK_ACCOUNT_NAME),
    accountNumber: env(source.VITE_BANK_ACCOUNT_NUMBER),
    bankName: env(source.VITE_BANK_NAME),
  };

  return {
    organizationName: 'Coriftech Solutions Ltd.',
    productName: 'Coriftech LMS',
    tagline: "Building Africa's next tech talents.",
    logoPath: '/coriftech-logo.png',
    markPath: '/coriftech-mark.png',
    faviconPath: '/coriftech-mark.png',
    supportEmail: env(source.VITE_SUPPORT_EMAIL) || 'support@coriftech.com',
    frontendUrl: env(source.VITE_FRONTEND_URL) || browserOrigin,
    emailSender: env(source.VITE_EMAIL_SENDER),
    calendarDomain: env(source.VITE_CALENDAR_DOMAIN) || 'coriftech-lms',
    calendarProductId: '-//Coriftech LMS//EN',
    onlinePaymentsEnabled: source.VITE_ONLINE_PAYMENTS_ENABLED?.toLowerCase() === 'true',
    bankTransfer: {
      ...bankTransfer,
      enabled: Boolean(bankTransfer.accountName && bankTransfer.accountNumber && bankTransfer.bankName),
    },
  };
}

export const siteConfig = createSiteConfig(
  import.meta.env,
  typeof window === 'undefined' ? '' : window.location.origin,
);

export const getAppUrl = (path = '') => `${siteConfig.frontendUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
