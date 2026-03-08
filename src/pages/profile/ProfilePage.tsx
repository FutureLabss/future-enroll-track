import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) setProfile({ full_name: data.full_name || '', email: data.email || '', phone: data.phone || '' });
      setLoading(false);
    });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: profile.full_name,
        phone: profile.phone,
      }).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Profile" description="Manage your personal information" />
      <div className="glass-card rounded-2xl p-8 max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={profile.email} disabled className="mt-1.5 opacity-60" />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+234..." className="mt-1.5" />
          </div>
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>
    </div>
  );
}
