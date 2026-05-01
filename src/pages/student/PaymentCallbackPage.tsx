import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function PaymentCallbackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref');
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!reference) { setStatus('failed'); setMessage('Missing payment reference'); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('paystack-verify', { body: { reference } });
        if (error) throw error;
        if (data?.status === 'success') {
          setStatus('success');
          setMessage(data.fully_paid ? 'Invoice fully paid. Thank you!' : 'Payment received. Thank you!');
        } else {
          setStatus('failed');
          setMessage(data?.message || 'Payment could not be verified');
        }
      } catch (err: any) {
        setStatus('failed');
        setMessage(err.message || 'Verification error');
      }
    })();
  }, [reference]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="bg-card border border-border rounded-2xl p-10 max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <h2 className="text-xl font-heading font-semibold mb-2">Verifying payment…</h2>
            <p className="text-sm text-muted-foreground">Please wait, this only takes a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-accent" />
            <h2 className="text-xl font-heading font-semibold mb-2">Payment successful</h2>
            <p className="text-sm text-muted-foreground mb-2">{message}</p>
            {reference && <p className="text-xs text-muted-foreground mb-6">Ref: {reference}</p>}
            <Button onClick={() => navigate(`/student/invoices/${id}`)} className="w-full">View invoice</Button>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-heading font-semibold mb-2">Payment not completed</h2>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => navigate(`/student/invoices/${id}`)} className="w-full">Back to invoice</Button>
          </>
        )}
      </div>
    </div>
  );
}
