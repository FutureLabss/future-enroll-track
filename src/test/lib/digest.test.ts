import { describe, it, expect } from 'vitest';
import { nextDigestSlot } from '@/lib/digest';
import {
  bodyToHtml, firstName, personalize, renderDigestEmail, signUnsubscribeToken, verifyUnsubscribeToken,
} from '../../../supabase/functions/_shared/digestEmail';

describe('nextDigestSlot', () => {
  it('picks the coming Monday 07:00 WAT (06:00 UTC)', () => {
    // Wednesday 29 Oct 2026, 12:00 UTC
    expect(nextDigestSlot(new Date('2026-10-29T12:00:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('uses the same Monday before 07:00 WAT', () => {
    expect(nextDigestSlot(new Date('2026-11-02T05:59:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('moves to next week once Monday 07:00 WAT has passed', () => {
    expect(nextDigestSlot(new Date('2026-11-02T06:00:00Z')).toISOString()).toBe('2026-11-09T06:00:00.000Z');
  });

  it('handles Sunday night in Lagos (still Sunday in UTC)', () => {
    expect(nextDigestSlot(new Date('2026-11-01T23:30:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });
});

describe('digest rendering', () => {
  it('personalises names with a friendly fallback', () => {
    expect(firstName('Ada  Obi')).toBe('Ada');
    expect(firstName(null)).toBe('there');
    expect(personalize('Hi {{first_name}} ({{ name }})', 'Ada Obi')).toBe('Hi Ada (Ada Obi)');
    expect(personalize('Hi {{first_name}}', '')).toBe('Hi there');
  });

  it('treats the body as plain text: escapes HTML, keeps paragraphs and line breaks, links URLs', () => {
    const html = bodyToHtml('Hello <b>all</b>\nline two\n\nSee https://futurelabs.ng/apply.');
    expect(html).toContain('Hello &lt;b&gt;all&lt;/b&gt;<br/>line two');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('<a href="https://futurelabs.ng/apply"');
    expect(html).toContain('apply</a>.');
  });

  it('renders subject, unsubscribe link and plain-text part', () => {
    const out = renderDigestEmail({
      subject: 'This week for {{first_name}}', body: 'Body', name: 'Ada Obi', hubName: 'FutureLabs',
      unsubscribeUrl: 'https://x.supabase.co/functions/v1/email-unsubscribe?token=abc',
    });
    expect(out.subject).toBe('This week for Ada');
    expect(out.html).toContain('href="https://x.supabase.co/functions/v1/email-unsubscribe?token=abc"');
    expect(out.html).toContain('FutureLabs weekly digest');
    expect(out.text).toContain('Unsubscribe: https://x.supabase.co');
  });

  it('fills extra tags, blanks empty ones and leaves unknown ones alone', () => {
    const vars = { program: 'Data Analysis', cohort: '' };
    expect(personalize('{{first_name}} joins {{ Program }}{{cohort}} {{unknown}}', 'Ada', vars))
      .toBe('Ada joins Data Analysis {{unknown}}');
  });

  it('uses a custom footer for onboarding emails, escaped', () => {
    const out = renderDigestEmail({
      subject: 'Welcome to {{hub}}', body: 'Hi', name: 'Ada', hubName: 'FutureLabs',
      unsubscribeUrl: 'https://x/u', vars: { hub: 'FutureLabs' },
      footer: "You're receiving this because you recently enrolled with <FutureLabs>.",
    });
    expect(out.subject).toBe('Welcome to FutureLabs');
    expect(out.html).toContain('enrolled with &lt;FutureLabs&gt;.');
    expect(out.html).not.toContain('weekly digest');
  });
});

describe('unsubscribe tokens', () => {
  const secret = 'test-secret';

  it('round-trips hub and normalised email', async () => {
    const token = await signUnsubscribeToken(secret, 'hub-1', '  Ada@Example.com ');
    expect(await verifyUnsubscribeToken(secret, token)).toEqual({ hubId: 'hub-1', email: 'ada@example.com' });
  });

  it('rejects a token signed with another secret or tampered with', async () => {
    const token = await signUnsubscribeToken(secret, 'hub-1', 'ada@example.com');
    expect(await verifyUnsubscribeToken('other', token)).toBeNull();
    const [, sig] = token.split('.');
    const forged = `${btoa(JSON.stringify({ h: 'hub-1', e: 'someone@else.com' })).replace(/=+$/, '')}.${sig}`;
    expect(await verifyUnsubscribeToken(secret, forged)).toBeNull();
    expect(await verifyUnsubscribeToken(secret, 'garbage')).toBeNull();
  });
});
