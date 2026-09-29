import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Copy, Download, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerReport } from '@/hooks/usePartnerReport';
import { PartnerReportResult, TraineeRow, TrainingStatus } from '@/lib/partnerReport';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Kind = 'count' | 'percent' | 'naira' | 'text';

interface Field {
  col: string;
  question: string;
  kind: Kind;
  value?: string | number | null;
  note: string;
}

const STATUS_COLOURS: Record<TrainingStatus, string> = {
  completed: 'bg-success/10 text-success border-success/30',
  in_training: 'bg-primary/10 text-primary border-primary/30',
  not_started: 'bg-muted text-muted-foreground',
  no_cohort: 'bg-warning/10 text-warning border-warning/30',
};

const STATUS_LABELS: Record<TrainingStatus, string> = {
  completed: 'Completed',
  in_training: 'In training',
  not_started: 'Cohort not started',
  no_cohort: 'No cohort',
};

const MANUAL = 'Not tracked in the LMS. Enter it by hand.';

const naira = (v: number) => `₦${Number(v).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-NG');
const pctText = (v: number | null) => (v === null ? 'n/a' : `${v}%`);

function buildFields(r: PartnerReportResult, hub: { name: string; contact_email: string | null } | null): Field[] {
  const y = r.period.year;
  const partial = r.period.inProgress ? ` The quarter is still running, so this is the figure to date (${date(r.period.asOf)}).` : '';
  const staffHint = r.newStaff.length
    ? ` Staff records added this quarter: ${r.newStaff.map(s => `${s.full_name} (${s.role_title ?? 'no title'})`).join(', ')}. The LMS doesn't record whether a role is full-time or part-time, or the real hire date.`
    : ' No staff records were added this quarter.';
  const sponsorLines = r.sponsorIncome.map(s => `${s.name} ${naira(s.amount)}`).join(' · ');

  return [
    { col: 'B', question: 'Name of Partner Organization', kind: 'text', value: hub?.name?.toUpperCase() ?? '', note: 'Hub name.' },
    { col: 'C', question: 'Organization Email Address', kind: 'text', value: hub?.contact_email ?? '', note: 'Hub contact email.' },
    {
      col: 'D',
      question: `In ${y}, what is the total number of persons that have completed training with your organization?`,
      kind: 'count',
      value: r.completedYear,
      note: `Enrollments whose last cohort ended between 1 Jan ${y} and ${date(r.period.asOf)}. Based on cohort end dates, because an enrollment marked "completed" only means it's fully paid.`,
    },
    {
      col: 'E',
      question: 'What number completed training in this reporting quarter?',
      kind: 'count',
      value: r.completedQuarter,
      note: `Enrollments whose last cohort ended between ${date(r.period.start)} and ${date(r.period.asOf)}.`,
    },
    {
      col: 'F',
      question: 'What % of this total number (column E) received funding or scholarship from PIND (YEP)?',
      kind: 'percent',
      value: r.completedQuarterPindPct,
      note: 'Share of column E whose enrollment is linked to the PIND organization.',
    },
    {
      col: 'G',
      question: `In ${y}, what is the total number of persons that are still in training with your organization?`,
      kind: 'count',
      value: r.inTraining,
      note: `Enrollments with a cohort that has started but not yet ended as of ${date(r.period.asOf)}. ${r.gaps.notStarted} more are in cohorts that haven't started yet and aren't counted.`,
    },
    {
      col: 'H',
      question: 'What number still in training was enrolled THIS YEAR?',
      kind: 'count',
      value: r.inTrainingEnrolledThisYear,
      note: `Column G, limited to students whose first cohort started in ${y}.`,
    },
    {
      col: 'I',
      question: 'What % of this total number (column H) received funding or scholarship from PIND (YEP)?',
      kind: 'percent',
      value: r.inTrainingThisYearPindPct,
      note: 'Share of column H linked to the PIND organization.',
    },
    {
      col: 'J',
      question: `What % of those completed training or in training in ${y} are youths (16-35)?`,
      kind: 'percent',
      value: r.youthPct,
      note: `Out of D + G (${r.youthBase} people), ${r.youthAgeKnown} have a date of birth or age category on file. The % is of those ${r.youthAgeKnown}; ${r.gaps.ageUnknown} with no age data are left out.`,
    },
    {
      col: 'K',
      question: 'What % of the youths (COLUMN J) received scholarship support from PIND (YEP)',
      kind: 'percent',
      value: r.youthPindPct,
      note: 'Share of the youths in column J linked to the PIND organization.',
    },
    {
      col: 'L',
      question: 'In this quarter, what is the ADDITIONAL amount of income generated from paid skills training from individuals (trainee payment including partial and full payment)',
      kind: 'naira',
      value: r.tuitionIncome,
      note: `Tuition received this quarter (paid installments and payments, cancelled invoices excluded, bank date used where reconciled), the same basis as the Finance Dashboard.${partial} By sponsor: ${sponsorLines || 'none'}.`,
    },
    {
      col: 'M',
      question: 'In THIS QUARTER, how much NEW external funding have you leveraged from other partners and donors to provide skills training?',
      kind: 'naira',
      value: r.externalFunding,
      note: 'Suggested figure: tuition received this quarter for enrollments linked to a sponsor organization other than PIND. Check it before submitting, because some sponsor records (such as "Intern") aren\'t external funders.',
    },
    {
      col: 'N',
      question: 'List the external funders/donors (CSOs/NGOs/private investors/businesses or development agency funding youth skills programs, either through scholarships, technical assistance etc.',
      kind: 'text',
      value: r.externalFunders.join(', '),
      note: 'Suggested list: the sponsor organizations counted in column M.',
    },
    {
      col: 'O',
      question: 'What is the average cost of your skills training?',
      kind: 'naira',
      value: r.averageCost,
      note: `Average invoiced total of enrollments created in ${y}, excluding free and cancelled ones.`,
    },
    { col: 'P', question: 'How many NEW full time staff did you engage in this QUARTER?', kind: 'count', note: MANUAL + staffHint },
    { col: 'Q', question: 'How many NEW part-time employees did you engage this QUARTER?', kind: 'count', note: MANUAL + staffHint },
    {
      col: 'R',
      question: 'By what % did the income of your organization increase THIS QUARTER compare to the LAST QUARTER, If at all?',
      kind: 'percent',
      value: r.incomeChangePct,
      note: `Tuition + other income: ${naira(r.tuitionIncome + r.otherIncome)} this quarter vs ${naira(r.tuitionIncomePrev + r.otherIncomePrev)} last quarter. A negative figure means income fell.${partial}`,
    },
    { col: 'S', question: 'What is the number of trained persons by your organization that are NEWLY linked to diverse forms of employment, THIS QUARTER?', kind: 'count', note: MANUAL },
    { col: 'T', question: 'What is the number of trained persons by your organization that are NEWLY linked to waged employment, THIS QUARTER?', kind: 'count', note: MANUAL },
    { col: 'U', question: 'What is the number of trained persons by your organization that are NEWLY supported / linked to business startup THIS QUARTER?', kind: 'count', note: MANUAL },
    { col: 'V', question: 'What is the number of trained persons by your organization that are NEWLY linked to internship, THIS QUARTER?', kind: 'count', note: MANUAL },
    { col: 'W', question: 'What % of this total number (column T, U and V) received funding or scholarship from PIND (YEP)?', kind: 'percent', note: MANUAL },
    { col: 'X', question: 'What is the number of trained persons by your organization that are NOT yet linked to any form of employment?', kind: 'count', note: MANUAL },
    { col: 'Y', question: 'List the government agencies you currently collaborate with to provide skills training?', kind: 'text', note: MANUAL },
    { col: 'Z', question: 'What aspect of your skills training program promotes or adapts climate smart practices - IF any?', kind: 'text', note: MANUAL },
    { col: 'AA', question: 'List the coastal areas in the niger-delta region or HCDTs where beneficiaries have received or are receiving skills training from your center THIS QUARTER', kind: 'text', note: MANUAL },
    { col: 'AB', question: 'List the components of the NDYEP model that you are applying to your training in general?', kind: 'text', note: MANUAL },
    { col: 'AC', question: 'THIS QUARTER, how many organizations are NEWLY adopting or adapting aspects of your training model in their own approach and methodology to boost their own outcomes?', kind: 'count', note: MANUAL },
    { col: 'AD', question: 'What aspects of your training model and approach do you consider that is being adopted or adapted?', kind: 'text', note: MANUAL },
  ];
}

function toCell(kind: Kind, raw: string): string | number {
  if (kind === 'text' || raw.trim() === '') return raw;
  const n = Number(raw.replace(/[₦,%\s]/g, ''));
  return Number.isFinite(n) ? n : raw;
}

function readOverrides(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

export default function PartnerReportPage() {
  const navigate = useNavigate();
  const { isAdmin, isSuperadmin, hubId } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'year' | 'quarter' | TrainingStatus>('all');
  const { data: report, hub, loading, error } = usePartnerReport(year, quarter);

  const storageKey = `partner-report:${hubId}:${year}-Q${quarter}`;
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => setOverrides(readOverrides(storageKey)), [storageKey]);
  const setOverride = (col: string, value: string | null) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (value === null) delete next[col];
      else next[col] = value;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage unavailable (private window) — edits still apply for this visit.
      }
      return next;
    });
  };

  const fields = useMemo(() => (report ? buildFields(report, hub) : []), [report, hub]);
  const answer = (f: Field) => overrides[f.col] ?? (f.value === null || f.value === undefined ? '' : String(f.value));

  const trainees = useMemo(() => {
    const rows = report?.trainees ?? [];
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'year') return rows.filter(t => t.counted_completed_year);
    if (statusFilter === 'quarter') return rows.filter(t => t.counted_completed_quarter);
    return rows.filter(t => t.status === statusFilter);
  }, [report, statusFilter]);

  if (!isAdmin && !isSuperadmin) return <div>Access denied</div>;

  const rowValues = () => ['1', ...fields.map(f => toCell(f.kind, answer(f)))];

  const exportXlsx = () => {
    const headers = ['S/N', ...fields.map(f => f.question)];
    const ws = XLSX.utils.aoa_to_sheet([headers, rowValues()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year} Q${quarter}`);
    XLSX.writeFile(wb, `PIND Partner Report ${year} Q${quarter}.xlsx`);
  };

  const copyRow = async () => {
    const line = rowValues().map(v => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t');
    try {
      await navigator.clipboard.writeText(line);
      toast.success('Row copied. Click the S/N cell in the PIND sheet and paste.');
    } catch {
      toast.error('Could not copy to the clipboard. Use Export instead.');
    }
  };

  const years = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div>
      <PageHeader
        title="PIND Partner Report"
        description="The PIND quarterly progress return, filled in from LMS data. Check each figure and fill in the rest before submitting."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/reports')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Reports
            </Button>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v))}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={copyRow} disabled={!report}>
              <Copy className="h-4 w-4 mr-1" /> Copy row
            </Button>
            <Button onClick={exportXlsx} disabled={!report}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </>
        }
      />

      {!hubId && <p className="text-muted-foreground">Select a hub to build its report.</p>}
      {loading && <p className="text-muted-foreground">Loading report…</p>}
      {error && <p className="text-destructive">Could not load the report: {error.message}</p>}

      {report && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {year} Q{quarter}: {date(report.period.start)} to {date(report.period.end)}.
            {report.period.inProgress && ` The quarter is still running. Figures are as of today, ${date(report.period.asOf)}.`}
            {report.period.asOf < report.period.start && ' This quarter hasn\'t started yet.'}
          </p>

          {report.gaps.noCohort.length > 0 && (
            <Alert className="border-warning/40">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle>{report.gaps.noCohort.length} enrollments have no cohort, so they aren't in the training counts</AlertTitle>
              <AlertDescription>
                <p className="mb-2">Completion comes from cohort end dates. Assign these students to a cohort and the counts in D–K will include them.</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {report.gaps.noCohort.map(t => (
                    <Link key={t.id} to={`/admin/enrollments/${t.id}`} className="text-sm underline underline-offset-2">
                      {t.full_name}
                    </Link>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Report row</CardTitle>
              <CardDescription>
                Figures filled in from the LMS can be edited, and fields marked "Enter by hand" are blank for you to fill.
                Your edits are saved in this browser for {year} Q{quarter}.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {fields.map(f => {
                const computed = f.value !== undefined;
                const edited = f.col in overrides;
                return (
                  <div key={f.col} className="py-4 grid gap-3 md:grid-cols-[3rem_1fr_16rem]">
                    <div className="font-mono text-sm text-muted-foreground">{f.col}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{f.question}</p>
                      <p className="text-xs text-muted-foreground mt-1">{f.note}</p>
                    </div>
                    <div className="space-y-1">
                      {f.kind === 'text' ? (
                        <Textarea rows={2} value={answer(f)} onChange={e => setOverride(f.col, e.target.value)} />
                      ) : (
                        <div className="flex items-center gap-2">
                          {f.kind === 'naira' && <span className="text-sm text-muted-foreground">₦</span>}
                          <Input inputMode="decimal" value={answer(f)} onChange={e => setOverride(f.col, e.target.value)} />
                          {f.kind === 'percent' && <span className="text-sm text-muted-foreground">%</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs">
                        {!computed && <Badge variant="outline">Enter by hand</Badge>}
                        {computed && !edited && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">From LMS</Badge>}
                        {edited && (
                          <>
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Edited</Badge>
                            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setOverride(f.col, null)}>
                              <RotateCcw className="h-3 w-3" /> {computed ? 'Use LMS figure' : 'Clear'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Who's counted</CardTitle>
                <CardDescription>
                  Every enrollment behind columns D–K, with the status it was given as of {date(report.period.asOf)}.
                  PIND-linked in D: {report.trainees.filter(t => t.counted_completed_year && t.pind).length} of {report.completedYear}.
                </CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All enrollments</SelectItem>
                  <SelectItem value="year">Completed in {year} (D)</SelectItem>
                  <SelectItem value="quarter">Completed this quarter (E)</SelectItem>
                  <SelectItem value="in_training">In training (G)</SelectItem>
                  <SelectItem value="not_started">Cohort not started</SelectItem>
                  <SelectItem value="no_cohort">No cohort</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <DataTable<TraineeRow>
                data={trainees}
                searchable
                emptyMessage="No enrollments match this filter."
                onRowClick={t => navigate(`/admin/enrollments/${t.id}`)}
                columns={[
                  { key: 'full_name', header: 'Name', searchable: true },
                  { key: 'cohorts', header: 'Cohort(s)', searchable: true, render: t => t.cohorts || '—' },
                  {
                    key: 'status',
                    header: 'Status',
                    render: t => <Badge variant="outline" className={STATUS_COLOURS[t.status]}>{STATUS_LABELS[t.status]}</Badge>,
                  },
                  { key: 'completed_on', header: 'Finished', render: t => (t.completed_on ? date(t.completed_on) : '—') },
                  { key: 'sponsor', header: 'Sponsor', render: t => (t.pind ? <Badge variant="outline">PIND</Badge> : t.sponsor ?? '—') },
                  {
                    key: 'age',
                    header: 'Youth (16–35)',
                    render: t => (t.youth === null ? 'Unknown' : `${t.youth ? 'Yes' : 'No'}${t.age !== null ? ` (${t.age})` : ''}`),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Income this quarter</CardTitle>
              <CardDescription>
                Tuition {naira(report.tuitionIncome)} + other income {naira(report.otherIncome)}. Last quarter:{' '}
                {naira(report.tuitionIncomePrev)} + {naira(report.otherIncomePrev)}. Change {pctText(report.incomeChangePct)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.sponsorIncome.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tuition recorded this quarter.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {report.sponsorIncome.map(s => (
                    <li key={s.name} className="flex justify-between py-2">
                      <span>{s.name}</span>
                      <span className="font-medium tabular-nums">{naira(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
