import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card as SurfaceCard } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import {
  changePassword,
  regenerateTwoFARecoveryCodes,
  twoFADisable,
  twoFAStatus,
  updateProfile,
} from '../services/auth';
import { LANGUAGE_OPTIONS, normalizeLanguage } from '../i18n/language';
import { setAppLanguage } from '../i18n';
import { getApiErrorMessage } from '../services/api';

type SettingsTab = 'profile' | 'security' | 'appearance';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Profile state — read-only fields from server
  const username = user?.username ?? '';
  const email = user?.email ?? '';

  // Editable profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Language - synced with i18n and user preferred_language
  const [language, setLanguage] = useState(() => normalizeLanguage(user?.preferred_language || i18n.language));
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // The profile is fetched after mount, so pick the saved language up when it lands
  const preferredLanguage = user?.preferred_language;
  useEffect(() => {
    if (preferredLanguage) setLanguage(normalizeLanguage(preferredLanguage));
  }, [preferredLanguage]);

  // Apply language changes and persist them on the account
  const handleLanguageChange = async (lang: string) => {
    const normalizedLang = setAppLanguage(lang);
    setLanguage(normalizedLang);
    setLanguageError(null);

    if (!user || user.preferred_language === normalizedLang) return;

    setLanguageSaving(true);
    try {
      const updated = await updateProfile({ preferred_language: normalizedLang });
      setUser({ ...user, ...updated });
    } catch (err: unknown) {
      setLanguageError(getApiErrorMessage(err, t('settings.profile.save_failed')));
      // Roll back to whatever the account still has so the UI never lies
      setLanguage(setAppLanguage(user.preferred_language));
    } finally {
      setLanguageSaving(false);
    }
  };

  // 2FA management state
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [twoFAInfo, setTwoFAInfo] = useState<{
    is_2fa_enabled: boolean;
    confirmed: boolean;
    created_at: string | null;
    remaining_recovery_codes: number;
  }>({
    is_2fa_enabled: false,
    confirmed: false,
    created_at: null,
    remaining_recovery_codes: 0,
  });
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableSuccess, setDisableSuccess] = useState<string | null>(null);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryAuthCode, setRecoveryAuthCode] = useState('');
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

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
      if (user) {
        setUser({
          ...user,
          ...updated,
        });
      }
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
      setTwoFAError(getApiErrorMessage(err, t('settings.security.load_status_failed')));
    } finally {
      setTwoFALoading(false);
    }
  }, [user, t]);

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
    const normalizedCode = disableCode.replace(/[\s-]/g, '').toUpperCase();
    if (![6, 8, 12].includes(normalizedCode.length)) {
      setTwoFAError(t('settings.security.enter_disable_code'));
      return;
    }

    setDisableLoading(true);
    setTwoFAError(null);
    setDisableSuccess(null);

    try {
      await twoFADisable(normalizedCode);
      setTwoFAInfo({
        is_2fa_enabled: false,
        confirmed: false,
        created_at: null,
        remaining_recovery_codes: 0,
      });
      setShowDisable2FA(false);
      setDisableCode('');
      setDisableSuccess(t('settings.security.disable_success'));
      if (user) {
        setUser({ ...user, is_2fa_enabled: false });
      }
    } catch (err: unknown) {
      setTwoFAError(getApiErrorMessage(err, t('settings.security.disable_failed')));
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    if (![6, 8, 12].includes(recoveryAuthCode.length)) {
      setTwoFAError(t('settings.security.enter_disable_code'));
      return;
    }
    setRecoveryLoading(true);
    setTwoFAError(null);
    try {
      const result = await regenerateTwoFARecoveryCodes(recoveryAuthCode);
      setNewRecoveryCodes(result.recovery_codes);
      setRecoveryAuthCode('');
      await refreshTwoFAState();
    } catch (err: unknown) {
      setTwoFAError(getApiErrorMessage(err, t('settings.security.load_status_failed')));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    await logout();
    navigate('/login');
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('settings.security.password_fields_required'));
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await changePassword({
        old_password: currentPassword,
        new_password: newPassword,
        new_password2: confirmPassword,
      });
      setPasswordSuccess(response.detail);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordError(getApiErrorMessage(err, t('settings.security.password_update_failed')));
    } finally {
      setPasswordLoading(false);
    }
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'profile', label: t('settings.tabs.profile') },
    { key: 'security', label: t('settings.tabs.security') },
    { key: 'appearance', label: t('settings.tabs.appearance') },
  ];

  const twoFAEnabled = twoFAInfo.is_2fa_enabled && twoFAInfo.confirmed;
  const twoFAStatusText = twoFALoading
    ? t('settings.security.status_checking')
    : twoFAEnabled
      ? t('settings.security.enabled')
      : t('settings.security.disabled');
  const twoFAManageLabel = twoFAEnabled
    ? t('settings.security.manage_disable')
    : t('settings.security.manage_enable');
  const twoFAEnabledAt = twoFAInfo.created_at
    ? new Date(twoFAInfo.created_at).toLocaleString()
    : null;
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
                      {t('settings.profile.identity_sync')}
                    </p>
                  </div>
                </div>
                <div className="mb-6 flex items-center gap-4">
                  <div>
                    <Avatar name={user?.display_name || user?.username || ''} size="lg" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">{user?.display_name || user?.username}</p>
                    <p className="text-xs text-muted">{email}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Input label={t('settings.profile.username')} value={username} readOnly disabled />
                  <Input label={t('settings.profile.email')} type="email" value={email} readOnly disabled />
                  <Input
                    label={t('settings.profile.display_name')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </SurfaceCard>
              {saveError && (
                <p className="text-sm text-danger" style={{ textAlign: 'start' }}>{saveError}</p>
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
                <div className="space-y-4">
                  <Input
                    label={t('settings.security.current_password')}
                    type="password"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <Input
                    label={t('settings.security.new_password')}
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Input
                    label={t('settings.security.confirm_password')}
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {passwordError && <p className="mt-3 text-sm text-danger">{passwordError}</p>}
                {passwordSuccess && <p className="mt-3 text-sm text-success">{passwordSuccess}</p>}
                <Button className="mt-4" onClick={handleChangePassword} loading={passwordLoading}>
                  {t('settings.security.update_password')}
                </Button>
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
                        {t('settings.security.enabled_on', { date: twoFAEnabledAt })}
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
                    {t('settings.security.setup_redirect_hint')}
                  </p>
                )}
                {twoFAEnabled && !twoFALoading && (
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <p className="text-xs text-muted">
                      {twoFAInfo.remaining_recovery_codes} recovery codes remaining
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowRecoveryCodes(true);
                        setNewRecoveryCodes([]);
                        setTwoFAError(null);
                      }}
                    >
                      Regenerate recovery codes
                    </Button>
                  </div>
                )}
              </SurfaceCard>

              <SurfaceCard className="p-6">
                <h2 className="mb-2 text-base font-semibold text-primary">
                  {t('settings.security.sign_out')}
                </h2>
                <p className="mb-4 text-sm text-secondary">
                  {t('settings.security.sign_out_desc')}
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  loading={signOutLoading}
                  onClick={() => { void handleSignOut(); }}
                >
                  {t('settings.security.sign_out')}
                </Button>
              </SurfaceCard>
            </>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && (
            <>
              <SurfaceCard className="p-6">
                <h2 className="mb-4 text-base font-semibold text-primary">
                  {t('settings.appearance.language')}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { void handleLanguageChange(lang.code); }}
                      disabled={languageSaving}
                      aria-pressed={language === lang.code}
                      className="flex items-center gap-3 rounded-xl border bg-input p-3 transition-all disabled:opacity-60"
                      style={{
                        borderColor: language === lang.code ? 'rgb(var(--color-primary-rgb))' : 'rgb(var(--color-border-rgb))',
                        backgroundColor: language === lang.code ? 'rgb(var(--color-primary-rgb) / 0.1)' : undefined,
                        color: language === lang.code ? 'rgb(var(--color-primary-rgb))' : 'rgb(var(--color-text-secondary-rgb))',
                        direction: lang.direction,
                        textAlign: 'start',
                      }}
                    >
                      <span className="text-sm font-medium">{lang.label}</span>
                    </button>
                  ))}
                </div>
                {languageError && (
                  <p role="alert" className="mt-3 text-sm text-error">{languageError}</p>
                )}
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
        title={t('settings.security.disable_modal_title')}
      >
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            {t('settings.security.disable_modal_desc')}
          </p>
          <Input
            label={t('settings.security.authenticator_code')}
            value={disableCode}
            onChange={(e) => {
              setDisableCode(e.target.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase().slice(0, 12));
              setTwoFAError(null);
              setDisableSuccess(null);
            }}
            placeholder="000000"
            maxLength={12}
          />
          {twoFAError && (
            <p role="alert" className="text-sm text-error">{twoFAError}</p>
          )}
          <div className="flex gap-3">
            <Button onClick={handleDisable2FA} loading={disableLoading} variant="danger">
              {t('settings.security.confirm_disable')}
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
              {t('settings.security.cancel')}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={twoFAEnabled && showRecoveryCodes}
        onClose={() => {
          if (recoveryLoading) return;
          setShowRecoveryCodes(false);
          setRecoveryAuthCode('');
          setNewRecoveryCodes([]);
        }}
        title="Recovery codes"
      >
        {newRecoveryCodes.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Save these single-use codes now. Existing recovery codes no longer work.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-input p-4">
              {newRecoveryCodes.map((item) => <code key={item}>{item}</code>)}
            </div>
            <Button onClick={() => setShowRecoveryCodes(false)}>I saved these codes</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Enter a current authenticator or recovery code. Regenerating invalidates every old recovery code.
            </p>
            <Input
              label="Authentication code"
              value={recoveryAuthCode}
              maxLength={12}
              onChange={(event) => setRecoveryAuthCode(
                event.target.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase().slice(0, 12),
              )}
            />
            <Button loading={recoveryLoading} onClick={() => { void handleRegenerateRecoveryCodes(); }}>
              Regenerate codes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
