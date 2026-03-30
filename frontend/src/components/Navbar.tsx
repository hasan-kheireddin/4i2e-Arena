import { Search, Bell, ChevronDown, LogOut, User, Settings, Sun } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface border-b backdrop-blur-[12px]">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-gradient">
            <span className="text-white font-bold text-sm">FT</span>
          </div>
          <span className="text-xl font-extrabold hidden sm:block bg-brand-gradient bg-clip-text text-transparent">
            Transcendence
          </span>
        </Link>

        {/* Search */}
        <div
          className={cn(
            'relative mx-4 transition-all duration-200',
            searchFocused ? 'w-full max-w-[500px]' : 'w-full max-w-[400px]'
          )}
        >
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none left-3 text-muted" />
          <input
            type="text"
            placeholder={t('navbar.search_placeholder')}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full h-9 rounded-full text-sm outline-none transition-all duration-200 pl-10 pr-14 bg-elevated text-primary border border-DEFAULT placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <kbd className="absolute top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded right-3 text-muted bg-base border">
            Ctrl K
          </kbd>
        </div>

        {/* Right Zone */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Notifications */}
          <Link
            to="/notifications"
            className="relative p-2 rounded-lg transition-colors text-secondary hover:text-primary hover:bg-surface-hover"
            aria-label={t('navbar.notifications')}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-error notification-badge">
              3
            </span>
          </Link>

          {/* User Menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-lg transition-colors outline-none hover:bg-surface-hover',
                userMenuOpen && 'bg-surface-hover'
              )}
            >
              <Avatar name={user?.display_name || user?.username || ''} size="sm" online />
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-150 hidden sm:block text-muted',
                  userMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute top-full mt-2 w-56 rounded-xl shadow-lg py-1 right-0 bg-surface border">
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-primary">{user?.display_name || user?.username}</p>
                  <p className="text-xs text-muted">{user?.email}</p>
                </div>
                <div className="py-1">
                  <DropdownItem icon={<User className="w-4 h-4" />} label={t('navbar.profile')} to="/profile" />
                  <DropdownItem icon={<Settings className="w-4 h-4" />} label={t('navbar.settings')} to="/settings" />
                  <DropdownItem icon={<Sun className="w-4 h-4" />} label={t('navbar.toggle_theme')} />
                </div>
                <div className="py-1 border-t">
                  <DropdownItem icon={<LogOut className="w-4 h-4" />} label={t('navbar.sign_out')} danger onClick={handleLogout} />
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  to?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors outline-none',
    danger
      ? 'text-error hover:bg-error/10'
      : 'text-secondary hover:bg-surface-hover hover:text-primary'
  );

  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button className={className} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
