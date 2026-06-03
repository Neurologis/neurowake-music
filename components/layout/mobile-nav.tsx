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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#F5A623]/40 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
      <div className="flex h-24 pb-6">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 min-h-[80px] min-w-[60px] transition-all duration-200',
                isActive
                  ? 'border-t-4 border-[#F5A623] text-[#F5A623]'
                  : 'border-t-4 border-transparent text-gray-400'
              )}
            >
              <Icon className={cn('h-7 w-7', isActive ? 'text-[#F5A623]' : 'text-gray-400')} />
              <span className={cn('text-sm font-semibold', isActive ? 'text-[#F5A623] font-bold' : 'text-gray-400')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
