import {
  Home,
  Gamepad2,
  BarChart3,
  History,
  LineChart,
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
import { useDir } from '../hooks/useDir';

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

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const { isRTL } = useDir();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const location = useLocation();

  const navItems: NavItemDef[] = [
    { label: t('sidebar.dashboard'),    icon: <Home className="w-5 h-5" />,     to: '/Home' },
    { label: t('sidebar.games'),         icon: <Gamepad2 className="w-5 h-5" />, to: '/games/playpage' },
    { label: t('sidebar.leaderboard'),   icon: <BarChart3 className="w-5 h-5" />,to: '/leaderboard' },
    { label: t('sidebar.match_history'), icon: <History className="w-5 h-5" />,  to: '/history' },
    { label: t('sidebar.analytics'),     icon: <LineChart className="w-5 h-5" />,to: '/analytics' },
    { label: t('sidebar.settings'),      icon: <Settings className="w-5 h-5" />, to: '/settings' },
  ];

  // Inline style helpers for directional borders
  const sidebarBorderStyle = isRTL
    ? { borderLeft: '1px solid var(--color-border)' }
    : { borderRight: '1px solid var(--color-border)' };

  const activeItemStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
    color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    ...(isRTL
      ? { borderRight: isActive ? '3px solid var(--color-primary)' : '3px solid transparent' }
      : { borderLeft:  isActive ? '3px solid var(--color-primary)' : '3px solid transparent' }
    ),
  });

  // Collapse toggle icon — flip arrows in RTL
  const CollapseIcon = isRTL
    ? (collapsed ? ChevronLeft  : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  return (
    <aside
      className={cn(
        // LTR: fixed to the left; RTL: fixed to the right
        'fixed top-16 left-0 rtl:left-auto rtl:right-0',
        'h-[calc(100vh-64px)] z-40 transition-all duration-250 flex flex-col',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{
        backgroundColor: 'var(--color-bg-card)',
        ...sidebarBorderStyle,
      }}
    >
      {/* Collapse Toggle — sticks out from the outer edge */}
      <button
        onClick={onToggle}
        className={cn(
          'absolute top-6 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10',
          // LTR: sticks out to the right; RTL: sticks out to the left
          isRTL ? '-left-3' : '-right-3'
        )}
        style={{
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-text-primary)';
          e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-muted)';
          e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
        }}
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
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 outline-none',
                    collapsed && 'justify-center px-0'
                  )}
                  style={activeItemStyle(isActive)}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className={cn('flex-1', isRTL ? 'text-right' : 'text-left')}>
                        {item.label}
                      </span>
                      {/* Expand arrow — flip in RTL */}
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 transition-transform duration-150',
                          isExpanded && 'rotate-90',
                          isRTL && 'scale-x-[-1]'
                        )}
                      />
                    </>
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 outline-none',
                    collapsed && 'justify-center px-0'
                  )}
                  style={activeItemStyle(isActive)}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              )}

              {/* Sub-items — indent on the correct side */}
              {hasChildren && isExpanded && !collapsed && (
                <div className={cn('mt-1 space-y-0.5', isRTL ? 'mr-5' : 'ml-5')}>
                  {item.children!.map((child) => {
                    const childActive = location.pathname === child.to;
                    return (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                        style={{
                          color: childActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          backgroundColor: childActive ? 'rgba(168, 85, 247, 0.05)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!childActive) {
                            e.currentTarget.style.color = 'var(--color-text-primary)';
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!childActive) {
                            e.currentTarget.style.color = 'var(--color-text-muted)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
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
        <div className="px-4 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p
            className="text-[10px] font-medium uppercase tracking-widest mb-3"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('sidebar.online')} — {onlineFriends.length}
          </p>
          <div className="space-y-2">
            {onlineFriends.map((f) => (
              <div key={f.name} className="flex items-center gap-2.5 group cursor-pointer">
                <Avatar name={f.name} size="sm" online />
                <span
                  className="text-xs truncate transition-colors"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                >
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
