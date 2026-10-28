import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Award } from 'lucide-react';

interface MyCertificate {
  id: string;
  code: string;
  program_name: string;
  issued_at: string;
}

// A student's own certificates, linking to the shareable certificate page.
export function StudentCertificatesCard() {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ['my-certificates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificates' as never)
        .select('id, code, program_name, issued_at')
        .eq('student_id', user!.id)
        .is('revoked_at', null)
        .order('issued_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as MyCertificate[]) || [];
    },
    enabled: Boolean(user?.id),
  });

  if (data.length === 0) return null;

  return (
    <section className="glass-card mb-8 rounded-xl p-5">
      <h2 className="mb-3 flex items-center gap-2 font-heading font-semibold"><Award className="h-4 w-4 text-primary" />My certificates</h2>
      <ul className="divide-y divide-border">
        {data.map(c => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">{c.program_name}</p>
              <p className="text-xs text-muted-foreground">Issued {new Date(c.issued_at).toLocaleDateString('en-NG')} · ID {c.code}</p>
            </div>
            <Link to={`/certificate/${c.code}`} className="text-sm font-medium text-primary hover:underline">View & download</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
