import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Menu, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function DemoBanner() {
  const { isDemo, demoExpiresAt } = useAuth();
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!isDemo || !demoExpiresAt) return;
    const tick = () => {
      const ms = demoExpiresAt.getTime() - Date.now();
      if (ms <= 0) { setRemaining('expired'); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isDemo, demoExpiresAt]);

  if (!isDemo) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Clock className="h-4 w-4 flex-shrink-0" />
        <span>
          <strong>Demo Mode</strong> — you're exploring a preloaded demo academy.
          {remaining && remaining !== 'expired' && (
            <span className="ml-2 font-mono font-semibold">{remaining} remaining</span>
          )}
          {remaining === 'expired' && (
            <span className="ml-2 text-destructive font-semibold">Access expired</span>
          )}
        </span>
      </div>
      <a
        href="/demo"
        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
      >
        <Sparkles className="h-3.5 w-3.5" /> Get your own hub
      </a>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar (fixed) */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile sidebar (drawer) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar variant="mobile" onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="lg:ml-64 min-h-screen">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -ml-2"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-heading text-lg font-bold tracking-tight">
            <span className="text-primary">Future</span>Labs
          </h1>
        </header>

        <DemoBanner />
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
