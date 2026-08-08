import type { ComponentProps, RefObject } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import EmotePalette from '../components/Chat/EmotePalette';
import FloatingEmoteOverlay from '../components/Chat/FloatingEmote';

export type PongMode = 'local' | 'online';
export type PongOnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface Score {
  p1: number;
  p2: number;
}

interface LocalPlayerNames {
  p1: string;
  p2: string;
}

interface SpectatorCount {
  total: number;
  side1: number;
  side2: number;
}

export interface PongGameViewProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  mode: PongMode;
  onlinePhase: PongOnlinePhase;
  score: Score;
  onlineScore: Score;
  mySlot: number | null;
  opponentName: string;
  opponentLeft: boolean;
  onlineReason: string | null;
  onlineWinnerSlot: number | null;
  localPlayerNames: LocalPlayerNames;
  localNamesReady: boolean;
  gameOver: boolean;
  iReady: boolean;
  opponentReady: boolean;
  gamePaused: boolean;
  gameSocketStatus: string;
  spectatorCount: SpectatorCount;
  showEmotePalette: boolean;
  floatingEmotes: ComponentProps<typeof FloatingEmoteOverlay>['emotes'];
  isLocalPaused: boolean;
  onLocalPlayerNamesChange: (names: LocalPlayerNames) => void;
  onStartLocalGame: () => void;
  onFindMatch: () => void;
  onCancelOnline: () => void;
  onReady: () => void;
  onResetGame: () => void;
  onBackToGames: () => void;
  onToggleLocalPause: () => void;
  onForfeit: () => void;
  onEmote: ComponentProps<typeof EmotePalette>['onEmote'];
}

function isRecovering(socketStatus: string): boolean {
  return socketStatus === 'reconnecting' || socketStatus === 'connecting';
}

function getOnlinePhaseLabel(
  phase: PongOnlinePhase,
  t: TFunction,
): string {
  if (phase === 'matchmaking') return t('pong.searching');
  if (phase === 'waiting') return t('pong.waiting_opponent');
  if (phase === 'playing') return t('pong.live');
  if (phase === 'over') return t('pong.phase_over');
  return t('pong.phase_idle');
}

function getModeLabel(
  mode: PongMode,
  t: TFunction,
): string {
  if (mode === 'online') return t('pong.mode_online');
  return t('pong.mode_local');
}

function getHudStatusLabel(
  props: PongGameViewProps,
  t: TFunction,
): string {
  if (props.mode !== 'online') return t('pong.live');
  if (isRecovering(props.gameSocketStatus)) return t('pong.reconnecting');
  if (props.gamePaused) return t('pong.paused');
  return getOnlinePhaseLabel(props.onlinePhase, t);
}

function getDisplayScores(props: PongGameViewProps): Score {
  if (props.mode !== 'online') return props.score;
  if (props.mySlot === 2) {
    return { p1: props.onlineScore.p2, p2: props.onlineScore.p1 };
  }
  return props.onlineScore;
}

function getDisplayLabels(
  props: PongGameViewProps,
  t: TFunction,
): LocalPlayerNames {
  const playerOne = props.localPlayerNames.p1.trim() || t('pong.player1');
  const playerTwo = props.localPlayerNames.p2.trim() || t('pong.player2');

  if (props.mode === 'online') {
    return {
      p1: t('pong.you'),
      p2: props.opponentName || t('pong.opponent'),
    };
  }
  return { p1: playerOne, p2: playerTwo };
}

function PongHud({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  const scores = getDisplayScores(props);
  const labels = getDisplayLabels(props, t);

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3">
        <Avatar name={labels.p1} size="sm" />
        <span className="text-sm font-medium hidden sm:block" style={{ color: '#3B82F6' }}>{labels.p1}</span>
        <span className="text-2xl font-bold font-mono" style={{ color: '#3B82F6' }}>{scores.p1}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--color-success)' }} />
          {getHudStatusLabel(props, t)}
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {getModeLabel(props.mode, t)}
        </span>
        {props.mode === 'online' && (
          <span className="text-[10px] font-medium flex items-center gap-1.5"
            style={{ color: 'var(--color-text-muted)' }}>
            Spectators <span style={{ color: '#3B82F6' }}>{props.spectatorCount.side1}</span>
            <span>/</span>
            <span style={{ color: '#EF4444' }}>{props.spectatorCount.side2}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold font-mono" style={{ color: '#EF4444' }}>{scores.p2}</span>
        <span className="text-sm font-medium hidden sm:block" style={{ color: '#EF4444' }}>{labels.p2}</span>
        <Avatar name={labels.p2} size="sm" />
      </div>
    </div>
  );
}

function LocalNameSetup({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  const namesComplete = Boolean(
    props.localPlayerNames.p1.trim() && props.localPlayerNames.p2.trim(),
  );

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6"
      style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
      <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
        {t('pong.local_name_setup_title')}
      </h2>
      <div className="w-full max-w-sm space-y-3">
        <input
          value={props.localPlayerNames.p1}
          onChange={(event) => props.onLocalPlayerNamesChange({
            ...props.localPlayerNames,
            p1: event.target.value,
          })}
          placeholder={t('pong.local_player1_name')}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <input
          value={props.localPlayerNames.p2}
          onChange={(event) => props.onLocalPlayerNamesChange({
            ...props.localPlayerNames,
            p2: event.target.value,
          })}
          placeholder={t('pong.local_player2_name')}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>
      <button
        onClick={props.onStartLocalGame}
        disabled={!namesComplete}
        className="px-8 py-3 rounded-lg font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}
      >
        {t('pong.start_local_match')}
      </button>
    </div>
  );
}

function OnlineWaitingOverlay({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
      style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
      {props.iReady ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {props.opponentReady ? t('pong.starting') : t('pong.waiting_opponent')}
          </p>
        </div>
      ) : (
        <button onClick={props.onReady}
          className="px-10 py-3 rounded-lg font-bold text-white text-lg"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
          {t('pong.ready')}
        </button>
      )}
      <button onClick={props.onCancelOnline} className="text-sm px-5 py-2 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
        {t('pong.exit')}
      </button>
    </div>
  );
}

function OnlinePhaseOverlay({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  if (props.mode !== 'online') return null;
  if (props.onlinePhase === 'waiting') return <OnlineWaitingOverlay props={props} />;
  if (props.onlinePhase === 'idle') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
        style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.title')}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.subtitle')}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={props.onBackToGames} className="px-6 py-3 rounded-lg font-medium"
            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
            {t('pong.back_to_games')}
          </button>
          <button onClick={props.onFindMatch} className="px-8 py-3 rounded-lg font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
            {t('pong.find_match')}
          </button>
        </div>
      </div>
    );
  }
  if (props.onlinePhase === 'matchmaking') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
        style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
        <div className="w-12 h-12 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.searching')}</p>
        <button onClick={props.onCancelOnline} className="text-sm px-5 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          {t('pong.cancel')}
        </button>
      </div>
    );
  }
  return null;
}

function GameOverOverlay({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  const displayScore = getDisplayScores(props);
  const playerWon = props.score.p1 >= 7;

  if (props.mode === 'online') {
    if (props.onlinePhase !== 'over') return null;
    const iWon = props.onlineWinnerSlot !== null && props.onlineWinnerSlot === props.mySlot;
    const disconnected = props.onlineReason === 'disconnect_forfeit' || props.opponentLeft;
    return (
      <GameOverPanel
        title={iWon ? t('pong.you_win') : t('pong.you_lose')}
        winner={iWon}
        score={displayScore}
        detail={disconnected
          ? t('pong.opponent_disconnected')
          : props.onlineReason === 'forfeit'
            ? t('pong.opponent_forfeited')
            : null}
        onPlayAgain={props.onFindMatch}
        onBack={props.onBackToGames}
      />
    );
  }

  if (!props.gameOver) return null;
  const winnerName = playerWon
    ? props.localPlayerNames.p1.trim() || t('pong.player1')
    : props.localPlayerNames.p2.trim() || t('pong.player2');
  return (
    <GameOverPanel
      title={t('pong.local_player_wins', { name: winnerName })}
      winner={playerWon}
      score={props.score}
      onPlayAgain={props.onResetGame}
      onBack={props.onBackToGames}
    />
  );
}

function GameOverPanel({
  title,
  winner,
  score,
  detail,
  onPlayAgain,
  onBack,
}: {
  title: string;
  winner: boolean;
  score: Score;
  detail?: string | null;
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}>
      <h2 className="text-5xl font-extrabold" style={{ color: winner ? '#3B82F6' : '#EF4444' }}>
        {title}
      </h2>
      <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {score.p1} - {score.p2}
      </p>
      {detail && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{detail}</p>}
      <div className="flex gap-3 mt-2">
        <button onClick={onPlayAgain} className="px-6 py-2 rounded-lg font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}>
          {t('pong.play_again')}
        </button>
        <button onClick={onBack} className="px-6 py-2 rounded-lg font-medium"
          style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
          {t('pong.back_to_games')}
        </button>
      </div>
    </div>
  );
}

function ConnectionOverlays({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  const showOpponentLeft = props.mode === 'online'
    && props.opponentLeft
    && props.onlinePhase !== 'over';
  const showRecovery = props.mode === 'online'
    && props.onlinePhase === 'playing'
    && (props.gamePaused || isRecovering(props.gameSocketStatus));

  return (
    <>
      {showOpponentLeft && (
        <div className="absolute top-4 inset-x-4 flex items-center justify-center">
          <div className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {t('pong.opponent_disconnected')}
          </div>
        </div>
      )}
      {showRecovery && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: 'rgba(10,14,26,0.72)', backdropFilter: 'blur(6px)' }}>
          <div className="w-10 h-10 rounded-full border-4 animate-spin"
            style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
          <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('pong.reconnecting_players')}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('pong.reconnecting_resume')}
          </p>
        </div>
      )}
    </>
  );
}

function PongArena({ props }: { props: PongGameViewProps }) {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      <canvas ref={props.canvasRef} width={800} height={387} className="w-full"
        style={{ backgroundColor: '#0a0e1a', aspectRatio: '800/387' }} />
      {props.mode === 'local' && !props.localNamesReady && <LocalNameSetup props={props} />}
      <OnlinePhaseOverlay props={props} />
      <ConnectionOverlays props={props} />
      <GameOverOverlay props={props} />
      <FloatingEmoteOverlay
        emotes={props.floatingEmotes}
        flipped={props.mode === 'online' && props.mySlot === 2}
      />
      {props.mode === 'online' && props.showEmotePalette && (
        <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-4">
          <EmotePalette onEmote={props.onEmote} />
        </div>
      )}
    </div>
  );
}

function PongControls({ props }: { props: PongGameViewProps }) {
  const { t } = useTranslation();
  const showLocalActions = props.mode !== 'online'
    && !props.gameOver
    && props.localNamesReady;
  const showForfeit = props.mode === 'online' && props.onlinePhase === 'playing';

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-2.5"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {props.mode === 'local' ? (
          <>
            <span>
              <span className="font-bold" style={{ color: '#3B82F6' }}>
                {props.localPlayerNames.p1.trim() || t('pong.player1_short')}
              </span>{' '}
              {t('pong.controls_p1')}
            </span>
            <span className="opacity-30">|</span>
            <span>
              <span className="font-bold" style={{ color: '#EF4444' }}>
                {props.localPlayerNames.p2.trim() || t('pong.player2_short')}
              </span>{' '}
              {t('pong.controls_p2')}
            </span>
          </>
        ) : (
          <span>{t('pong.controls_shared')}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showLocalActions && (
          <>
            <button onClick={props.onToggleLocalPause}
              className="px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
              {props.isLocalPaused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={props.onBackToGames}
              className="px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              {t('pong.exit')}
            </button>
          </>
        )}
        {showForfeit && (
          <button onClick={props.onForfeit}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {t('pong.forfeit')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PongGameView(props: PongGameViewProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-[54rem] w-full space-y-4">
        <PongHud props={props} />
        <PongArena props={props} />
        <PongControls props={props} />
      </div>
    </div>
  );
}
