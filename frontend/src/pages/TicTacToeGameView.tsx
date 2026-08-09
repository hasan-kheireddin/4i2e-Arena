import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import {
  getOpponentSymbol,
  isRecoveringSocketStatus,
  type CellValue,
  type GameResult,
  type LocalPlayerNames,
  type LocalScores,
  type Mode,
  type OnlinePhase,
} from './TicTacToeGameShared';

export interface TicTacToeGameViewProps {
  mode: Mode;
  displayBoard: CellValue[];
  displayWinner: GameResult;
  displayLine: number[] | null;
  scores: LocalScores;
  localPlayerNames: LocalPlayerNames;
  localNamesReady: boolean;
  isXTurn: boolean;
  mySymbol: 'X' | 'O' | null;
  opponentName: string;
  onlinePhase: OnlinePhase;
  onlineWinner: GameResult;
  iReady: boolean;
  opponentReady: boolean;
  gamePaused: boolean;
  gameSocketStatus: string;
  isMyTurn: boolean;
  showRealtimeRecoveryOverlay: boolean;
  opponentLeftMsg: string | null;
  onDismissOpponentLeft: () => void;
  onLocalPlayerNamesChange: (names: LocalPlayerNames) => void;
  onStartLocalGame: () => void;
  onReady: () => void;
  onCancelOnline: () => void;
  onCellClick: (index: number) => void;
  onResetGame: () => void;
  onPlayAgainOnline: () => void;
  onBackToGames: () => void;
}

function getLocalLabels(
  localPlayerNames: LocalPlayerNames,
  t: TFunction,
) {
  return {
    p1: localPlayerNames.p1.trim() || t('ttt.player1'),
    p2: localPlayerNames.p2.trim() || t('ttt.player2'),
  };
}

function getStatusLabel(
  props: TicTacToeGameViewProps,
  t: TFunction,
): string {
  if (props.mode === 'local') {
    return props.displayWinner ? t('ttt.game_over') : t('ttt.live');
  }
  if (isRecoveringSocketStatus(props.gameSocketStatus)) {
    return t('ttt.reconnecting');
  }
  if (props.gamePaused) return t('ttt.paused');
  if (props.onlinePhase === 'playing') return t('ttt.live');
  if (props.onlinePhase === 'waiting') return t('ttt.waiting_opponent');
  if (props.onlinePhase === 'searching') return t('ttt.searching');
  if (props.onlinePhase === 'game_over') return t('ttt.game_over');
  return t('ttt.mode_online');
}

function isPrimaryTurn(props: TicTacToeGameViewProps): boolean {
  if (props.mode === 'local') return props.isXTurn && !props.displayWinner;
  return props.isMyTurn && props.onlinePhase === 'playing';
}

function isSecondaryTurn(props: TicTacToeGameViewProps): boolean {
  if (props.mode === 'local') return !props.isXTurn && !props.displayWinner;
  return !props.isMyTurn && props.onlinePhase === 'playing';
}

function isBoardCellDisabled(
  props: TicTacToeGameViewProps,
  cell: CellValue,
): boolean {
  if (props.mode === 'online') {
    return Boolean(cell) || !props.isMyTurn || props.onlinePhase !== 'playing';
  }
  return Boolean(cell) || Boolean(props.displayWinner);
}

function getCellColor(
  props: TicTacToeGameViewProps,
  cell: Exclude<CellValue, null>,
): string {
  if (props.mode !== 'online') return cell === 'X' ? '#3B82F6' : '#EF4444';
  if (cell === props.mySymbol) return '#3B82F6';
  return '#EF4444';
}

function OpponentLeftOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  if (!props.opponentLeftMsg) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div className="rounded-xl p-8 max-w-sm w-full text-center space-y-4 mx-4"
        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <p className="text-2xl">🚪</p>
        <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('ttt.opponent_left', { name: props.opponentLeftMsg })}
        </p>
        <button
          onClick={() => {
            props.onDismissOpponentLeft();
            props.onBackToGames();
          }}
          className="px-6 py-2 rounded-lg font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
          {t('ttt.back_to_games')}
        </button>
      </div>
    </div>
  );
}

function PageHeader({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  return (
    <div className="text-center">
      <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.title')}
      </h1>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
        {mode === 'online' ? t('ttt.subtitle_online') : t('ttt.subtitle_local')}
      </p>
    </div>
  );
}

function TicTacToeHud({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const labels = getLocalLabels(props.localPlayerNames, t);
  const primaryLabel = props.mode === 'online' ? t('ttt.you') : labels.p1;
  const secondaryLabel = props.mode === 'online' ? props.opponentName : labels.p2;

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3">
        <Avatar name={primaryLabel} size="sm" />
        <div>
          <span className="text-sm font-semibold" style={{ color: '#3B82F6' }}>
            {primaryLabel}
          </span>
          <span className="text-xs font-bold" style={{ color: '#3B82F6', marginInlineStart: '0.5rem' }}>
            ({props.mode === 'online' ? props.mySymbol ?? '?' : 'X'})
          </span>
        </div>
        {isPrimaryTurn(props) && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#3B82F6' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
            {t('ttt.your_turn')}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--color-success)' }} />
          {getStatusLabel(props, t)}
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {props.mode === 'online' ? t('ttt.mode_online') : t('ttt.mode_local')}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isSecondaryTurn(props) && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#EF4444' }} />
            {props.mode === 'online' ? t('ttt.opponent_turn') : t('ttt.your_turn')}
          </span>
        )}
        <div>
          <span className="text-sm font-semibold" style={{ color: '#EF4444' }}>
            {secondaryLabel}
          </span>
          <span className="text-xs font-bold" style={{ color: '#EF4444', marginInlineStart: '0.5rem' }}>
            ({props.mode === 'online' ? getOpponentSymbol(props.mySymbol) : 'O'})
          </span>
        </div>
        <Avatar name={secondaryLabel} size="sm" />
      </div>
    </div>
  );
}

function LocalNameSetup({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const namesComplete = Boolean(
    props.localPlayerNames.p1.trim() && props.localPlayerNames.p2.trim(),
  );

  if (props.mode !== 'local' || props.localNamesReady) return null;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 rounded-xl px-6"
      style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}
    >
      <p className="text-xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.local_name_setup_title')}
      </p>
      <div className="w-full max-w-sm space-y-3">
        <input
          value={props.localPlayerNames.p1}
          onChange={(event) => props.onLocalPlayerNamesChange({
            ...props.localPlayerNames,
            p1: event.target.value,
          })}
          placeholder={t('ttt.local_player1_name')}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <input
          value={props.localPlayerNames.p2}
          onChange={(event) => props.onLocalPlayerNamesChange({
            ...props.localPlayerNames,
            p2: event.target.value,
          })}
          placeholder={t('ttt.local_player2_name')}
          className="w-full rounded-lg px-4 py-2 text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>
      <button
        onClick={props.onStartLocalGame}
        disabled={!namesComplete}
        className="px-8 py-3 rounded-lg font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}
      >
        {t('ttt.start_local_match')}
      </button>
    </div>
  );
}

function OnlineWaitingOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
      style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
      <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.vs_opponent', { name: props.opponentName })}
      </p>

      <div className="flex gap-8 text-sm">
        <span style={{ color: props.iReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
          {props.iReady ? t('ttt.you_ready') : t('ttt.you_not_ready')}
        </span>
        <span style={{ color: props.opponentReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
          {props.opponentReady
            ? t('ttt.opponent_ready_status', { name: props.opponentName })
            : t('ttt.opponent_not_ready', { name: props.opponentName })}
        </span>
      </div>

      {!props.iReady ? (
        <button
          onClick={props.onReady}
          className="px-10 py-3 rounded-lg font-bold text-white text-lg"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
        >
          {t('ttt.ready')}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {props.opponentReady ? t('ttt.starting') : t('ttt.waiting_opponent')}
          </p>
        </div>
      )}

      <button
        onClick={props.onCancelOnline}
        className="text-sm px-5 py-2 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
        {t('ttt.exit')}
      </button>
    </div>
  );
}

function OnlinePhaseOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  if (props.mode !== 'online') return null;

  if (props.onlinePhase === 'waiting') {
    return <OnlineWaitingOverlay props={props} />;
  }
  if (props.onlinePhase !== 'searching') return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
      style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
      <div className="w-12 h-12 rounded-full border-4 animate-spin"
        style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.searching')}
      </p>
      <button
        onClick={props.onCancelOnline}
        className="text-sm px-5 py-2 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
        {t('ttt.cancel')}
      </button>
    </div>
  );
}

function RealtimeRecoveryOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  if (!props.showRealtimeRecoveryOverlay) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 rounded-xl"
      style={{ backgroundColor: 'rgba(10,14,26,0.82)', backdropFilter: 'blur(8px)' }}>
      <div className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.reconnecting_players')}
      </p>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {t('ttt.reconnecting_resume')}
      </p>
    </div>
  );
}

function GameBoard({ props }: { props: TicTacToeGameViewProps }) {
  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-xs aspect-square">
      {props.displayBoard.map((cell, index) => {
        const isWinCell = props.displayLine?.includes(index);
        const isDisabled = isBoardCellDisabled(props, cell);

        return (
          <button
            key={index}
            onClick={() => props.onCellClick(index)}
            disabled={isDisabled}
            className={cn(
              'aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none',
              !isDisabled && 'cursor-pointer',
              isDisabled && 'cursor-default',
            )}
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              boxShadow: isWinCell ? '0 0 20px rgba(249,115,22,0.35)' : 'none',
              transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
            }}
            onMouseEnter={(event) => {
              if (!isDisabled) {
                event.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                event.currentTarget.style.borderColor = 'var(--color-primary)';
              }
            }}
            onMouseLeave={(event) => {
              if (!isDisabled) {
                event.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                event.currentTarget.style.borderColor = 'var(--color-border)';
              }
            }}
          >
            {cell === 'X' && (
              <span className="text-4xl font-bold" style={{ color: getCellColor(props, 'X') }}>X</span>
            )}
            {cell === 'O' && (
              <span className="text-4xl font-bold leading-none" style={{ color: getCellColor(props, 'O') }}>O</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GameOverSection({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const labels = getLocalLabels(props.localPlayerNames, t);

  if (props.mode === 'local' && props.displayWinner) {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-extrabold"
          style={{ color: props.displayWinner === 'X' ? '#3B82F6' : props.displayWinner === 'O' ? '#EF4444' : '#fbbf24' }}>
          {props.displayWinner === 'draw'
            ? t('ttt.draw_result')
            : t('ttt.local_player_wins', {
              name: props.displayWinner === 'X' ? labels.p1 : labels.p2,
            })}
        </h2>
        <div className="flex gap-3 justify-center">
          <button
            onClick={props.onResetGame}
            className="px-6 py-2 rounded-lg font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
            {t('ttt.play_again')}
          </button>
          <button
            onClick={props.onBackToGames}
            className="px-6 py-2 rounded-lg font-medium"
            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
            {t('ttt.back_to_games')}
          </button>
        </div>
      </div>
    );
  }

  if (props.mode !== 'online' || props.onlinePhase !== 'game_over') return null;

  return (
    <div className="text-center space-y-3">
      <h2 className="text-2xl font-extrabold"
        style={{
          color: props.onlineWinner === 'draw'
            ? '#fbbf24'
            : props.onlineWinner === props.mySymbol
              ? '#3B82F6'
              : '#EF4444',
        }}>
        {props.onlineWinner === 'draw'
          ? t('ttt.draw_result')
          : props.onlineWinner === props.mySymbol
            ? t('ttt.you_win')
            : t('ttt.you_lose')}
      </h2>
      <div className="flex gap-3 justify-center">
        <button
          onClick={props.onPlayAgainOnline}
          className="px-6 py-2 rounded-lg font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
          {t('ttt.play_again')}
        </button>
        <button
          onClick={props.onBackToGames}
          className="px-6 py-2 rounded-lg font-medium"
          style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
          {t('ttt.back_to_games')}
        </button>
      </div>
    </div>
  );
}

function Arena({ props }: { props: TicTacToeGameViewProps }) {
  return (
    <div className="flex flex-col items-center gap-6 relative">
      <LocalNameSetup props={props} />
      <OnlinePhaseOverlay props={props} />
      <RealtimeRecoveryOverlay props={props} />
      <GameBoard props={props} />
      <GameOverSection props={props} />
    </div>
  );
}

function PlayerCards({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const labels = getLocalLabels(props.localPlayerNames, t);
  const primaryLabel = props.mode === 'online' ? t('ttt.you') : labels.p1;
  const secondaryLabel = props.mode === 'online' ? props.opponentName : labels.p2;

  return (
    <>
      <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          border: isPrimaryTurn(props) ? '2px solid #3B82F6' : '1px solid var(--color-border)',
          boxShadow: isPrimaryTurn(props) ? '0 0 20px rgba(59,130,246,0.25)' : 'none',
          opacity: isPrimaryTurn(props) ? 1 : 0.65,
        }}>
        <Avatar name={primaryLabel} size="md" />
        <div>
          <p className="text-sm font-bold" style={{ color: '#3B82F6' }}>
            {primaryLabel} ({props.mode === 'online' ? props.mySymbol ?? '?' : 'X'})
          </p>
          {props.mode === 'local' && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('ttt.wins_count', { count: props.scores.X })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          border: isSecondaryTurn(props) ? '2px solid #EF4444' : '1px solid var(--color-border)',
          boxShadow: isSecondaryTurn(props) ? '0 0 20px rgba(239,68,68,0.25)' : 'none',
          opacity: isSecondaryTurn(props) ? 1 : 0.65,
        }}>
        <Avatar name={secondaryLabel} size="md" />
        <div>
          <p className="text-sm font-bold" style={{ color: '#EF4444' }}>
            {secondaryLabel} ({props.mode === 'online' ? getOpponentSymbol(props.mySymbol) : 'O'})
          </p>
          {props.mode === 'local' && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('ttt.wins_count', { count: props.scores.O })}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function OnlineStatusPanel({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  if (props.mode !== 'online' || props.onlinePhase !== 'playing') return null;

  return (
    <div className="p-4 rounded-lg"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.game_status')}
      </h3>
      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {props.isMyTurn ? t('ttt.your_turn_status') : t('ttt.waiting_for', { name: props.opponentName })}
      </p>
    </div>
  );
}

function SidePanel({ props }: { props: TicTacToeGameViewProps }) {
  return (
    <div className="space-y-4">
      <PlayerCards props={props} />
      <OnlineStatusPanel props={props} />
    </div>
  );
}

export default function TicTacToeGameView(props: TicTacToeGameViewProps) {
  return (
    <>
      <OpponentLeftOverlay props={props} />
      <div className="min-h-screen flex flex-col items-center justify-start p-6"
        style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="max-w-4xl w-full space-y-5">
          <PageHeader mode={props.mode} />
          <TicTacToeHud props={props} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <Arena props={props} />
            <SidePanel props={props} />
          </div>
        </div>
      </div>
    </>
  );
}
