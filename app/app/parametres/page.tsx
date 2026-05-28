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
    if (!aboRes.error && aboRes.data) setAbonnement(aboRes.data);
  }

  async function saveProfile(updates: Partial<Profil>) {
    const updated = { ...profil, ...updates } as Profil;
    setProfil(updated);
    setSaving(true);
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(false);
    toast({ title: 'Enregistré' });
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

  async function handleDeleteAccount() {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.')) return;
    await supabase.auth.signOut();
    router.push('/');
  }

  const statutLabel = {
    actif: 'Actif',
    trial: 'Période d\'essai',
    inactif: 'Inactif',
    suspendu: 'Suspendu',
  };

  const statutColor = {
    actif: 'bg-[#7BA05B] text-white',
    trial: 'bg-amber-100 text-amber-800',
    inactif: 'bg-gray-100 text-gray-600',
    suspendu: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#2C2C2A]">Paramètres</h1>

      {/* Langue */}
      <Card>
        <CardHeader><CardTitle>Langue de l&apos;interface</CardTitle></CardHeader>
        <CardContent>
          <Select value={profil?.langue ?? 'fr'} onValueChange={(v) => saveProfile({ langue: v as 'fr' | 'es' | 'en' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">🇫🇷 Français</SelectItem>
              <SelectItem value="es">🇪🇸 Español</SelectItem>
              <SelectItem value="en">🇬🇧 English</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Profil sonore */}
      <Card>
        <CardHeader><CardTitle>Profil sonore</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Sensibilité au volume</p>
            <div className="flex gap-2">
              {(['douce', 'normale', 'sensible'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={profil?.sensibilite_volume === v ? 'default' : 'outline'}
                  className={profil?.sensibilite_volume === v ? 'bg-[#4A6FA5]' : ''}
                  onClick={() => saveProfile({ sensibilite_volume: v })}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sensibilité auditive particulière</p>
              <p className="text-xs text-muted-foreground">Désactive le mode binaural</p>
            </div>
            <Switch
              checked={profil?.acouphenes ?? false}
              onCheckedChange={(v) => saveProfile({ acouphenes: v })}
            />
          </div>
          <Button variant="outline" onClick={() => router.push('/onboarding')} className="w-full">
            Refaire l&apos;onboarding
          </Button>
        </CardContent>
      </Card>

      {/* Audio */}
      <Card>
        <CardHeader><CardTitle>Audio 40Hz</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Mode 40Hz</p>
            <div className="flex gap-2 flex-wrap">
              {(['binaural', 'monaural', 'am'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  disabled={profil?.acouphenes && mode === 'binaural'}
                  variant={profil?.gamma_mode === mode ? 'default' : 'outline'}
                  className={profil?.gamma_mode === mode ? 'bg-[#4A6FA5]' : ''}
                  onClick={() => saveProfile({ gamma_mode: mode })}
                >
                  {mode === 'binaural' ? 'Binaural' : mode === 'monaural' ? 'Monaural' : 'Modulation AM'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abonnement */}
      <Card>
        <CardHeader><CardTitle>Abonnement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {abonnement ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-medium">Statut</p>
                <Badge className={statutColor[abonnement.statut]}>
                  {statutLabel[abonnement.statut]}
                </Badge>
              </div>
              {abonnement.statut === 'trial' && abonnement.trial_ends_at && (
                <p className="text-sm text-muted-foreground">
                  Essai gratuit jusqu&apos;au {formatDate(abonnement.trial_ends_at)}
                </p>
              )}
              {abonnement.statut === 'actif' && abonnement.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Renouvellement le {formatDate(abonnement.current_period_end)}
                </p>
              )}
              {abonnement.ls_customer_id ? (
                <Button onClick={handleBillingPortal} variant="outline" className="w-full">
                  Gérer mon abonnement
                </Button>
              ) : (
                <Button onClick={handleSubscribe} className="w-full bg-[#4A6FA5]">
                  S&apos;abonner
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleSubscribe} className="w-full bg-[#4A6FA5]">
              S&apos;abonner — 14 jours gratuits
            </Button>
          )}
        </CardContent>
      </Card>

      {/* RGPD */}
      <Card>
        <CardHeader><CardTitle>Données personnelles</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full">
            Télécharger mes données
          </Button>
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-white"
            onClick={handleDeleteAccount}
          >
            Supprimer mon compte
          </Button>
          <p className="text-xs text-muted-foreground">Cette action est irréversible. Toutes vos données seront supprimées.</p>
        </CardContent>
      </Card>
    </div>
  );
}
