export interface CertificateData {
  code: string;
  student_name: string;
  program_name: string;
  cohort_label: string | null;
  completed_on: string | null;
  issued_at: string;
  issued_by_name: string | null;
  hub_name: string | null;
  hub_logo_url: string | null;
  revoked: boolean;
  revoked_at: string | null;
}

const longDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

// Placeholder layout until the final design arrives: A4 landscape, prints as one page.
export function CertificateView({ cert, verifyUrl }: { cert: CertificateData; verifyUrl: string }) {
  const hub = cert.hub_name || 'FutureLabs';
  return (
    <div className="certificate-sheet relative mx-auto aspect-[297/210] w-full max-w-5xl bg-white text-slate-900 shadow-lg print:max-w-none print:shadow-none">
      <div className="absolute inset-3 border-[3px] border-indigo-900 sm:inset-5" />
      <div className="absolute inset-5 border border-indigo-900/40 sm:inset-8" />
      <div className="relative flex h-full flex-col items-center justify-between px-[8%] py-[6%] text-center">
        <div className="flex flex-col items-center gap-2">
          {cert.hub_logo_url
            ? <img src={cert.hub_logo_url} alt={hub} className="h-[clamp(28px,6vw,56px)] object-contain" />
            : <p className="text-[clamp(14px,2.2vw,22px)] font-bold tracking-wide text-indigo-900">{hub}</p>}
          <p className="text-[clamp(18px,4vw,42px)] font-semibold uppercase tracking-[0.2em] text-indigo-950">Certificate of Completion</p>
        </div>

        <div className="flex flex-col items-center gap-[clamp(4px,1vw,12px)]">
          <p className="text-[clamp(10px,1.5vw,16px)] text-slate-600">This is to certify that</p>
          <p className="font-serif text-[clamp(22px,5vw,54px)] italic leading-tight text-indigo-950">{cert.student_name}</p>
          <p className="text-[clamp(10px,1.5vw,16px)] text-slate-600">has successfully completed</p>
          <p className="text-[clamp(14px,2.6vw,28px)] font-semibold">{cert.program_name}</p>
          {cert.cohort_label && <p className="text-[clamp(9px,1.2vw,13px)] text-slate-500">{cert.cohort_label}</p>}
        </div>

        <div className="flex w-full items-end justify-between gap-4 text-[clamp(8px,1.1vw,12px)] text-slate-600">
          <div className="text-left">
            <p className="font-medium text-slate-900">{longDate(cert.completed_on || cert.issued_at)}</p>
            <p>Date</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-px w-[clamp(90px,18vw,200px)] bg-slate-400" />
            <p className="font-medium text-slate-900">{cert.issued_by_name || hub}</p>
            <p>for {hub}</p>
          </div>
          <div className="text-right">
            <p className="font-mono font-medium text-slate-900">{cert.code}</p>
            <p className="break-all">Verify at {verifyUrl.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </div>
      {cert.revoked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="-rotate-12 rounded border-4 border-red-600 px-6 py-2 text-[clamp(24px,6vw,64px)] font-bold uppercase tracking-widest text-red-600/80">Revoked</p>
        </div>
      )}
    </div>
  );
}
