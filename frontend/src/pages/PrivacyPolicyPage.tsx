import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HistoryBackButton from '../components/HistoryBackButton';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div
        className="w-full py-8 border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('privacy_policy.title')}</h1>
          <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
            {t('privacy_policy.last_updated')}
            {new Date().toLocaleDateString(t('privacy_policy.title') === 'سياسة الخصوصية' ? 'ar-SA' : undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-12">
        {/* Introduction */}
        <section className="mb-10">
          <p className="text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {t('privacy_policy.intro')}
          </p>
        </section>

        {/* Information We Collect */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.collect_title')}</h2>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">{t('privacy_policy.collect_account_title')}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
              {t('privacy_policy.collect_account_text')}
            </p>
            <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
              <li>{t('privacy_policy.collect_account_name')}</li>
              <li>{t('privacy_policy.collect_account_email')}</li>
              <li>{t('privacy_policy.collect_account_username')}</li>
              <li>{t('privacy_policy.collect_account_password')}</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">{t('privacy_policy.collect_device_title')}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
              {t('privacy_policy.collect_device_text')}
            </p>
            <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
              <li>{t('privacy_policy.collect_device_device')}</li>
              <li>{t('privacy_policy.collect_device_ip')}</li>
              <li>{t('privacy_policy.collect_device_browser')}</li>
            </ul>
          </div>
        </section>

        {/* Information We Do NOT Collect */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.not_collect_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.not_collect_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.not_collect_payment')}</li>
            <li>{t('privacy_policy.not_collect_address')}</li>
            <li>{t('privacy_policy.not_collect_files')}</li>
            <li>{t('privacy_policy.not_collect_location')}</li>
            <li>{t('privacy_policy.not_collect_forms')}</li>
          </ul>
        </section>

        {/* Tracking & Analytics Services */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.tracking_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.tracking_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.tracking_ads')}</li>
            <li>{t('privacy_policy.tracking_ga')}</li>
            <li>{t('privacy_policy.tracking_meta')}</li>
            <li>{t('privacy_policy.tracking_tiktok')}</li>
            <li>{t('privacy_policy.tracking_hotjar')}</li>
            <li>{t('privacy_policy.tracking_clarity')}</li>
            <li>{t('privacy_policy.tracking_email')}</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mt-4">
            {t('privacy_policy.tracking_note')}
          </p>
        </section>

        {/* Data Sharing */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.sharing_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.sharing_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.sharing_vendors')}</li>
            <li>{t('privacy_policy.sharing_delivery')}</li>
            <li>{t('privacy_policy.sharing_crm')}</li>
            <li>{t('privacy_policy.sharing_ads')}</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mt-4">
            {t('privacy_policy.sharing_note')}
          </p>
        </section>

        {/* How We Use Your Data */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.usage_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.usage_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.usage_account')}</li>
            <li>{t('privacy_policy.usage_play')}</li>
            <li>{t('privacy_policy.usage_analytics')}</li>
            <li>{t('privacy_policy.usage_security')}</li>
            <li>{t('privacy_policy.usage_abuse')}</li>
            <li>{t('privacy_policy.usage_improvement')}</li>
          </ul>
        </section>

        {/* Cookies */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.cookies_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            <strong>{t('privacy_policy.cookies_text')}</strong>
          </p>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.cookies_note')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.cookies_login')}</li>
            <li>{t('privacy_policy.cookies_session')}</li>
            <li>{t('privacy_policy.cookies_remember')}</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mt-4">
            {t('privacy_policy.cookies_note2')}
          </p>
        </section>

        {/* Data Retention */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.retention_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.retention_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.retention_active')}</li>
            <li>{t('privacy_policy.retention_after')}</li>
          </ul>
        </section>

        {/* Security */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.security_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.security_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.security_encryption')}</li>
            <li>{t('privacy_policy.security_hosting')}</li>
            <li>{t('privacy_policy.security_rbac')}</li>
            <li>{t('privacy_policy.security_backups')}</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mt-4">
            {t('privacy_policy.security_note')}
          </p>
        </section>

        {/* Children's Privacy */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.children_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.children_text')}
          </p>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.children_contact')}
          </p>
        </section>

        {/* User Rights */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.rights_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.rights_text')}
          </p>
          <ul style={{ color: 'var(--color-text-secondary)' }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t('privacy_policy.rights_ask')}</li>
            <li>{t('privacy_policy.rights_request')}</li>
            <li>{t('privacy_policy.rights_contact')}</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mt-4">
            <strong>{t('privacy_policy.rights_deletion')}</strong>
          </p>
        </section>

        {/* Changes to Policy */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.changes_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.changes_text')}
          </p>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.changes_note')}
          </p>
        </section>

        {/* Contact Us */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t('privacy_policy.contact_title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }} className="mb-3">
            {t('privacy_policy.contact_text')}
          </p>
          <div
            className="p-4 rounded-lg mt-4"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p style={{ color: 'var(--color-text-secondary)' }} className="mb-2">
              <strong>{t('privacy_policy.contact_team')}</strong>
            </p>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('privacy_policy.contact_email_label')}{' '}
              <a
                href="mailto:hasankheireddine1@gmail.com"
                style={{ color: 'var(--color-primary)' }}
                className="hover:opacity-80"
              >
                hasankheireddine1@gmail.com
              </a>
            </p>
          </div>
        </section>

        <hr style={{ borderColor: 'var(--color-border)', margin: '2rem 0' }} />

        {/* Back button */}
        <div className="mt-10 mb-6">
          <HistoryBackButton label={t('privacy_policy.back')} />
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border)',
          marginTop: '3rem',
        }}
      >
        <div className="max-w-3xl mx-auto px-6 md:px-8 py-8">
          <p style={{ color: 'var(--color-text-muted)' }} className="text-sm text-center">
            {t('privacy_policy.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
