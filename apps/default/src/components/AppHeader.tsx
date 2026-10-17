import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useTheme } from '@/hooks/use-theme';
import { CalendarDays, Menu, Moon, Sun } from '@/lib/icons';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Ana sayfa', end: true },
  { to: '/abonelikler', label: 'Abonelikler', end: false },
  { to: '/abonelik-raporu', label: 'Abonelik Raporu', end: false },
  { to: '/raporlar', label: 'Maliyet raporları', end: false },
];

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const { isDark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden>
            <CalendarDays className="size-5" />
          </span>
          <span className="hidden sm:inline">Abonelik Takipçisi</span>
          <span className="sm:hidden">Abonelikler</span>
        </Link>

        <nav aria-label="Ana gezinme" className="hidden items-center gap-1 lg:flex">
          <NavigationLinks />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {children}
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'} onClick={toggle}>
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="min-h-11 min-w-11 lg:hidden" aria-label="Menüyü aç">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,calc(100vw_-_2rem))] overscroll-contain">
              <SheetHeader>
                <SheetTitle>Gezinme</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobil gezinme" className="mt-6 flex flex-col gap-1">
                <NavigationLinks onNavigate={() => setMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
