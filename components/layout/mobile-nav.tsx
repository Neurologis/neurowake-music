'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Music, ListMusic, LayoutList, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/hooks/use-t';

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useT();

  const navItems = [
    { href: '/app',            label: t('mobile_player'),    icon: Music },
    { href: '/app/titres',     label: t('mobile_tracks'),    icon: ListMusic },
    { href: '/app/playlists',  label: t('mobile_playlists'), icon: LayoutList },
    { href: '/app/messages',   label: t('mobile_messages'),  icon: MessageSquare },
    { href: '/app/parametres', label: t('mobile_settings'),  icon: Settings },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-border z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.06)]">
      <div className="flex">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-all duration-200',
                isActive ? 'text-[#F5A623]' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-[#F5A623]')} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
