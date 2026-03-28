import { Search, Bell, ChevronDown, LogOut, User, Settings, Sun } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { t } = useTranslation();
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-16"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        borderBottom: '1px solid var(--color-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
          >
            <span className="text-white font-bold text-sm">FT</span>
          </div>
          <span
            className="text-xl font-extrabold hidden sm:block"
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Transcendence
          </span>
        </Link>

        {/* Search */}
        <div
          className={cn(
            'relative mx-4 transition-all duration-250',
            searchFocused ? 'w-full max-w-[500px]' : 'w-full max-w-[400px]'
          )}
        >
          <Search
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none left-3"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            placeholder={t('navbar.search_placeholder')}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full h-9 rounded-full text-sm outline-none transition-all duration-200 pl-10 pr-14"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              border: searchFocused ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              boxShadow: searchFocused ? '0 0 0 2px rgba(168, 85, 247, 0.2)' : 'none',
            }}
          />
          <kbd
            className="absolute top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded right-3"
            style={{
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
            }}
          >
            Ctrl K
          </kbd>
        </div>

        {/* Right Zone */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notifications */}
          <Link
            to="/notifications"
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={t('navbar.notifications')}
          >
            <Bell className="w-5 h-5" />
            <span
              className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-error)' }}
            >
              3
            </span>
          </Link>

          {/* User Menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg transition-colors outline-none"
              style={{ backgroundColor: userMenuOpen ? 'var(--color-bg-hover)' : 'transparent' }}
              onMouseEnter={(e) => !userMenuOpen && (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => !userMenuOpen && (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Avatar name="Alex Chen" size="sm" online />
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-150 hidden sm:block',
                  userMenuOpen && 'rotate-180'
                )}
                style={{ color: 'var(--color-text-muted)' }}
              />
            </button>

            {userMenuOpen && (
              <div
                className="absolute top-full mt-2 w-56 rounded-xl shadow-lg py-1 right-0"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Alex Chen</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>alex@arena.gg</p>
                </div>
                <div className="py-1">
                  <DropdownItem icon={<User className="w-4 h-4" />} label={t('navbar.profile')} to="/profile" />
                  <DropdownItem icon={<Settings className="w-4 h-4" />} label={t('navbar.settings')} to="/settings" />
                  <DropdownItem icon={<Sun className="w-4 h-4" />} label={t('navbar.toggle_theme')} />
                </div>
                <div className="py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <DropdownItem icon={<LogOut className="w-4 h-4" />} label={t('navbar.sign_out')} danger />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function DropdownItem({
  icon,
  label,
  to,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  to?: string;
  danger?: boolean;
}) {
  const baseStyle = {
    color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)',
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = danger ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-bg-hover)';
    e.currentTarget.style.color = danger ? 'var(--color-error)' : 'var(--color-text-primary)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color = baseStyle.color;
  };

  if (to) {
    return (
      <Link
        to={to}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors outline-none"
        style={baseStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors outline-none"
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon}
      {label}
    </button>
  );
}
