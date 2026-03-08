import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Download } from 'lucide-react';

interface ReceiptData {
  payment_reference: string;
  amount: number;
  payment_method: string | null;
  created_at: string;
  invoice_number: string;
  student_name: string;
  program_name?: string;
}

interface PaymentReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
}

export function PaymentReceipt({ open, onOpenChange, receipt }: PaymentReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!receipt) return null;

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Receipt - ${receipt.payment_reference}</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 40px; color: #1a1a2e; }
            .receipt { max-width: 500px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 24px; }
            .header h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
            .header p { font-size: 12px; color: #6b7280; margin: 0; }
            .badge { display: inline-block; background: #dcfce7; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 8px; }
            .divider { border: none; border-top: 1px dashed #d1d5db; margin: 20px 0; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
            .row .label { color: #6b7280; }
            .row .value { font-weight: 500; }
            .total-row { display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 700; border-top: 2px solid #1a1a2e; margin-top: 8px; }
            .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #9ca3af; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment Receipt</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <div className="receipt">
            <div className="header" style={{ textAlign: 'center', marginBottom: 20 }}>
              <h1 className="text-xl font-bold text-foreground">Payment Receipt</h1>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(receipt.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-success/15 text-success">
                PAID
              </span>
            </div>

            <Separator className="my-4 border-dashed" />

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-medium text-foreground">{receipt.payment_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span className="font-medium text-foreground">{receipt.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-medium text-foreground">{receipt.invoice_number}</span>
              </div>
              {receipt.program_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Program</span>
                  <span className="font-medium text-foreground">{receipt.program_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium text-foreground capitalize">{receipt.payment_method?.replace('_', ' ') || 'N/A'}</span>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex justify-between items-center pt-1">
              <span className="text-base font-semibold text-foreground">Amount Paid</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(receipt.amount)}</span>
            </div>

            <div className="text-center mt-8">
              <p className="text-[11px] text-muted-foreground">This is a system-generated receipt. No signature required.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={handlePrint} className="flex-1">
            <Printer className="h-4 w-4 mr-2" /> Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
