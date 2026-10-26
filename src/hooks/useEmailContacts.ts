import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';
import type { CSVContact } from '@/lib/csv';

export interface EmailContact {
  id: string;
  email: string;
  full_name: string | null;
  list_name: string;
  created_at: string;
}

export interface EmailSuppression {
  id: string;
  normalized_email: string;
  reason: string;
  source: string | null;
  created_at: string;
}

// email_contacts / email_suppressions are newer than the generated types.
const table = (name: string) => supabase.from(name as never);

export function useEmailContacts() {
  const { hubId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['email-contacts', hubId],
    queryFn: async () => {
      const [contacts, suppressions] = await Promise.all([
        table('email_contacts').select('id, email, full_name, list_name, created_at').eq('hub_id', hubId!).order('created_at', { ascending: false }).limit(5000),
        table('email_suppressions').select('id, normalized_email, reason, source, created_at').eq('hub_id', hubId!).order('created_at', { ascending: false }),
      ]);
      if (contacts.error) throw contacts.error;
      if (suppressions.error) throw suppressions.error;
      return {
        contacts: (contacts.data as unknown as EmailContact[]) || [],
        suppressions: (suppressions.data as unknown as EmailSuppression[]) || [],
      };
    },
    enabled: Boolean(hubId),
    staleTime: 30_000,
  });

  const contacts = data?.contacts ?? [];
  const lists = Array.from(
    contacts.reduce((m, c) => m.set(c.list_name, (m.get(c.list_name) ?? 0) + 1), new Map<string, number>()),
    ([name, count]) => ({ name, count }),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['email-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['digest-audience'] });
  };

  const importContacts = async (listName: string, rows: CSVContact[]) => {
    const { data, error } = await untypedRpc('import_email_contacts', { p_list_name: listName, p_contacts: rows });
    if (error) throw error;
    refetch();
    return data as { valid: number; added: number; already_listed: number };
  };

  const removeContact = async (id: string) => {
    const { error } = await table('email_contacts').delete().eq('id', id);
    if (error) throw error;
    refetch();
  };

  const removeList = async (listName: string) => {
    const { error } = await table('email_contacts').delete().eq('hub_id', hubId!).eq('list_name', listName);
    if (error) throw error;
    refetch();
  };

  return {
    data: { contacts, lists, suppressions: data?.suppressions ?? [] },
    loading, error, refetch, importContacts, removeContact, removeList,
  };
}
