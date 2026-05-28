'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Music, ListMusic, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/app', label: 'Lecteur', icon: Music },
  { href: '/app/titres', label: 'Titres', icon: ListMusic },
  { href: '/app/messages', label: 'Messages', icon: MessageSquare },
  { href: '/app/parametres', label: 'Réglages', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50">
      <div className="flex">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                isActive ? 'text-[#4A6FA5]' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-[#4A6FA5]')} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
