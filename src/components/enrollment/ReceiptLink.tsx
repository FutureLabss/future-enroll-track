import { useQuery } from '@tanstack/react-query';
import { registrationDb } from '@/lib/registration';

export function ReceiptLink({ path }: { path: string }) {
  const isPublic = /^https?:\/\//.test(path);
  const { data, error } = useQuery({
    queryKey: ['receipt-link', path], enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await registrationDb.storage.from('registration-receipts').createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    }, staleTime: 240000, refetchInterval: isPublic ? false : 240000,
  });
  if (error) return <span role="alert">Receipt unavailable</span>;
  if (!isPublic && !data) return <span>Loading receipt…</span>;
  return <a className="text-primary underline" href={isPublic ? path : data} target="_blank" rel="noreferrer">View receipt</a>;
}
