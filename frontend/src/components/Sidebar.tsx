import {
  Home,
  Gamepad2,
  BarChart3,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Circle,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useState } from 'react';
import { Avatar } from './ui/Avatar';

interface NavItemDef {
  label: string;
  icon: React.ReactNode;
  to: string;
  children?: { label: string; to: string }[];
}

const onlineFriends = [
  { name: 'Sarah K.', online: true },
  { name: 'Mike J.', online: true },
  { name: 'Emma W.', online: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Classes shared by all nav items (both button and NavLink variants) */
const navItemBase = (collapsed: boolean) =>
  cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 outline-none border-l-[3px]',
    collapsed && 'justify-center px-0'
  );

/** Active vs inactive conditional classes */
const navItemVariant = (isActive: boolean) =>
  isActive
    ? 'bg-brand/10 text-brand border-l-brand'
    : 'text-secondary border-l-transparent hover:bg-surface-hover hover:text-primary';

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const location = useLocation();

  const navItems: NavItemDef[] = [
    { label: t('sidebar.dashboard'),    icon: <Home className="w-5 h-5" />,     to: '/Home' },
    { label: t('sidebar.games'),         icon: <Gamepad2 className="w-5 h-5" />, to: '/games/playpage' },
    { label: t('sidebar.leaderboard'),   icon: <BarChart3 className="w-5 h-5" />,to: '/leaderboard' },
    { label: t('sidebar.match_history'), icon: <History className="w-5 h-5" />,  to: '/history' },
    { label: t('sidebar.settings'),      icon: <Settings className="w-5 h-5" />, to: '/settings' },
  ];

  const CollapseIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <aside
      className={cn(
        'fixed top-16 left-0 h-[calc(100vh-64px)] z-40 transition-all duration-250 flex flex-col',
        'bg-surface border-r',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute top-6 -right-3 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10 bg-surface border text-muted hover:text-primary hover:bg-surface-hover"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <CollapseIcon className="w-3.5 h-3.5" />
      </button>

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto" aria-label="Sidebar">
        {navItems.map((item) => {
          const isActive =
            item.to === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(item.to);
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = expandedItem === item.label;

          return (
            <div key={item.label}>
              {hasChildren ? (
                <button
                  onClick={() => setExpandedItem(isExpanded ? null : item.label)}
                  className={cn(navItemBase(collapsed), navItemVariant(isActive))}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 transition-transform duration-150',
                          isExpanded && 'rotate-90',
                        )}
                      />
                    </>
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  className={cn(navItemBase(collapsed), navItemVariant(isActive))}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              )}

              {/* Sub-items */}
              {hasChildren && isExpanded && !collapsed && (
                <div className="mt-1 space-y-0.5 ml-5">
                  {item.children!.map((child) => {
                    const childActive = location.pathname === child.to;
                    return (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          childActive
                            ? 'text-brand bg-brand/5'
                            : 'text-muted hover:text-primary hover:bg-surface-hover'
                        )}
                      >
                        <Circle className="w-1.5 h-1.5 fill-current" />
                        {child.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Online Friends */}
      {!collapsed && (
        <div className="px-4 py-4 border-t">
          <p className="text-[10px] font-medium uppercase tracking-widest mb-3 text-muted">
            {t('sidebar.online')} — {onlineFriends.length}
          </p>
          <div className="space-y-2">
            {onlineFriends.map((f) => (
              <div key={f.name} className="flex items-center gap-2.5 cursor-pointer">
                <Avatar name={f.name} size="sm" online />
                <span className="text-xs truncate transition-colors text-secondary hover:text-primary">
                  {f.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
