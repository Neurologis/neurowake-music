'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import { storeLangue, type Langue } from '@/lib/i18n';
import { useT } from '@/hooks/use-t';

interface Profil {
  langue: 'fr' | 'es' | 'en';
  sensibilite_volume: 'douce' | 'normale' | 'sensible';
  acouphenes: boolean;
  gamma_gain: number;
  gamma_mode: 'binaural' | 'monaural' | 'am';
}

interface Abonnement {
  statut: 'actif' | 'inactif' | 'trial' | 'suspendu';
  trial_ends_at: string | null;
  current_period_end: string | null;
  ls_customer_id: string | null;
}

export default function ParametresPage() {
  const router = useRouter();
  const { t }  = useT();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [abonnement, setAbonnement] = useState<Abonnement | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [profilRes, aboRes] = await Promise.all([
      fetch('/api/profile'),
      supabase.from('abonnements').select('*').single(),
    ]);
    if (profilRes.ok) {
      const { profil: p } = await profilRes.json();
      if (p) setProfil(p);
    }
   if (!aboRes.error && aboRes.data) setAbonnement(aboRes.data as Abonnement);
  }

  async function saveProfile(updates: Partial<Profil>) {
    const updated = { ...profil, ...updates } as Profil;
    setProfil(updated);
    setSaving(true);
    await fetch('/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    });
    setSaving(false);
    if (updates.langue) {
      storeLangue(updates.langue as Langue);
    }
    toast({ title: t('settings_saved') });
  }

  async function handleBillingPortal() {
    const res = await fetch('/api/billing/portal');
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, '_blank');
    }
  }

  async function handleSubscribe() {
    const res = await fetch('/api/billing/checkout');
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  async function handleDeleteAccount() {
    if (!confirm(t('settings_delete_confirm'))) return;
    await supabase.auth.signOut();
    router.push('/');
  }

  const statutLabel: Record<string, string> = {
    actif:    t('settings_active'),
    trial:    t('settings_trial'),
    inactif:  t('settings_inactive'),
    suspendu: t('settings_suspended'),
  };

  const statutColor: Record<string, string> = {
    actif:    'bg-[#7BA05B] text-white',
    trial:    'bg-amber-100 text-amber-800',
    inactif:  'bg-gray-100 text-gray-600',
    suspendu: 'bg-red-100 text-red-800',
  };

  const volLabels: Record<string, string> = {
    douce:    t('gamma_soft'),
    normale:  t('gamma_normal'),
    sensible: t('gamma_loud'),
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#2C2C2A]">{t('settings_title')}</h1>

      {/* ── Langue ────────────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardHeader><CardTitle className="text-lg">{t('settings_lang')}</CardTitle></CardHeader>
        <CardContent>
          <Select value={profil?.langue ?? 'fr'} onValueChange={(v) => saveProfile({ langue: v as Langue })}>
            <SelectTrigger className="text-base h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr" className="text-base">🇫🇷 Français</SelectItem>
              <SelectItem value="es" className="text-base">🇪🇸 Español</SelectItem>
              <SelectItem value="en" className="text-base">🇬🇧 English</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* ── Profil sonore ─────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardHeader><CardTitle className="text-lg">{t('settings_sound')}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-base font-medium mb-3">{t('settings_vol_sens')}</p>
            <div className="flex gap-2">
              {(['douce', 'normale', 'sensible'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={profil?.sensibilite_volume === v ? 'default' : 'outline'}
                  className={`text-base h-10 px-4 ${profil?.sensibilite_volume === v ? 'bg-[#4A6FA5]' : ''}`}
                  onClick={() => saveProfile({ sensibilite_volume: v })}
                >
                  {volLabels[v]}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium">{t('settings_hearing')}</p>
              <p className="text-sm text-muted-foreground">{t('settings_hearing_desc')}</p>
            </div>
            <Switch
              checked={profil?.acouphenes ?? false}
              onCheckedChange={(v) => saveProfile({ acouphenes: v })}
            />
          </div>

          <Button
            variant="outline"
            onClick={() => router.push('/onboarding')}
            className="w-full text-base h-11"
          >
            {t('settings_redo')}
          </Button>
        </CardContent>
      </Card>

      {/* ── Audio 40Hz ────────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardHeader><CardTitle className="text-lg">{t('settings_40hz')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-base font-medium mb-3">{t('settings_40hz_mode')}</p>
            <div className="flex gap-2 flex-wrap">
              {(['binaural', 'monaural', 'am'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  disabled={profil?.acouphenes && mode === 'binaural'}
                  variant={profil?.gamma_mode === mode ? 'default' : 'outline'}
                  className={`text-base h-10 px-4 ${profil?.gamma_mode === mode ? 'bg-[#4A6FA5]' : ''}`}
                  onClick={() => saveProfile({ gamma_mode: mode })}
                >
                  {mode === 'binaural' ? t('gamma_binaural') : mode === 'monaural' ? t('gamma_monaural') : t('gamma_am')}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Abonnement ────────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardHeader><CardTitle className="text-lg">{t('settings_sub')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {abonnement ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-base font-medium">{t('settings_status')}</p>
                <Badge className={statutColor[abonnement.statut] ?? 'bg-gray-100'}>
                  {statutLabel[abonnement.statut] ?? abonnement.statut}
                </Badge>
              </div>
              {abonnement.statut === 'trial' && abonnement.trial_ends_at && (
                <p className="text-sm text-muted-foreground">
                  {t('settings_trial_until')} {formatDate(abonnement.trial_ends_at)}
                </p>
              )}
              {abonnement.statut === 'actif' && abonnement.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  {t('settings_renew')} {formatDate(abonnement.current_period_end)}
                </p>
              )}
              {abonnement.ls_customer_id ? (
                <Button onClick={handleBillingPortal} variant="outline" className="w-full text-base h-11">
                  {t('settings_sub_manage')}
                </Button>
              ) : (
                <Button onClick={handleSubscribe} className="w-full bg-[#4A6FA5] text-base h-11">
                  {t('settings_subscribe')}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleSubscribe} className="w-full bg-[#4A6FA5] text-base h-11">
              {t('settings_sub_trial_14')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Déconnexion ───────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardContent className="p-4">
          <Button
            variant="outline"
            className="w-full flex items-center gap-2 text-[#4A6FA5] border-[#4A6FA5] hover:bg-[#4A6FA5]/10 text-base h-11"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            {t('settings_logout')}
          </Button>
        </CardContent>
      </Card>

      {/* ── RGPD ──────────────────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardHeader><CardTitle className="text-lg">{t('settings_data')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full text-base h-11">
            {t('settings_download')}
          </Button>
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-white text-base h-11"
            onClick={handleDeleteAccount}
          >
            {t('settings_delete')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('settings_delete_irrev')}</p>
        </CardContent>
      </Card>

      {saving && (
        <p className="text-center text-sm text-muted-foreground">{t('saving_label')}</p>
      )}
    </div>
  );
}
