#!/usr/bin/env python3
"""
Turn a Moniepoint account-statement PDF into bank_transactions rows.

    python3 scripts/import-bank-statement.py statement.pdf > import.sql

Then run import.sql in the Supabase SQL editor. Re-running an overlapping period is
a no-op: every row is ON CONFLICT (account_number, transaction_ref) DO NOTHING.

Why the parser works the way it does
------------------------------------
pdftotext -layout does NOT hold its column positions across the statement - the
"COMPLETED" column alone lands at 8 different offsets - so fixed-width slicing
silently mangles later pages. Instead each record is split on its leading "2026-"
date fragment, flattened, and the money columns are taken by position from the end
(balance_before, balance_after, and a trailing charge only when a Reversal Status
"N/A" is present).

Every row is then checked: |balance_after - balance_before| must equal one of the
settlement figures printed on the same row. The run also asserts that the credits
and debits it extracted sum to the totals the statement prints for itself, and that
opening + credits - debits lands exactly on the printed closing balance. If any of
those fail the script exits non-zero rather than emitting a plausible-looking file.
"""
import re, subprocess, sys, tempfile, os
from decimal import Decimal

FUTURELABS_HUB = "00000000-0000-0000-0000-000000000001"
NUM = re.compile(r"\d{1,3}(?:,\d{3})*\.\d{2}")
SKIP = ("Account Statement", "Business Name", "Account Number", "Opening Balance",
        "Total Debits", "Total Credits", "Closing Balance", "Balance     Balance",
        "Transaction Ref")


def to_text(pdf):
    out = tempfile.mktemp(suffix=".txt")
    subprocess.run(["pdftotext", "-layout", pdf, out], check=True)
    return open(out).read()


def header_figures(text):
    """The statement's own totals - used to prove the parse, not to produce it."""
    g = lambda label: Decimal(
        re.search(label + r"\s+([\d,]+\.\d{2})", text).group(1).replace(",", ""))
    return g("Opening Balance"), g("Total Debits"), g("Total Credits"), g("Closing Balance")


def account_number(text):
    return re.search(r"Account Number\s+(\d+)", text).group(1)


def blocks(text):
    lines = [l for l in text.split("\n")
             if l.strip() and not any(s in l for s in SKIP)]
    out, cur = [], []
    for l in lines:
        if re.fullmatch(r"\s*\d{4}-\s*", l[0:9]):
            if cur:
                out.append(cur)
            cur = [l]
        elif cur:
            cur.append(l)
    if cur:
        out.append(cur)
    return out


def payer(text):
    for p in [r"(?:Transfer|TRF|TRANSFER)\s+from\s+([A-Za-z][A-Za-z',\.\- ]{4,60})",
              r"\bFROM\s+([A-Z][A-Za-z',\.\- ]{4,60})",
              r"\b([A-Z][A-Z',\.\- ]{6,60}?)\s+TO\s+Future Labs",
              r"\|([A-Z][A-Z ]{6,60})\s*$",
              r"([A-Z][A-Za-z]+ [A-Z][A-Za-z]+ [A-Z][A-Za-z]+)\s*:\s*\d{10,}"]:
        m = re.search(p, text)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip(" -,.")
    return None


def classify(text, own_accounts):
    u = text.upper()
    # Money moved between the company's own two Moniepoint accounts is not income.
    # Counting it as revenue overstates Jan-Sep 2026 by ~N1.02m.
    if any(a in u for a in own_accounts) \
       or "FUTURE LABS LTD TO FUTURE LABS LTD" in u \
       or "FUTURE LABS HQ TO FUTURE LABS LTD" in u:
        return "internal_transfer"
    if "REFUND" in u:
        return "refund"
    return "external"


def parse(pdf, own_accounts):
    text = to_text(pdf)
    acct = account_number(text)
    opening, tot_debit, tot_credit, closing = header_figures(text)
    rows, unverified = [], 0
    for b in blocks(text):
        date = "".join(l[0:9].strip() for l in b)
        # A handful of rows render without seconds (e.g. 2026-03-05T15:27). Pad rather
        # than drop them - the minute is still the bank's, and these are real money.
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", date):
            date += ":00"
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", date):
            raise SystemExit(f"unparseable timestamp {date!r}")
        flat = re.sub(r"\s+", " ", " ".join(l[9:] for l in b)).strip()
        vals = [Decimal(t.replace(",", "")) for t in NUM.findall(flat)]
        has_na = " N/A " in f" {flat} "
        bb, ba = (vals[-3], vals[-2]) if has_na else (vals[-2], vals[-1])
        delta = ba - bb
        if not (any(abs(abs(delta) - v) < Decimal("0.005") for v in vals[:-2])
                or abs(delta) < Decimal("0.005")):
            unverified += 1
        # The transaction reference is the token ending in _CREDIT_n / _DEBIT_n
        # (optionally _RVSL for reversals). Matching on the scheme prefix instead
        # (TRF, MIT, ...) silently picks up the bare word "TRF" out of narration
        # text like "ONB TRF FROM LAWRENCE", which collides across rows.
        m = re.search(r"\S*_(?:CREDIT|DEBIT)_\d+(?:_RVSL)?", flat)
        rows.append({"occurred_at": date, "amount": delta, "balance_after": ba,
                     "transaction_ref": m.group(0) if m else f"NOREF-{date}-{ba}",
                     "narration": flat, "payer": payer(flat),
                     "kind": classify(flat, own_accounts)})

    credits = sum(r["amount"] for r in rows if r["amount"] > 0)
    debits = sum(-r["amount"] for r in rows if r["amount"] < 0)
    problems = []
    if unverified:
        problems.append(f"{unverified} rows whose balance delta matches no settlement column")
    if credits != tot_credit:
        problems.append(f"credits {credits} != statement total {tot_credit}")
    if debits != tot_debit:
        problems.append(f"debits {debits} != statement total {tot_debit}")
    if opening + credits - debits != closing:
        problems.append(f"opening+credits-debits != closing {closing}")
    if problems:
        raise SystemExit("REFUSING TO EMIT - parse did not reconcile:\n  " + "\n  ".join(problems))
    return acct, rows, (opening, credits, debits, closing)


def sql_str(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    pdf = sys.argv[1]
    # The company's other Moniepoint account. Credits from it are internal transfers.
    own = os.environ.get("OWN_ACCOUNTS", "8288325467").split(",")
    acct, rows, (opening, credits, debits, closing) = parse(pdf, own)

    print(f"-- Imported from {os.path.basename(pdf)}")
    print(f"-- account {acct}: {len(rows)} rows, credits {credits:,} debits {debits:,}, "
          f"opening {opening:,} -> closing {closing:,} (reconciled)")
    print("BEGIN;")
    for r in rows:
        print("INSERT INTO public.bank_transactions "
              "(hub_id, account_number, occurred_at, amount, balance_after, "
              "transaction_ref, narration, payer, kind, statement_source) VALUES ("
              f"'{FUTURELABS_HUB}', {sql_str(acct)}, {sql_str(r['occurred_at'])}, "
              f"{r['amount']}, {r['balance_after']}, {sql_str(r['transaction_ref'])}, "
              f"{sql_str(r['narration'])}, {sql_str(r['payer'])}, {sql_str(r['kind'])}, "
              f"{sql_str(os.path.basename(pdf))}) "
              "ON CONFLICT (account_number, transaction_ref) DO NOTHING;")
    print("COMMIT;")


if __name__ == "__main__":
    main()
