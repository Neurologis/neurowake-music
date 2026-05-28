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

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex">
      {/* Sidebar desktop */}
      <AppNav profil={profil} userEmail={session.user.email ?? ''} />

      {/* Contenu principal */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
        <div className="max-w-4xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>

      {/* Navigation mobile (bottom) */}
      <MobileNav />
    </div>
  );
}
