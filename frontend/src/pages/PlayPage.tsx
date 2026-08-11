import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Globe, Monitor, Gamepad2 } from 'lucide-react';
import { PongIcon, TicTacToeIcon } from '../components/icons/GameIcons';
import { cn } from '../lib/utils';

type GameChoice = 'pong' | 'tictactoe' | null;
type ModeChoice = 'online' | 'local' | null;
type Dimension = '2d' | '3d';
type Step = 1 | 2;

export default function PlayPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const PONG_MODES = [
    { id: 'online' as ModeChoice, icon: <Globe className="w-7 h-7" />, label: t('play.mode_online'), desc: t('play.mode_online_desc') },
    { id: 'local'  as ModeChoice, icon: <Monitor className="w-7 h-7"/>, label: t('play.mode_local'),  desc: t('play.mode_local_desc') },
  ];

  const TTT_MODES = [
    { id: 'online' as ModeChoice, icon: <Globe className="w-7 h-7" />, label: t('play.mode_online'), desc: t('play.mode_online_desc') },
    { id: 'local' as ModeChoice, icon: <Monitor className="w-7 h-7" />, label: t('play.mode_local'), desc: t('play.mode_local_desc') },
  ];

  const [step,       setStep]       = useState<Step>(1);
  const [game,       setGame]       = useState<GameChoice>(null);
  const [mode,       setMode]       = useState<ModeChoice>(null);
  const [dimension,  setDimension]  = useState<Dimension>('2d');

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 2) { setGame(null); setMode(null); setStep(1); }
  };

  const selectGame = (g: GameChoice) => {
    setGame(g);
    setMode(null);
    setDimension('2d');
    setStep(2);
  };

  const selectMode = (m: ModeChoice) => setMode(m);

  const launch = () => {
    if (!game || !mode) return;
    if (game === 'pong') {
      const base = dimension === '3d' ? '/games/pong3d' : '/games/pong';
      if (mode === 'online') navigate(`${base}?mode=online`);
      else navigate(`${base}?mode=local`);
    } else {
      if (mode === 'online') navigate('/games/tictactoe?mode=online');
      else                   navigate('/games/tictactoe?mode=local');
    }
  };

  const canLaunch = !!game && !!mode;

  // ── Slide direction ───────────────────────────────────────────────────────
  const slideClass = 'transition-all duration-300 ease-out';

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-3xl w-full">

        {/* ── Progress bar ── */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {([1, 2] as Step[]).map((s) => {
            const active = s === step;
            const done = s < step;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                    style={{
                      background: active || done ? 'linear-gradient(135deg,#f97316,#ef4444)' : 'var(--color-bg-card)',
                      color: active || done ? '#fff' : 'var(--color-text-muted)',
                      border: active || done ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    {s}
                  </div>
                  <span className="text-xs font-medium hidden sm:block"
                    style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {s === 1 ? t('play.step_game') : t('play.step_mode')}
                  </span>
                </div>
                {s < 2 && <div className="w-10 h-px" style={{ backgroundColor: 'var(--color-border)' }} />}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1 — Choose Game ── */}
        {step === 1 && (
          <div className={slideClass}>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {t('play.choose_game')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('play.pick_game')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Pong card */}
              <button
                onClick={() => selectGame('pong')}
                className="group relative overflow-hidden p-8 rounded-2xl transition-all duration-300 hover:-translate-y-2 outline-none"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', textAlign: 'start' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(249,115,22,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="absolute top-4 opacity-10 group-hover:opacity-20 transition-opacity" style={{ insetInlineEnd: '1rem' }}>
                  <PongIcon className="w-10 h-10" style={{ color: 'var(--color-text-primary)' }} />
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-white"
                  style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}>
                  <PongIcon className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text-primary)' }}>{t('home.game_pong')}</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('play.pong_desc')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[t('play.pong_tag_online'), t('play.pong_tag_local')].map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(249,115,22,0.12)', color: '#fdba74' }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: '#f97316' }}>
                  {t('play.select')} <ArrowRight className="w-4 h-4 icon-directional transition-transform" />
                </div>
              </button>

              {/* TicTacToe card */}
              <button
                onClick={() => selectGame('tictactoe')}
                className="group relative overflow-hidden p-8 rounded-2xl transition-all duration-300 hover:-translate-y-2 outline-none"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', textAlign: 'start' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(245,158,11,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="absolute top-4 opacity-10 group-hover:opacity-20 transition-opacity" style={{ insetInlineEnd: '1rem' }}>
                  <TicTacToeIcon className="w-10 h-10" style={{ color: 'var(--color-text-primary)' }} />
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-white"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
                  <TicTacToeIcon className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text-primary)' }}>{t('home.game_ttt')}</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('play.ttt_desc')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[t('play.pong_tag_online'), t('play.pong_tag_local')].map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#fcd34d' }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: '#f59e0b' }}>
                  {t('play.select')} <ArrowRight className="w-4 h-4 icon-directional transition-transform" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Choose Mode ── */}
        {step === 2 && game && (
          <div className={slideClass}>
            <div className="text-center mb-8">
              <div className="flex justify-center mb-2" style={{ color: 'var(--color-primary)' }}>
                {game === 'pong'
                  ? <PongIcon className="w-8 h-8" />
                  : <TicTacToeIcon className="w-8 h-8" />}
              </div>
              <h1 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {t('play.choose_mode')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('play.how_play', { game: game === 'pong' ? t('home.game_pong') : t('home.game_ttt') })}
              </p>
            </div>

            {/* 2D / 3D toggle — only for Pong */}
            {game === 'pong' && (
              <div className="flex justify-center mb-6">
                <div className="inline-flex rounded-xl p-1" style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)' }}>
                  {(['2d', '3d'] as Dimension[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDimension(d)}
                      className={cn(
                        'px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
                        dimension === d ? 'text-white shadow-md' : 'hover:opacity-80',
                      )}
                      style={{
                        background: dimension === d
                          ? 'linear-gradient(135deg,#8b5cf6,#6366f1)'
                          : 'transparent',
                        color: dimension === d ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {d === '2d' ? t('play.mode_2d') : t('play.mode_3d')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-4">
              {(game === 'pong' ? PONG_MODES : TTT_MODES).map((m) => (
                <button
                  key={m.id as string}
                  onClick={() => selectMode(m.id)}
                  className={cn('relative p-6 rounded-2xl text-center transition-all duration-200 outline-none hover:-translate-y-1', game === 'tictactoe' && 'max-w-xs w-full')}
                  style={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: mode === m.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    boxShadow: mode === m.id ? '0 0 24px rgba(249,115,22,0.2)' : 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                  onMouseLeave={(e) => { if (mode !== m.id) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                >
                  <div className="flex justify-center mb-3"
                    style={{ color: mode === m.id ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                    {m.icon}
                  </div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>{m.label}</h3>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{m.desc}</p>
                  {m.id === 'local' && game === 'pong' && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {t('play.local_controls')}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {mode && (
              <div className="flex justify-center mt-8 gap-4">
                <button onClick={goBack} className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-150"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                  <ArrowLeft className="w-4 h-4 icon-directional" /> {t('play.back')}
                </button>
                <button
                  onClick={launch}
                  disabled={!canLaunch}
                  className="group px-10 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', boxShadow: '0 4px 20px rgba(249,115,22,0.35)' }}>
                  <Gamepad2 className="w-5 h-5" />
                  {t('play.play_now')}
                  <ArrowRight className="w-4 h-4 icon-directional transition-transform" />
                </button>
              </div>
            )}

            {/* Back button when no mode selected */}
            {!mode && (
              <div className="flex justify-center mt-8">
                <button onClick={goBack} className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-150"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                  <ArrowLeft className="w-4 h-4 icon-directional" /> {t('play.back')}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
