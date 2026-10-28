import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { CertificateView, type CertificateData } from '@/components/certificates/CertificateView';
import { Button } from '@/components/ui/button';
import { BadgeCheck, Copy, Download, XCircle } from 'lucide-react';
import { toast } from 'sonner';

// Public: anyone with the link can see and verify a certificate; "Download PDF"
// uses the browser's print-to-PDF with a one-page A4 landscape layout.
export default function CertificatePage() {
  const { code = '' } = useParams<{ code: string }>();
  const { data: cert, isLoading } = useQuery({
    queryKey: ['certificate', code],
    queryFn: async () => {
      const { data, error } = await untypedRpc('verify_certificate', { p_code: code });
      if (error) throw error;
      return data as CertificateData | null;
    },
  });
  // Printed and shared links always use the live site, even from a preview or local copy.
  const url = `https://admin.futurelabs.ng/certificate/${code.toUpperCase()}`;

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  if (!cert) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <XCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Certificate not found</h1>
        <p className="text-muted-foreground">No certificate has the ID “{code.toUpperCase()}”. Check the link or ID and try again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6 print:bg-white print:p-0">
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;800&display=swap'); @page { size: A4 landscape; margin: 0; } @media print { .certificate-frame { width: 297mm; } .certificate-sheet { transform: none !important; } }"}</style>
      <div className="mx-auto mb-4 flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        {cert.revoked ? (
          <p className="flex items-center gap-2 font-medium text-destructive">
            <XCircle className="h-5 w-5" />This certificate was revoked on {cert.revoked_at ? new Date(cert.revoked_at).toLocaleDateString('en-NG') : ''} and is no longer valid.
          </p>
        ) : (
          <p className="flex items-center gap-2 font-medium text-success">
            <BadgeCheck className="h-5 w-5" />Verified: issued by {cert.hub_name || 'FutureLabs'} on {new Date(cert.issued_at).toLocaleDateString('en-NG')}
          </p>
        )}
        {!cert.revoked && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}>
              <Copy className="mr-1.5 h-4 w-4" />Copy link
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Download className="mr-1.5 h-4 w-4" />Download PDF
            </Button>
          </div>
        )}
      </div>
      <CertificateView cert={cert} verifyUrl={url} />
    </div>
  );
}
