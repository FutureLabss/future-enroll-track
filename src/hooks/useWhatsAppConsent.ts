import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';

export interface WhatsAppConsent {
  has_enrollment: boolean;
  asked: boolean;
  whatsapp: boolean;
  guardian: boolean;
  phone: string | null;
  guardian_phone: string | null;
}

// The signed-in student's WhatsApp consent across their enrollments. Meta requires it
// before we may message them first; guardians are a separate yes/no.
export function useWhatsAppConsent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data = null, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['whatsapp-consent', user?.id],
    queryFn: async () => {
      const { data, error } = await untypedRpc('my_whatsapp_consent');
      if (error) throw error;
      return data as WhatsAppConsent;
    },
    enabled: Boolean(user?.id),
  });

  const save = async (whatsapp: boolean, guardian: boolean) => {
    const { error } = await untypedRpc('set_my_whatsapp_consent', { p_whatsapp: whatsapp, p_guardian: guardian });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['whatsapp-consent'] });
  };

  return { data, loading, error, refetch, save };
}
