import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import { exportActivityData, importActivityData, type ExportFormat, type ImportResult } from '../services/analytics';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/auth';

type SettingsTab = 'profile' | 'security' | 'appearance' | 'privacy';

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
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Profile state — read-only fields from server
  const username = user?.username ?? '';
  const email = user?.email ?? '';

  // Editable profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState('');

  // Dark Mode - synced with localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : true;
  });

  // Language - synced with i18n and user preferred_language
  const [language, setLanguage] = useState(() => user?.preferred_language || i18n.language || 'en');

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
  const RTL_LANGUAGES = ['ar'];
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr');
  };

  // Privacy / data export-import state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportActivityData(exportFormat);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await importActivityData(file);
      setImportResult(result);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    
    // Validate display name is not empty
    if (!displayName.trim()) {
      setSaveError(t('settings.profile.display_name_empty'));
      setSaving(false);
      return;
    }

    try {
      const updated = await updateProfile({ display_name: displayName, preferred_language: language });
      setUser(updated);
    } catch (err: unknown) {
      const e = err as { detail?: string };
      setSaveError(e?.detail ?? t('settings.profile.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'profile', label: t('settings.tabs.profile') },
    { key: 'security', label: t('settings.tabs.security') },
    { key: 'appearance', label: t('settings.tabs.appearance') },
    { key: 'privacy', label: t('settings.tabs.privacy') },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>
        {t('settings.title')}
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
                  {t('settings.profile.title')}
                </h2>
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative group">
                    <Avatar name={displayName || username} size="lg" />
                    <button
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white font-bold"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      +
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{displayName || username}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{email}</p>
                    <button className="text-xs mt-1 hover:underline" style={{ color: 'var(--color-primary)' }}>
                      {t('settings.profile.change_avatar')}
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <InputField label={t('settings.profile.username')} value={username} readOnly />
                  <InputField label={t('settings.profile.email')} type="email" value={email} readOnly />
                  <InputField label={t('settings.profile.display_name')} value={displayName} onChange={setDisplayName} />
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                      {t('settings.profile.bio')}
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
                      placeholder={t('settings.profile.bio_placeholder')}
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
              {saveError && (
                <p className="text-sm text-right" style={{ color: 'var(--color-error)' }}>{saveError}</p>
              )}
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
                  {saving ? t('settings.profile.saving') : t('settings.profile.save')}
                </button>
              </div>
            </>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <>
              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.security.change_password')}
                </h2>
                <div className="space-y-4">
                  <InputField label={t('settings.security.current_password')} type="password" placeholder="••••••••" />
                  <InputField label={t('settings.security.new_password')} type="password" placeholder="••••••••" />
                  <InputField label={t('settings.security.confirm_password')} type="password" placeholder="••••••••" />
                </div>
                <button
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  {t('settings.security.update_password')}
                </button>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.security.two_factor')}
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('settings.security.two_factor_desc')}
                </p>
                <div 
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {t('settings.security.authenticator_app')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-success)' }}>{t('settings.security.enabled')}</p>
                  </div>
                  <button 
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t('settings.security.manage')}
                  </button>
                </div>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-error)' }}>
                  {t('settings.security.danger_zone')}
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('settings.security.danger_desc')}
                </p>
                <div className="flex gap-3">
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-2"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    {t('settings.security.sign_out_all')}
                  </button>
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    {t('settings.security.delete_account')}
                  </button>
                </div>
              </Card>
            </>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && (
            <>
              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.appearance.theme')}
                </h2>
                <div 
                  className="flex items-center justify-between p-4 rounded-lg mb-4"
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {t('settings.appearance.dark_mode')}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {isDark ? t('settings.appearance.dark_mode_on') : t('settings.appearance.dark_mode_off')}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={isDark} onChange={(v) => setIsDark(v)} />
                </div>
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.appearance.language')}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { code: 'en', label: 'English', flag: '🇬🇧' },
                    { code: 'fr', label: 'Français', flag: '🇫🇷' },
                    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
                    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className="flex items-center gap-3 p-3 rounded-lg transition-all"
                      style={{
                        border: language === lang.code ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: language === lang.code ? 'rgba(168, 85, 247, 0.1)' : 'var(--color-bg-input)',
                        color: language === lang.code ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        direction: lang.code === 'ar' ? 'rtl' : 'ltr',
                      }}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-sm font-medium">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Privacy Tab */}
          {tab === 'privacy' && (
            <>
              {/* Export */}
              <Card>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.privacy.export_title')}
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('settings.privacy.export_desc')}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['json', 'csv'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium uppercase transition-all"
                      style={{
                        border: exportFormat === fmt ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: exportFormat === fmt ? 'rgba(168, 85, 247, 0.12)' : 'var(--color-bg-input)',
                        color: exportFormat === fmt ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      }}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{
                    background: exporting ? 'var(--color-primary-disabled)' : 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {exporting ? t('settings.privacy.exporting') : t('settings.privacy.export_btn', { format: exportFormat.toUpperCase() })}
                </button>
              </Card>

              {/* Import */}
              <Card>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  {t('settings.privacy.import_title')}
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('settings.privacy.import_desc')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-input)',
                    color: importing ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                    cursor: importing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {importing ? t('settings.privacy.importing') : t('settings.privacy.import_btn')}
                </button>

                {/* Import result */}
                {importResult && (
                  <div
                    className="mt-4 p-3 rounded-lg text-sm space-y-1"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <p style={{ color: 'var(--color-success)' }}>
                      {t('settings.privacy.import_imported', { count: importResult.imported })}
                    </p>
                    {importResult.skipped > 0 && (
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        {t('settings.privacy.import_skipped', { count: importResult.skipped })}
                      </p>
                    )}
                    {importResult.errors.length > 0 && (
                      <details>
                        <summary className="cursor-pointer" style={{ color: 'var(--color-error)' }}>
                          {t('settings.privacy.import_errors', { count: importResult.errors.length })}
                        </summary>
                        <ul className="mt-2 pl-4 space-y-0.5 list-disc" style={{ color: 'var(--color-error)' }}>
                          {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {importError && (
                  <p className="mt-3 text-sm" style={{ color: 'var(--color-error)' }}>{importError}</p>
                )}
              </Card>
            </>
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
  readOnly,
}: {
  label?: string;
  type?: string;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none transition-all"
          style={{
            backgroundColor: readOnly ? 'var(--color-bg)' : 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            color: readOnly ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            cursor: readOnly ? 'default' : undefined,
          }}
          onFocus={(e) => {
            if (readOnly) return;
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