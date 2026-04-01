import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Globe, Bot, Monitor, Gamepad2 } from 'lucide-react';
import { cn } from '../lib/utils';

type GameChoice = 'pong' | 'tictactoe' | null;
type ModeChoice = 'online' | 'ai' | 'local' | null;
type DiffChoice = 'easy' | 'medium' | 'hard';
type Step = 1 | 2 | 3;

const DIFFICULTIES: DiffChoice[] = ['easy', 'medium', 'hard'];

export default function PlayPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const PONG_MODES = [
    { id: 'online' as ModeChoice, icon: <Globe className="w-7 h-7" />, label: t('play.mode_online'), desc: t('play.mode_online_desc') },
    { id: 'ai'     as ModeChoice, icon: <Bot    className="w-7 h-7" />, label: t('play.mode_ai'),     desc: t('play.mode_ai_desc') },
    { id: 'local'  as ModeChoice, icon: <Monitor className="w-7 h-7"/>, label: t('play.mode_local'),  desc: t('play.mode_local_desc') },
  ];

  const TTT_MODES = [
    { id: 'online' as ModeChoice, icon: <Globe className="w-7 h-7" />, label: t('play.mode_online'), desc: t('play.mode_online_desc') },
    { id: 'local' as ModeChoice, icon: <Monitor className="w-7 h-7" />, label: t('play.mode_local'), desc: t('play.mode_local_desc') },
  ];

  const DIFF_META: Record<DiffChoice, { label: string; desc: string; color: string }> = {
    easy:       { label: t('play.diff_easy'),       desc: t('play.diff_easy_desc'),       color: '#22c55e' },
    medium:     { label: t('play.diff_medium'),     desc: t('play.diff_medium_desc'),     color: '#f59e0b' },
    hard:       { label: t('play.diff_hard'),       desc: t('play.diff_hard_desc'),       color: '#ef4444' },
  };
  const [step,       setStep]       = useState<Step>(1);
  const [game,       setGame]       = useState<GameChoice>(null);
  const [mode,       setMode]       = useState<ModeChoice>(null);
  const [difficulty, setDifficulty] = useState<DiffChoice>('medium');

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 2) { setGame(null); setMode(null); setStep(1); }
    if (step === 3) { setMode(null); setStep(2); }
  };

  const selectGame = (g: GameChoice) => {
    setGame(g);
    setMode(null);
    setStep(2);
  };

  const selectMode = (m: ModeChoice) => {
    if (m === 'ai') { setMode(m); setStep(3); }
    else            { setMode(m); }
  };

  const launch = () => {
    if (!game || !mode) return;
    if (game === 'pong') {
      if      (mode === 'online') navigate('/games/pong?mode=online');
      else if (mode === 'ai')     navigate(`/games/pong?mode=ai&difficulty=${difficulty}`);
      else                        navigate('/games/pong?mode=local');
    } else {
      // TicTacToe
      if (mode === 'online') navigate('/games/tictactoe?mode=online');
      else                   navigate('/games/tictactoe?mode=local');
    }
  };

  const canLaunch = !!game && !!mode && (mode !== 'ai' || !!difficulty);

  // ── Slide direction ───────────────────────────────────────────────────────
  const slideClass = 'transition-all duration-300 ease-out';

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-3xl w-full">

        {/* ── Progress bar ── */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {([1, 2, 3] as Step[]).map((s) => {
            const active = s === step;
            const done   = s < step || (s === 3 && step > 2);
            const show   = s < 3 || (game === 'pong' && mode === 'ai') || step === 3;
            if (!show && s === 3) return null;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                    style={{
                      background: active || done ? 'linear-gradient(135deg,#a855f7,#ec4899)' : 'var(--color-bg-card)',
                      color: active || done ? '#fff' : 'var(--color-text-muted)',
                      border: active || done ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    {s}
                  </div>
                  <span className="text-xs font-medium hidden sm:block"
                    style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {s === 1 ? t('play.step_game') : s === 2 ? t('play.step_mode') : t('play.step_difficulty')}
                  </span>
                </div>
                {s < 2 && <div className="w-10 h-px" style={{ backgroundColor: 'var(--color-border)' }} />}
                {s === 2 && <div className="w-10 h-px" style={{ backgroundColor: 'var(--color-border)' }} />}
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
                className="group relative overflow-hidden p-8 rounded-2xl text-left transition-all duration-300 hover:-translate-y-2 outline-none"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(168,85,247,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="absolute top-4 right-4 text-4xl opacity-10 group-hover:opacity-20 transition-opacity select-none">🏓</div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-3xl"
                  style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>
                  🏓
                </div>
                <h2 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text-primary)' }}>Pong</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('play.pong_desc')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[t('play.pong_tag_online'), t('play.pong_tag_ai'), t('play.pong_tag_local')].map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(168,85,247,0.12)', color: '#c084fc' }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: '#a855f7' }}>
                  {t('play.select')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* TicTacToe card */}
              <button
                onClick={() => selectGame('tictactoe')}
                className="group relative overflow-hidden p-8 rounded-2xl text-left transition-all duration-300 hover:-translate-y-2 outline-none"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(6,182,212,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="absolute top-4 right-4 text-4xl opacity-10 group-hover:opacity-20 transition-opacity select-none">⭕</div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-3xl"
                  style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)' }}>
                  ⭕
                </div>
                <h2 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text-primary)' }}>Tic-Tac-Toe</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('play.ttt_desc')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[t('play.pong_tag_local')].map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(6,182,212,0.12)', color: '#22d3ee' }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: '#06b6d4' }}>
                  {t('play.select')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Choose Mode ── */}
        {step === 2 && game && (
          <div className={slideClass}>
            <div className="text-center mb-8">
              <div className="text-3xl mb-2">{game === 'pong' ? '🏓' : '⭕'}</div>
              <h1 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {t('play.choose_mode')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('play.how_play', { game: game === 'pong' ? t('home.game_pong') : t('home.game_ttt') })}
              </p>
            </div>

            <div className={cn('gap-4', game === 'pong' ? 'grid grid-cols-1 sm:grid-cols-3' : 'flex justify-center')}>
              {(game === 'pong' ? PONG_MODES : TTT_MODES).map((m) => (
                <button
                  key={m.id as string}
                  onClick={() => selectMode(m.id)}
                  className={cn('relative p-6 rounded-2xl text-center transition-all duration-200 outline-none hover:-translate-y-1', game === 'tictactoe' && 'max-w-xs w-full')}
                  style={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: mode === m.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    boxShadow: mode === m.id ? '0 0 24px rgba(168,85,247,0.2)' : 'none',
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
                  {m.id === 'ai' && (
                    <div className="mt-2 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {t('play.pick_difficulty_next')}
                    </div>
                  )}
                  {m.id === 'local' && game === 'pong' && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {t('play.local_controls')}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Launch button for non-AI modes */}
            {mode && mode !== 'ai' && (
              <div className="flex justify-center mt-8 gap-4">
                <button onClick={goBack} className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-150"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                  <ArrowLeft className="w-4 h-4" /> {t('play.back')}
                </button>
                <button
                  onClick={launch}
                  disabled={!canLaunch}
                  className="group px-10 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', boxShadow: '0 4px 20px rgba(168,85,247,0.35)' }}>
                  <Gamepad2 className="w-5 h-5" />
                  {t('play.play_now')}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
                  <ArrowLeft className="w-4 h-4" /> {t('play.back')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 — Choose Difficulty (AI only) ── */}
        {step === 3 && (
          <div className={slideClass}>
            <div className="text-center mb-8">
              <div className="text-3xl mb-2">🤖</div>
              <h1 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {t('play.choose_difficulty')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('play.difficulty_locked')}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {DIFFICULTIES.map((d) => {
                const meta = DIFF_META[d];
                const selected = difficulty === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className="p-5 rounded-2xl text-center transition-all duration-200 outline-none hover:-translate-y-1"
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: selected ? `2px solid ${meta.color}` : '1px solid var(--color-border)',
                      boxShadow: selected ? `0 0 20px ${meta.color}30` : 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = meta.color; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  >
                    <div className="text-2xl mb-2">
                      {d === 'easy' ? '😊' : d === 'medium' ? '😐' : '😤'}
                    </div>
                    <h3 className="text-sm font-bold mb-1" style={{ color: meta.color }}>{meta.label}</h3>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{meta.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={goBack} className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-150"
                style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                <ArrowLeft className="w-4 h-4" /> {t('play.back')}
              </button>
              <button
                onClick={launch}
                className="group px-10 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-all duration-200 hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', boxShadow: '0 4px 20px rgba(168,85,247,0.35)' }}>
                <Gamepad2 className="w-5 h-5" />
                {t('play.start_game')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
