import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
      setDark(true);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
