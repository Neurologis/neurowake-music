import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/app-nav';
import { MobileNav } from '@/components/layout/mobile-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: profil } = await supabase
    .from('profils')
    .select('prenom_proche, onboarding_complet, langue')
    .eq('user_id', session.user.id)
    .single();

  // Redirect to onboarding if the profile doesn't exist yet or is incomplete.
  // This covers both brand-new users (no profile row) and users who abandoned
  // the onboarding before completing it.
  if (!profil || !profil.onboarding_complet) {
    redirect('/onboarding');
  }
// Vérification abonnement — bloquer si trial expiré sans abonnement actif
  const { data: abonnement } = await supabase
    .from('abonnements')
    .select('statut, trial_ends_at, current_period_end')
    .eq('user_id', session.user.id)
    .single();

  if (abonnement) {
    const now = new Date();
    const isTrialExpired =
      abonnement.statut === 'trial' &&
      abonnement.trial_ends_at &&
      new Date(abonnement.trial_ends_at) < now;
    const isInactive =
      abonnement.statut === 'inactif' || abonnement.statut === 'suspendu';

    if (isTrialExpired || isInactive) {
      redirect('/subscribe');
    }
  }
  // Redirect to découverte if the user has recommended titles that are all
  // still in the initial 'propose' state — meaning they haven't gone through
  // the music-discovery step yet (e.g., closed the browser right after onboarding).
  const { count: totalTitres } = await supabase
    .from('titres_recommandes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id);

  if ((totalTitres ?? 0) > 0) {
    const { count: proposedTitres } = await supabase
      .from('titres_recommandes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('statut', 'propose');

    // Every title is still unreviewed → user never visited découverte/dossier
    if (proposedTitres === totalTitres) {
      redirect('/dossier');
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex">
      {/* Sidebar desktop */}
      <AppNav profil={profil} userEmail={session.user.email ?? ''} />

      {/* Contenu principal */}
      <main className="flex-1 lg:ml-64 pb-28 lg:pb-0">
        <div className="max-w-4xl mx-auto p-3 lg:p-8">
          {children}
        </div>
      </main>

      {/* Navigation mobile (bottom) */}
      <MobileNav />
    </div>
  );
}
