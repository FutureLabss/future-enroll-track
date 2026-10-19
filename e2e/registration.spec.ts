import { test, expect, type Page } from '@playwright/test';

const userId = '10000000-0000-0000-0000-000000000001';
const programId = '20000000-0000-0000-0000-000000000001';
const registrationId = '30000000-0000-0000-0000-000000000001';
const invoiceId = '40000000-0000-0000-0000-000000000001';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'applicant@example.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-19T10:00:00Z' };
const registration = { id: registrationId, registration_number: 'REG-2026-000001', registration_flow_version: 2,
  program_id: programId, program_name: 'Data Analytics', full_name: 'Applicant Test', email: user.email,
  invoice_id: invoiceId, total_amount: 100000, amount_paid: 0, initial_payment_amount: 50000,
  registration_payment_option: 'installment', profile_completed_at: null, profile_available: false, eligible: false, enrollment_status: 'pending' };

async function mockApi(page: Page, initial = false) {
  let started = initial;
  let profileComplete = false;
  const submitted: Record<string, unknown>[] = [];
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now()/1000)+3600, role:'authenticated', aud:'authenticated' })).toString('base64url'), 'test'].join('.');
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/user') ? user :
    { access_token:token, refresh_token:'test-refresh', expires_in:3600, token_type:'bearer', user } }));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/rest/v1/')[1];
    let result: unknown = [];
    if (endpoint === 'user_roles') result = [{role:'student'}];
    if (endpoint === 'rpc/get_registration_progress') result = { dashboard_access:false, registrations:started ? [{...registration,profile_available:initial,profile_completed_at:profileComplete ? '2026-10-19T11:00:00Z' : null}] : [] };
    if (endpoint === 'programs') result = [{ id:programId,program_name:'Data Analytics',tuition_fee:100000,registration_plans:[{label:'Two payments',parts:[{percent:50,days:0},{percent:50,days:30}]}] }];
    if (endpoint === 'rpc/start_registration') { submitted.push(request.postDataJSON()); started=true; result=registrationId; }
    if (endpoint === 'installments') result = [{id:'part',amount:50000,due_date:'2026-10-19',status:'pending'}];
    if (endpoint === 'pending_payments' && initial) result=[{id:'transfer',status:'pending'}];
    if (endpoint === 'rpc/get_enrollment_for_completion') result=[{...registration,user_id:userId,hub_id:'00000000-0000-0000-0000-000000000001',profile_requirements_version:1}];
    if (endpoint === 'custom_fields') result=[{id:'field',key:'first_name',label:'First name',field_type:'text',required:true,active:true,visible_to_student:true,sort_order:0}];
    if (endpoint === 'rpc/submit_enrollment_fields') { profileComplete=true; result=null; }
    if (request.method()==='HEAD') { await route.fulfill({status:200,headers:{'content-range':'0-0/0'}}); return; }
    await route.fulfill({json:result});
  });
  return submitted;
}
async function login(page: Page) {
  await page.goto('/login?next=/enroll');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Student registration'})).toBeVisible();
}
test('requires a login before starting registration', async ({page}) => {
  await page.goto('/enroll');
  await expect(page.getByRole('button',{name:'Create account / sign in'})).toBeVisible();
  await page.getByRole('button',{name:'Create account / sign in'}).click();
  await expect(page).toHaveURL(/login\?next=\/enroll/);
});
test('shows course pricing and saves the selected installment plan once', async ({page}) => {
  const submitted=await mockApi(page);
  await login(page);
  await page.getByLabel('Full name',{exact:true}).fill('Applicant Test');
  await page.getByLabel('WhatsApp number').fill('+2348012345678');
  await page.getByLabel('Course',{exact:true}).selectOption(programId);
  await page.getByLabel('Payment option').selectOption('installment');
  await page.getByLabel('Installment plan').selectOption('Two payments');
  await expect(page.getByText(/Pay now:.*50,000/)).toBeVisible();
  await page.getByRole('button',{name:'Save and proceed to payment'}).click();
  await expect(page.getByText('REG-2026-000001',{exact:true})).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({p_option:'installment',p_plan_label:'Two payments',p_program_id:programId});
  expect(submitted[0]).not.toHaveProperty('total_amount');
  await page.reload();
  await expect(page.getByText('REG-2026-000001',{exact:true})).toBeVisible();
  expect(submitted).toHaveLength(1);
});
test('receipt review permits segment 2 but blocks dashboard access', async ({page}) => {
  await mockApi(page,true);
  await login(page);
  await expect(page.getByText(/Payment review is pending/)).toBeVisible();
  await page.getByRole('button',{name:'Continue to segment 2'}).click();
  await expect(page.getByRole('heading',{name:'Complete Your Profile'})).toBeVisible();
  await page.getByLabel(/First name/i).fill('Applicant');
  await page.getByRole('button',{name:'Save & Complete'}).click();
  await expect(page.getByText(/Profile complete. Awaiting payment clearance/)).toBeVisible();
  await page.goto('/student');
  await expect(page).toHaveURL(/\/enroll/);
});
