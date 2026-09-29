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
    # pdftotext marks each page break with a form feed on the first line of the new
    # page, which pushes that line's date out of column zero. The detailed layout
    # tolerated it by accident (its leading \s* matches a form feed); anchored
    # matching does not, and the record silently merged into its predecessor.
    return open(out).read().replace("\x0c", "")


def header_figures(text):
    """The statement's own totals - used to prove the parse, not to produce it."""
    g = lambda label: Decimal(
        re.search(label + r"\s+([\d,]+\.\d{2})", text).group(1).replace(",", ""))
    return g("Opening Balance"), g("Total Debits"), g("Total Credits"), g("Closing Balance")


def account_number(text):
    return re.search(r"Account Number\s+(\d+)", text).group(1)


# Moniepoint exports two different statement layouts and they parse nothing alike.
#
#   DETAILED - one column per settlement field (Settlement Debit/Credit, Balance
#     Before, Balance After, Charge). The date wraps across three lines inside a
#     9-character column ("2026-" / "01-" / "13T10:").
#   SIMPLE   - only Debit, Credit, Balance. The date wraps across two lines inside
#     a 14-character column ("2025-05-23T12:" / "21:38").
#
# The 2025 statements come out simple, the 2026 ones detailed, so a parser that
# assumes either one silently returns zero rows on the other - which is how this
# was found. DATE_COL is the width of the date column and DATE_HEAD matches the
# part of the timestamp that lands on a record's first line.
# In SIMPLE the date column's width drifts between pages too ("2025-09-08T18:" on
# one page, "2025-09-08T18" on the next), so that layout is split on line CONTENT -
# a record opens on a line that is nothing but a date fragment, and its time tail is
# a line that is nothing but MM:SS (or just MM when the seconds are dropped).
DETAILED = {"name": "detailed", "date_col": 9, "head": r"\s*\d{4}-\s*"}
SIMPLE   = {"name": "simple"}
# A SIMPLE record opens with a date fragment at the very start of a line. That
# fragment sometimes sits alone and sometimes shares the line with the narration
# ("2025-09-08T18:   PAYSTACK CHECKOUT|..."), and the column it occupies is not a
# fixed width across pages - so anchor on the token, never on a slice.
SIMPLE_DATE = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}):?\s*(.*)$")
SIMPLE_TIME = re.compile(r"\d{2}(?::\d{2})?")


def layout(text):
    """Detailed exports carry settlement columns; simple ones never do."""
    return DETAILED if "Settlement" in text and "Balance" in text else SIMPLE


def blocks(text, lay):
    lines = [l for l in text.split("\n")
             if l.strip() and not any(s in l for s in SKIP)]
    out, cur = [], []
    for l in lines:
        start = (SIMPLE_DATE.match(l) if lay is SIMPLE
                 else re.fullmatch(lay["head"], l[0:lay["date_col"]]))
        if start:
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
    # Credits from the company's own second account are NOT simply internal shuffling.
    # Jan-Sep 2026: that account sent in N1,019,600 while this one only ever sent it
    # N230,900, so at most N230,900 is money coming back - the other N788,700 is real
    # income (other income, and refunds of funds sent over earlier). This tag means
    # "needs review", not "exclude from revenue"; excluding it wholesale understates
    # January by N261,500 and March by N187,200.
    if any(a in u for a in own_accounts) \
       or "FUTURE LABS LTD TO FUTURE LABS LTD" in u \
       or "FUTURE LABS HQ TO FUTURE LABS LTD" in u:
        return "internal_transfer"
    if "REFUND" in u:
        return "refund"
    return "external"


def split_simple(b):
    """Date and narration for one SIMPLE record.

    The record opens with a date fragment ("2025-05-23T15:"), which may sit alone on
    its line or be followed on the same line by the narration. The minutes/seconds
    tail ("40:07", or "49" when the seconds are dropped) follows on a line of its
    own; a record whose tail never appears is timestamped on the hour.
    """
    m = SIMPLE_DATE.match(b[0])
    frag, head = m.group(1), ([m.group(2)] if m.group(2).strip() else [])
    rest = b[1:]
    # Preferred: the tail is a line of its own.
    for i, l in enumerate(rest):
        if SIMPLE_TIME.fullmatch(l.strip()):
            return frag + ":" + l.strip(), head + rest[:i] + rest[i + 1:]
    # Otherwise it leads a narration continuation ("10:24  SIMON|TRF|..."). Checked
    # only after the standalone form is ruled out, so it cannot strip a leading
    # figure off an ordinary narration line.
    for i, l in enumerate(rest):
        lead = re.match(r"\s*(\d{2}(?::\d{2})?)\s+(\S.*)$", l)
        if lead:
            return (frag + ":" + lead.group(1),
                    head + rest[:i] + [lead.group(2)] + rest[i + 1:])
    return frag + ":00", head + rest


def parse(pdf, own_accounts):
    text = to_text(pdf)
    acct = account_number(text)
    lay = layout(text)
    opening, tot_debit, tot_credit, closing = header_figures(text)
    rows, unverified = [], 0
    running = opening
    for b in blocks(text, lay):
        if lay is SIMPLE:
            date, body = split_simple(b)
        else:
            date = "".join(l[0:lay["date_col"]].strip() for l in b)
        # A handful of rows render without seconds (e.g. 2026-03-05T15:27). Pad rather
        # than drop them - the minute is still the bank's, and these are real money.
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", date):
            date += ":00"
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", date):
            raise SystemExit(f"unparseable timestamp {date!r}")
        if lay is not SIMPLE:
            body = [l[lay["date_col"]:] for l in b]
        flat = re.sub(r"\s+", " ", " ".join(body)).strip()
        vals = [Decimal(t.replace(",", "")) for t in NUM.findall(flat)]
        if lay is SIMPLE:
            # Debit, Credit, Balance - in that order, last three on the row. There is
            # no balance-before column to difference against, so the running balance
            # carried from the opening figure is what proves each row: it must land
            # exactly on the balance the statement prints.
            debit, credit, ba = vals[-3], vals[-2], vals[-1]
            delta = credit - debit
            if abs((running + delta) - ba) >= Decimal("0.005"):
                unverified += 1
            running = ba
        else:
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
