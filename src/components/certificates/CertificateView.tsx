import { useLayoutEffect, useRef, useState } from 'react';

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

// The official FutureLabs layout (sample supplied Oct 2026). Drawn on a fixed
// 1123×794 px A4-landscape sheet and scaled to fit, so screen and PDF match.
const PAGE_W = 1123;
const SIGNATORY = { name: 'Udim Manasseh', title: 'Founder FutureLabs' };
// Drop the signature scan here (transparent PNG); the line stays blank until it exists.
const SIGNATURE_SRC = '/certificates/udim-manasseh-signature.png';

const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' });

function Wordmark({ logoUrl, hub }: { logoUrl: string | null; hub: string }) {
  if (logoUrl) return <img src={logoUrl} alt={hub} className="h-[52px] object-contain" />;
  return (
    <p className="text-[50px] leading-none tracking-[1px] text-[#F47920]">
      <span className="font-extrabold">FUTURE</span><span className="font-light">LABS</span>
    </p>
  );
}

export function CertificateView({ cert, verifyUrl }: { cert: CertificateData; verifyUrl: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [signature, setSignature] = useState(true);
  const hub = cert.hub_name || 'FutureLabs';

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => setScale(el.clientWidth / PAGE_W || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={frame} className="certificate-frame relative mx-auto aspect-[1123/794] w-full max-w-5xl overflow-hidden shadow-lg print:max-w-none print:shadow-none">
      <div className="certificate-sheet absolute left-0 top-0 h-[794px] w-[1123px] origin-top-left overflow-hidden bg-white font-['Poppins',_'Inter',_sans-serif] text-[#111]"
        style={{ transform: `scale(${scale})` }}>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,transparent_58%,rgba(15,23,42,0.02)_58%,rgba(15,23,42,0.02)_70%,transparent_70%),linear-gradient(160deg,transparent_20%,rgba(15,23,42,0.018)_20%,rgba(15,23,42,0.018)_34%,transparent_34%)]" />
        <div aria-hidden className="absolute left-[360px] top-[200px] h-[470px] w-[300px] select-none opacity-[0.13]">
          <div className="absolute left-[40px] top-[70px] h-[400px] w-[110px] rounded-[36px] bg-[#F47920]" />
          <div className="absolute left-[40px] top-[70px] h-[105px] w-[260px] rounded-[36px] bg-[#F47920]" />
          <div className="absolute left-[175px] top-0 h-[62px] w-[62px] rounded-full bg-[#F47920]" />
        </div>

        <div className="absolute inset-[26px] border-[5px] border-[#F47920]" />
        <div className="absolute inset-[38px] border-2 border-[#F47920]" />

        <div className="absolute inset-0 flex flex-col items-center pt-[108px]">
          <Wordmark logoUrl={cert.hub_logo_url} hub={hub} />
          <div className="mt-[30px] h-[3px] w-[580px] bg-[#F47920]" />
          <p className="mt-[14px] text-[30px]">Verified Certificate of Completion</p>
          <p className="mt-[34px] max-w-[900px] text-center text-[44px] font-medium leading-[1.1]">{cert.program_name}</p>
          <p className="mt-[6px] text-[24px]">Digital Certificate</p>
          <p className="mt-[44px] text-[14px] font-medium tracking-[7px]">CERTIFICATE OF COMPLETION</p>
          <p className="mt-[20px] text-[20px] font-medium">Awarded to</p>
          <p className="mt-[14px] max-w-[880px] text-center text-[32px] font-medium leading-[1.15]">{cert.student_name}</p>
          <div className="mt-[12px] h-[3px] w-[735px] bg-[#F47920]" />
        </div>

        <div className="absolute left-[66px] top-[594px] w-[205px]">
          <p className="w-[170px] text-center text-[14px] font-semibold">{shortDate(cert.completed_on || cert.issued_at)}</p>
          <div className="mb-[6px] mt-[2px] h-[3px] w-[170px] bg-[#F47920]" />
          <p className="text-[12.5px] leading-[1.3]">{hub} has confirmed the participation of the individual in the program</p>
        </div>

        <div className="absolute left-[790px] top-[548px] flex w-[170px] flex-col items-center">
          <div className="flex h-[62px] items-end justify-center">
            {signature && <img src={SIGNATURE_SRC} alt="" className="h-[62px] object-contain" onError={() => setSignature(false)} />}
          </div>
          <div className="mb-[6px] h-[3px] w-[170px] bg-[#F47920]" />
          <p className="text-[13.5px] font-semibold">{SIGNATORY.name}</p>
          <p className="text-[13.5px]">{SIGNATORY.title}</p>
        </div>

        {/* Not on the sample: a printed copy needs its ID to be checkable. */}
        <p className="absolute top-[722px] w-full text-center text-[10px] text-slate-500">
          Certificate ID {cert.code} · Verify at {verifyUrl.replace(/^https?:\/\//, '')}
        </p>

        {cert.revoked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="-rotate-12 rounded border-[6px] border-red-600 px-10 py-3 text-[72px] font-bold uppercase tracking-widest text-red-600/80">Revoked</p>
          </div>
        )}
      </div>
    </div>
  );
}
