import { useTranslation } from 'react-i18next';

function IconFlag({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

/**
 * Confirmation prompt shown before a player forfeits a live match.
 *
 * Forfeiting is irreversible and hands the win to the opponent, so it must not
 * be one stray click away. Shared by Tic-Tac-Toe and both Pong views (2D and
 * 3D) so the three games ask the same question the same way; `keyPrefix`
 * selects that game's translation namespace.
 */
export default function ForfeitConfirm({
  open, onCancel, onConfirm, keyPrefix,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  keyPrefix: 'ttt' | 'pong';
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}>
      <div className="rounded-2xl p-6 max-w-sm w-full text-center space-y-3 ttt-result-in"
        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--color-danger-rgb) / 0.14)', color: 'var(--color-danger)' }}>
          <IconFlag size={22} />
        </div>
        <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t(`${keyPrefix}.forfeit_confirm_title`)}
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {t(`${keyPrefix}.forfeit_confirm_body`)}
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-surface-hover"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}>
            {t(`${keyPrefix}.cancel`)}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-danger)' }}>
            {t(`${keyPrefix}.forfeit_confirm_yes`)}
          </button>
        </div>
      </div>
    </div>
  );
}
