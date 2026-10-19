import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getRegistrationProgress } from '@/lib/registration';

export function StudentRegistrations() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['registration-progress', user?.id], queryFn: getRegistrationProgress, enabled: !!user });
  return <section className="border rounded-xl p-4 mb-6 space-y-2" aria-label="Your registrations">
    <h2 className="font-semibold">Your registration IDs</h2>
    {data?.registrations.map(r => <p key={r.id} className="text-sm"><span className="font-mono">{r.registration_number}</span> · {r.program_name}
      {r.registration_flow_version === 2 && !r.eligible && <> · <Link className="text-primary underline" to={`/enroll?registration=${r.id}`}>Finish registration / check review</Link></>}
    </p>)}
    <Link className="text-primary underline text-sm" to="/enroll?new=1">Register for another course</Link>
  </section>;
}
