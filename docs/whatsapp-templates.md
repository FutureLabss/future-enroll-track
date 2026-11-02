# WhatsApp message templates

Meta only delivers messages a business starts as **pre-approved templates**. These are the
ten the LMS sends. Submit each one in Twilio (Console → Messaging → Content Template
Builder → Create new), then put the IDs Twilio gives back (`HX…`) into one Supabase
secret, `TWILIO_TEMPLATES`:

```json
{"invoice_created":"HX…","account_setup":"HX…","payment_reminder":"HX…","overdue":"HX…",
 "overdue_pause_warning":"HX…","overdue_paused":"HX…","guardian_overdue":"HX…",
 "payment_received":"HX…","invoice_settled":"HX…","dropout_checkin":"HX…"}
```

For every template:

- **Content type:** Text. **Language:** English. **Category:** Utility (all ten are about the
  person's own enrollment or payment). If Meta re-files one as Marketing it still works,
  it just costs more per message.
- **Template name:** use the key in the heading, e.g. `overdue_pause_warning`.
- **Body:** copy it exactly. `{{1}}`, `{{2}}`… are filled in by the LMS in that order. The
  code in `supabase/functions/send-notification/index.ts` (`whatsAppTemplate`) and
  `send-dropout-outreach` must match, so change both together.
- **Sample values:** Meta asks for one per variable; use the ones listed.

Messages only go to students who ticked the WhatsApp consent box (`enrollments.whatsapp_opt_in`)
and to guardians the student agreed we may contact (`guardian_contact_opt_in`).

---

## 1. `invoice_created`
> Hi {{1}}, your FutureLabs invoice {{2}} for {{3}} is ready. The amount is {{4}}, with the first payment due on {{5}}. Please complete your enrollment profile here: {{6}} Thank you.

Samples: `Ada` · `INV-001234` · `Web Development` · `₦150,000` · `15 November 2026` · `https://admin.futurelabs.ng/students/1b2c3d4e`

## 2. `account_setup`
> Hi {{1}}, you are enrolled in {{2}} at FutureLabs. Please create your student account and complete your profile here: {{3}} Reply to this message if you need any help.

Samples: `Ada` · `Web Development` · `https://admin.futurelabs.ng/students/1b2c3d4e`

## 3. `payment_reminder`
> Hi {{1}}, this is a reminder that your payment of {{2}} for {{3}} is due on {{4}}. You can pay online here: {{5}} or by bank transfer to FutureLabs Ltd, 8288339819, Moniepoint MFB. Please upload your receipt after paying.

Samples: `Ada` · `₦50,000` · `Web Development` · `15 November 2026` · `https://admin.futurelabs.ng/student/invoices/9f8e7d6c?pay=1`

## 4. `overdue`
Days 1 and 3.
> Hi {{1}}, your payment of {{2}} for {{3}} was due on {{4}} and is now overdue. Please pay here: {{5}} If you need more time, reply to this message so we can agree a payment date.

Samples: `Ada` · `₦50,000` · `Web Development` · `1 November 2026` · `https://admin.futurelabs.ng/student/invoices/9f8e7d6c?pay=1`

## 5. `overdue_pause_warning`
Day 7 until access pauses.
> Hi {{1}}, your payment of {{2}} for {{3}} is {{4}} days overdue. If it is not paid, or a payment date agreed with us, by {{5}}, your access to classes, materials and assignments will be paused. Pay here: {{6}} Reply to this message if you need to agree a plan.

Samples: `Ada` · `₦50,000` · `Web Development` · `10` · `8 December 2026` · `https://admin.futurelabs.ng/student/invoices/9f8e7d6c?pay=1`

## 6. `overdue_paused`
> Hi {{1}}, your payment of {{2}} for {{3}} is {{4}} days overdue, so your classroom access is paused. It is restored as soon as you pay or agree a payment date with us. Pay here: {{5}} Reply to this message or call the front desk to agree a plan.

Samples: `Ada` · `₦50,000` · `Web Development` · `37` · `https://admin.futurelabs.ng/student/invoices/9f8e7d6c?pay=1`

## 7. `guardian_overdue`
To the guardian, from day 30, only if the student agreed we may contact them.
> Hello {{1}}, this is FutureLabs. The fees for {{2}} on our {{3}} programme are {{4}} days overdue, with {{5}} outstanding, and their classroom access {{6}}. Please help us resolve this. You can pay online here: {{7}} or call us to agree a payment plan.

Samples: `Mrs Obi` · `Ada Obi` · `Web Development` · `30` · `₦50,000` · `is now paused` · `https://admin.futurelabs.ng/student/invoices/9f8e7d6c?pay=1`

(`{{6}}` is either `is now paused` or `pauses on 8 December 2026`.)

## 8. `payment_received`
> Hi {{1}}, thank you, we have received your payment on invoice {{2}}. Total paid so far: {{3}}. Remaining balance: {{4}}. Thank you.

Samples: `Ada` · `INV-001234` · `₦100,000` · `₦50,000`

## 9. `invoice_settled`
> Hi {{1}}, invoice {{2}} for {{3}} is now fully paid. Thank you for completing your payment.

Samples: `Ada` · `INV-001234` · `Web Development`

## 10. `dropout_checkin`
After three weeks without attendance, and once more a week later.
> Hi {{1}}, we noticed you haven't attended {{2}} for a few weeks. Please let us know whether you would like to rejoin the next cohort or withdraw from the programme: {{3}} Reply to this message if you would like to talk to us.

Samples: `Ada` · `Web Development` · `https://admin.futurelabs.ng/reconnect/3fa9c1`

---

## Why these will pass review

- They state facts about the person's own invoice or enrollment, with no offers,
  discounts or "we'd love you back": that's what keeps them in the Utility category.
- No variable is at the very start or end of a message, and no two sit side by side.
- The tone is firm, not threatening. Pressure belongs in email; WhatsApp numbers that
  get blocked or reported lose their quality rating and their sending limits.
