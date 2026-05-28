'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Music, ListMusic, MessageSquare, Settings, LogOut, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface NavProps {
  profil: { prenom_proche: string | null; onboarding_complet: boolean; langue: string } | null;
  userEmail: string;
}

const navItems = [
  { href: '/app', label: 'Lecteur', icon: Music },
  { href: '/app/titres', label: 'Mes titres', icon: ListMusic },
  { href: '/app/messages', label: 'Mes messages', icon: MessageSquare },
  { href: '/app/parametres', label: 'Paramètres', icon: Settings },
];

export function AppNav({ profil, userEmail }: NavProps) {
  const pathname = usePathname();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    // Hard reload so the middleware sees the cleared session cookie immediately.
    // A soft router.push('/login') can be intercepted before the cookie is flushed.
    window.location.href = '/login';
  }

  const isAdmin = userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-border flex-col">
      {/* Logo */}
      <div className="p-6 border-b">
        <img src="/Logo_Neurowake_Music1.png" alt="NeuroWake Music" className="h-16 w-auto" />
        {profil?.prenom_proche && (
          <div className="text-sm text-muted-foreground mt-1">
            Profil de {profil.prenom_proche}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#4A6FA5] text-white'
                  : 'text-[#2C2C2A] hover:bg-[#EDEAE3]'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-[#4A6FA5] text-white'
                : 'text-[#2C2C2A] hover:bg-[#EDEAE3]'
            )}
          >
            <Shield className="h-5 w-5" />
            Administration
          </Link>
        )}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground mb-2 truncate">{userEmail}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[#2C2C2A] hover:bg-[#EDEAE3] w-full transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
