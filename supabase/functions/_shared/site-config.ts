export interface BackendSiteConfig {
  organizationName: string;
  productName: string;
  frontendUrl: string;
  emailFrom: string;
  supportEmail: string;
  adminNotifyEmails: string[];
  bank: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    enabled: boolean;
  };
}

const value = (name: string) => Deno.env.get(name)?.trim() ?? '';

export function getSiteConfig(): BackendSiteConfig {
  const frontendUrl = value('FRONTEND_URL').replace(/\/$/, '');
  const emailFrom = value('EMAIL_FROM');
  if (!frontendUrl) throw new Error('FRONTEND_URL is not configured');
  if (!emailFrom) throw new Error('EMAIL_FROM is not configured');

  const accountName = value('BANK_ACCOUNT_NAME');
  const accountNumber = value('BANK_ACCOUNT_NUMBER');
  const bankName = value('BANK_NAME');

  return {
    organizationName: 'Coriftech Solutions Ltd.',
    productName: 'Coriftech LMS',
    frontendUrl,
    emailFrom,
    supportEmail: value('SUPPORT_EMAIL') || 'support@coriftech.com',
    adminNotifyEmails: value('ADMIN_NOTIFY_EMAILS').split(',').map(email => email.trim()).filter(Boolean),
    bank: {
      accountName,
      accountNumber,
      bankName,
      enabled: Boolean(accountName && accountNumber && bankName),
    },
  };
}

export function bankTransferText(config: BackendSiteConfig) {
  if (!config.bank.enabled) return '';
  return `\n\nBank transfer:\n${config.bank.accountName} · ${config.bank.accountNumber} · ${config.bank.bankName}\n(Upload receipt after paying)`;
}
