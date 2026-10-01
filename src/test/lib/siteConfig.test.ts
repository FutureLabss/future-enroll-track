import { describe, expect, it } from 'vitest';
import { createSiteConfig } from '@/lib/siteConfig';

describe('createSiteConfig', () => {
  it('uses safe Coriftech defaults', () => {
    const config = createSiteConfig({}, 'http://localhost:8080');

    expect(config.productName).toBe('Coriftech LMS');
    expect(config.frontendUrl).toBe('http://localhost:8080');
  });

  it('keeps bank transfers disabled until every bank field is configured', () => {
    const incomplete = createSiteConfig({
      VITE_BANK_ACCOUNT_NAME: 'Coriftech Solutions Ltd.',
      VITE_BANK_ACCOUNT_NUMBER: '1234567890',
    });
    const complete = createSiteConfig({
      VITE_BANK_ACCOUNT_NAME: 'Coriftech Solutions Ltd.',
      VITE_BANK_ACCOUNT_NUMBER: '1234567890',
      VITE_BANK_NAME: 'Example Bank',
    });

    expect(incomplete.bankTransfer.enabled).toBe(false);
    expect(complete.bankTransfer.enabled).toBe(true);
  });

  it('keeps online payments disabled unless explicitly enabled', () => {
    expect(createSiteConfig({}).onlinePaymentsEnabled).toBe(false);
    expect(createSiteConfig({ VITE_ONLINE_PAYMENTS_ENABLED: 'true' }).onlinePaymentsEnabled).toBe(true);
  });
});
