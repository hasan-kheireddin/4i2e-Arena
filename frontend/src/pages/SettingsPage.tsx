import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance' | 'audio';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors"
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.12)',
      }}
    >
      <div 
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
        style={{
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { i18n } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);

  // Profile state
  const [username, setUsername] = useState('ProGamer42');
  const [email, setEmail] = useState('pro@gamer.com');
  const [bio, setBio] = useState('Competitive player since 2024');

  // Notification prefs
  const [notifs, setNotifs] = useState({
    matchInvites: true,
    tournamentUpdates: true,
    friendRequests: true,
    achievements: true,
    marketing: false,
    sound: true,
  });

  // Dark Mode - synced with localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : true;
  });

  // Language - synced with i18n
  const [language, setLanguage] = useState(() => i18n.language || 'en');

  // Apply dark mode changes
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", isDark.toString());
  }, [isDark]);

  // Apply language changes
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    
    // Apply RTL for Arabic
    if (lang === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1000);
  };

  const tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'profile', label: 'Profile', icon: '👤' },
    { key: 'security', label: 'Security', icon: '🛡️' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'appearance', label: 'Appearance', icon: '🎨' },
    { key: 'audio', label: 'Audio', icon: '🔊' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>
        Settings
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar Tabs */}
        <div 
          className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible p-1 lg:p-0 rounded-xl lg:rounded-none"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: tab === t.key ? 'var(--color-primary)' : 'transparent',
                color: tab === t.key ? '#ffffff' : 'var(--color-text-secondary)',
                boxShadow: tab === t.key ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (tab !== t.key) {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.key) {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Profile Tab */}
          {tab === 'profile' && (
            <>
              <div 
                className="p-6 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  Profile Information
                </h2>
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative group">
                    <Avatar name={username} size="lg" />
                    <button 
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      <span className="text-sm">📷</span>
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{username}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{email}</p>
                    <button className="text-xs mt-1 hover:underline" style={{ color: 'var(--color-primary)' }}>
                      Change avatar
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <InputField label="Username" value={username} onChange={setUsername} icon="👤" />
                  <InputField label="Email" type="email" value={email} onChange={setEmail} icon="✉️" />
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all resize-none"
                      style={{
                        backgroundColor: 'var(--color-bg-input)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                      placeholder="Tell others about yourself..."
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.2)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
                  style={{ 
                    background: saving ? 'var(--color-primary-disabled)' : 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  💾 {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <>
              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  Change Password
                </h2>
                <div className="space-y-4">
                  <InputField label="Current Password" type="password" placeholder="••••••••" />
                  <InputField label="New Password" type="password" placeholder="••••••••" />
                  <InputField label="Confirm New Password" type="password" placeholder="••••••••" />
                </div>
                <button 
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  Update Password
                </button>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                  Two-Factor Authentication
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  Add an extra layer of security to your account
                </p>
                <div 
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🛡️</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        Authenticator App
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-success)' }}>Enabled</p>
                    </div>
                  </div>
                  <button 
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    Manage
                  </button>
                </div>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-error)' }}>
                  Danger Zone
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  Irreversible and destructive actions
                </p>
                <div className="flex gap-3">
                  <button 
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-2"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    🚪 Sign Out All Devices
                  </button>
                  <button 
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-2"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    🗑️ Delete Account
                  </button>
                </div>
              </Card>
            </>
          )}

          {/* Notifications Tab */}
          {tab === 'notifications' && (
            <Card>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  { key: 'matchInvites' as const, label: 'Match Invites', desc: 'Get notified when someone challenges you' },
                  { key: 'tournamentUpdates' as const, label: 'Tournament Updates', desc: 'Bracket changes, match scheduling' },
                  { key: 'friendRequests' as const, label: 'Friend Requests', desc: 'New friend requests and acceptances' },
                  { key: 'achievements' as const, label: 'Achievements', desc: 'Badge unlocks and milestone alerts' },
                  { key: 'marketing' as const, label: 'Marketing Emails', desc: 'News, updates, and promotional content' },
                  { key: 'sound' as const, label: 'Sound Notifications', desc: 'Play sounds for in-app notifications' },
                ].map((item) => (
                  <div 
                    key={item.key} 
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {item.label}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</p>
                    </div>
                    <Toggle
                      checked={notifs[item.key]}
                      onChange={(v) => setNotifs({ ...notifs, [item.key]: v })}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && (
            <>
              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  Theme
                </h2>
                <div 
                  className="flex items-center justify-between p-4 rounded-lg mb-4"
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{isDark ? '🌙' : '☀️'}</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        Dark Mode
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {isDark ? 'Easy on the eyes' : 'Bright and clean'}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={isDark} onChange={(v) => setIsDark(v)} />
                </div>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  Language
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { code: 'en', label: 'English', flag: '🇬🇧' },
                    { code: 'fr', label: 'Français', flag: '🇫🇷' },
                    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
                    { code: 'ar', label: 'العربية', flag: '🇱🇧' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className="flex items-center gap-3 p-3 rounded-lg transition-all"
                      style={{
                        border: language === lang.code ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: language === lang.code ? 'rgba(168, 85, 247, 0.1)' : 'var(--color-bg-input)',
                        color: language === lang.code ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      }}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <span className="text-sm font-medium">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Audio Tab */}
          {tab === 'audio' && (
            <Card>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Audio Settings
              </h2>
              <div className="space-y-6">
                {['Master Volume', 'Game Effects', 'Music', 'Notifications'].map((label) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                      <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>75%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      defaultValue={75}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        accentColor: 'var(--color-primary)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="p-6 rounded-lg"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {children}
    </div>
  );
}

function InputField({ 
  label, 
  type = 'text', 
  value, 
  onChange, 
  placeholder, 
  icon 
}: { 
  label?: string; 
  type?: string; 
  value?: string; 
  onChange?: (val: string) => void; 
  placeholder?: string; 
  icon?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none transition-all"
          style={{
            paddingLeft: icon ? '2.5rem' : '1rem',
            backgroundColor: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.2)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>
    </div>
  );
}