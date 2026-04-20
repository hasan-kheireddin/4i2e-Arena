import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card as SurfaceCard } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Spinner } from '../components/ui/Spinner';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth } from '../context/AuthContext';
import { twoFADisable, twoFAStatus, updateProfile } from '../services/auth';
import { LANGUAGE_OPTIONS, applyLanguageToDocument, normalizeLanguage } from '../i18n/language';
import type { ApiError } from '../services/api';

type SettingsTab = 'profile' | 'security' | 'appearance';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-10 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-border'}`}
    >
      <div
        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Profile state — read-only fields from server
  const username = user?.username ?? '';
  const email = user?.email ?? '';
  const isOAuthUser = user?.is_oauth_user ?? false;

  // Editable profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState('');

  // Dark Mode - synced with localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : true;
  });

  // Language - synced with i18n and user preferred_language
  const [language, setLanguage] = useState(() => normalizeLanguage(user?.preferred_language || i18n.language));

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
    const normalizedLang = applyLanguageToDocument(lang);
    setLanguage(normalizedLang);
    void i18n.changeLanguage(normalizedLang);
  };

  // 2FA management state
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [twoFAInfo, setTwoFAInfo] = useState<{
    is_2fa_enabled: boolean;
    confirmed: boolean;
    created_at: string | null;
  }>({
    is_2fa_enabled: false,
    confirmed: false,
    created_at: null,
  });
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableSuccess, setDisableSuccess] = useState<string | null>(null);

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

  const refreshTwoFAState = useCallback(async () => {
    if (!user) return;
    setTwoFALoading(true);
    setTwoFAError(null);

    try {
      const status = await twoFAStatus();
      setTwoFAInfo(status);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setTwoFAError(apiErr.detail ?? 'Failed to load two-factor authentication status.');
    } finally {
      setTwoFALoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'security') {
      void refreshTwoFAState();
    }
  }, [tab, refreshTwoFAState]);

  const handleManage2FA = () => {
    setDisableSuccess(null);
    setTwoFAError(null);

    if (twoFAInfo.is_2fa_enabled) {
      setShowDisable2FA((prev) => !prev);
      return;
    }

    navigate('/setup-2fa');
  };

  const handleDisable2FA = async () => {
    if (disableCode.length !== 6) {
      setTwoFAError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setDisableLoading(true);
    setTwoFAError(null);
    setDisableSuccess(null);

    try {
      await twoFADisable(disableCode);
      setTwoFAInfo({
        is_2fa_enabled: false,
        confirmed: false,
        created_at: null,
      });
      setShowDisable2FA(false);
      setDisableCode('');
      setDisableSuccess('Two-factor authentication has been disabled.');
      if (user) {
        setUser({ ...user, is_2fa_enabled: false });
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setTwoFAError(apiErr.detail ?? 'Failed to disable two-factor authentication.');
    } finally {
      setDisableLoading(false);
    }
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'profile', label: t('settings.tabs.profile') },
    { key: 'security', label: t('settings.tabs.security') },
    { key: 'appearance', label: t('settings.tabs.appearance') },
  ];

  const twoFAEnabled = twoFAInfo.is_2fa_enabled && twoFAInfo.confirmed;
  const twoFAStatusText = twoFALoading
    ? 'Checking status...'
    : twoFAEnabled
      ? t('settings.security.enabled')
      : 'Disabled';
  const twoFAManageLabel = twoFAEnabled ? 'Disable' : 'Enable';
  const twoFAEnabledAt = twoFAInfo.created_at
    ? new Date(twoFAInfo.created_at).toLocaleString()
    : null;
  const profileFields = [username, email, displayName, bio, language];
  const profileCompletion = Math.round(
    (profileFields.filter((value) => value.trim().length > 0).length / profileFields.length) * 100
  );
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="mb-6 font-display text-2xl font-bold text-primary">
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
              <SurfaceCard variant="featured" className="p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="mb-1 text-base font-semibold text-primary">
                      {t('settings.profile.title')}
                    </h2>
                    <p className="text-sm text-secondary">
                      Keep your identity and preferences in sync across the arena.
                    </p>
                  </div>
                  <div className="w-full max-w-[180px]">
                    <ProgressBar value={profileCompletion} label={`Profile completeness ${profileCompletion}%`} showLabel />
                  </div>
                </div>
                <div className="mb-6 flex items-center gap-4">
                  <div className="group relative">
                    <Avatar name={displayName || username} size="lg" />
                    <Tooltip content="Avatar uploads are not wired yet.">
                      <button
                        type="button"
                        className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white opacity-0 shadow-card transition-opacity group-hover:opacity-100"
                      >
                        +
                      </button>
                    </Tooltip>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">{displayName || username}</p>
                    <p className="text-xs text-muted">{email}</p>
                    <p className="mt-1 text-xs text-brand">{t('settings.profile.change_avatar')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Input label={t('settings.profile.username')} value={username} readOnly />
                  <Input label={t('settings.profile.email')} type="email" value={email} readOnly />
                  <Input
                    label={t('settings.profile.display_name')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-primary">
                      {t('settings.profile.bio')}
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-border bg-input px-4 py-3 text-sm text-primary outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                      placeholder={t('settings.profile.bio_placeholder')}
                    />
                  </div>
                </div>
              </SurfaceCard>
              {saveError && (
                <p className="text-right text-sm text-danger">{saveError}</p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  loading={saving}
                  className="min-w-[160px]"
                >
                  {t('settings.profile.save')}
                </Button>
              </div>
            </>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <>
              <SurfaceCard className="p-6">
                <h2 className="mb-4 text-base font-semibold text-primary">
                  {t('settings.security.change_password')}
                </h2>
                {isOAuthUser ? (
                  <div className="rounded-xl border border-info/30 bg-info/10 p-4 text-sm text-secondary">
                    <div className="mb-2">
                      <Badge variant="info">42 OAuth</Badge>
                    </div>
                    This account uses 42 OAuth. Password login and password changes are disabled.
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <Input label={t('settings.security.current_password')} type="password" placeholder="••••••••" />
                      <Input label={t('settings.security.new_password')} type="password" placeholder="••••••••" />
                      <Input label={t('settings.security.confirm_password')} type="password" placeholder="••••••••" />
                    </div>
                    <Button className="mt-4">
                      {t('settings.security.update_password')}
                    </Button>
                  </>
                )}
              </SurfaceCard>

              <SurfaceCard className="p-6">
                <h2 className="mb-2 text-base font-semibold text-primary">
                  {t('settings.security.two_factor')}
                </h2>
                <p className="mb-4 text-sm text-secondary">
                  {t('settings.security.two_factor_desc')}
                </p>
                {twoFAError && (
                  <p className="mb-4 text-sm text-danger">
                    {twoFAError}
                  </p>
                )}
                {disableSuccess && (
                  <p className="mb-4 text-sm text-success">
                    {disableSuccess}
                  </p>
                )}
                <div className="flex items-center justify-between rounded-xl border border-border bg-input p-4">
                  <div>
                    <p className="text-sm font-medium text-primary">
                      {t('settings.security.authenticator_app')}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant={twoFALoading ? 'info' : twoFAEnabled ? 'online' : 'offline'}
                        dot={!twoFALoading}
                      >
                        {twoFAStatusText}
                      </Badge>
                      {twoFALoading && <Spinner size="sm" variant="brand" />}
                    </div>
                    {twoFAEnabledAt && (
                      <p className="mt-2 text-xs text-muted">
                        Enabled on {twoFAEnabledAt}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleManage2FA}
                    disabled={twoFALoading || disableLoading}
                    variant={twoFAEnabled ? 'danger' : 'secondary'}
                    size="sm"
                  >
                    {twoFAManageLabel}
                  </Button>
                </div>
                {!twoFAEnabled && !twoFALoading && (
                  <p className="mt-3 text-xs text-muted">
                    You will be redirected to the setup flow to scan a QR code and confirm your first TOTP code.
                  </p>
                )}
              </SurfaceCard>

              <SurfaceCard className="p-6">
                <h2 className="mb-2 text-base font-semibold text-danger">
                  {t('settings.security.danger_zone')}
                </h2>
                <p className="mb-4 text-sm text-secondary">
                  {t('settings.security.danger_desc')}
                </p>
                <div className="flex gap-3">
                  <Button variant="danger" size="sm">
                    {t('settings.security.sign_out_all')}
                  </Button>
                  <Button variant="danger" size="sm">
                    {t('settings.security.delete_account')}
                  </Button>
                </div>
              </SurfaceCard>
            </>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && (
            <>
              <SurfaceCard className="p-6">
                <h2 className="mb-4 text-base font-semibold text-primary">
                  {t('settings.appearance.theme')}
                </h2>
                <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-input p-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {t('settings.appearance.dark_mode')}
                      </p>
                      <p className="text-xs text-muted">
                        {isDark ? t('settings.appearance.dark_mode_on') : t('settings.appearance.dark_mode_off')}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={isDark} onChange={(v) => setIsDark(v)} />
                </div>
              </SurfaceCard>

              <SurfaceCard className="p-6">
                <h2 className="mb-4 text-base font-semibold text-primary">
                  {t('settings.appearance.language')}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className="flex items-center gap-3 rounded-xl border bg-input p-3 text-left transition-all"
                      style={{
                        borderColor: language === lang.code ? 'rgb(var(--color-primary-rgb))' : 'rgb(var(--color-border-rgb))',
                        backgroundColor: language === lang.code ? 'rgb(var(--color-primary-rgb) / 0.1)' : undefined,
                        color: language === lang.code ? 'rgb(var(--color-primary-rgb))' : 'rgb(var(--color-text-secondary-rgb))',
                        direction: lang.direction,
                      }}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-sm font-medium">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </SurfaceCard>
            </>
          )}

        </div>
      </div>

      <Modal
        open={twoFAEnabled && showDisable2FA}
        onClose={() => {
          if (disableLoading) return;
          setShowDisable2FA(false);
          setDisableCode('');
          setTwoFAError(null);
        }}
        title="Disable two-factor authentication"
      >
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Enter the 6-digit code from your authenticator app to confirm this action.
          </p>
          <Input
            label="Authenticator Code"
            value={disableCode}
            onChange={(e) => {
              setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setTwoFAError(null);
              setDisableSuccess(null);
            }}
            placeholder="000000"
            maxLength={6}
          />
          <div className="flex gap-3">
            <Button onClick={handleDisable2FA} loading={disableLoading} variant="danger">
              Confirm Disable
            </Button>
            <Button
              onClick={() => {
                setShowDisable2FA(false);
                setDisableCode('');
                setTwoFAError(null);
              }}
              disabled={disableLoading}
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
