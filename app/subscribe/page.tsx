'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';

export default function SubscribePage() {
  const router = useRouter();
  const t = useT();

  async function handleSubscribe() {
    const res = await fetch('/api/billing/checkout', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 space-y-6 text-center">

        <div className="text-5xl">🎵</div>

        <h1 className="text-2xl font-bold text-[#2C3E50]">
          Votre période d&apos;essai est terminée
        </h1>

        <p className="text-base text-muted-foreground">
          Continuez à accompagner votre proche avec la musique qui lui parle vraiment.
        </p>

        <div className="bg-[#F7F5F0] rounded-xl p-4 text-left space-y-2">
          <p className="text-sm font-semibold text-[#2C3E50]">Inclus dans l&apos;abonnement :</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>✅ Playlists personnalisées par phase</li>
            <li>✅ Recommandations musicales par l&apos;IA</li>
            <li>✅ Fréquences 40Hz Gamma</li>
            <li>✅ Messages vocaux avec votre voix</li>
            <li>✅ Accès illimité sur tous vos appareils</li>
          </ul>
        </div>

        <Button
          size="lg"
          className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white text-base font-semibold h-12"
          onClick={handleSubscribe}
        >
          S&apos;abonner maintenant
        </Button>

        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:underline"
        >
          Se déconnecter
        </button>

      </div>
    </div>
  );
}