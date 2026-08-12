import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../context/AuthContext';
import { TicTacToeIcon } from '../components/icons/GameIcons';
import EmotePalette from '../components/Chat/EmotePalette';
import FloatingEmoteOverlay, { type FloatingEmoteData } from '../components/Chat/FloatingEmote';
import { cn } from '../lib/utils';
import {
  playLocalPlaceSound,
  playPlaceSound,
  playResultSound,
  playTurnSound,
} from './ticTacToeSounds';
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
  gameOverReason: string | null;
  iReady: boolean;
  opponentReady: boolean;
  gamePaused: boolean;
  gameSocketStatus: string;
  isMyTurn: boolean;
  showRealtimeRecoveryOverlay: boolean;
  opponentLeftMsg: string | null;
  floatingEmotes: FloatingEmoteData[];
  showEmotePalette: boolean;
  onDismissOpponentLeft: () => void;
  onLocalPlayerNamesChange: (names: LocalPlayerNames) => void;
  onStartLocalGame: () => void;
  onReady: () => void;
  onCancelOnline: () => void;
  onCellClick: (index: number) => void;
  onResetGame: () => void;
  onPlayAgainOnline: () => void;
  onBackToGames: () => void;
  onForfeit: () => void;
  onToggleEmotePalette: () => void;
  onSendEmote: (emoteId: string) => void;
}

/**
 * Both seats are drawn from the brand palette rather than the old hard-coded
 * blue/red: primary orange for the near player, info cyan for the far one. They
 * stay far enough apart to read at a glance and both follow the active theme.
 */
const NEAR = { color: 'var(--color-primary)', rgb: 'var(--color-primary-rgb)' };
const FAR = { color: 'var(--color-info)', rgb: 'var(--color-info-rgb)' };

interface Seat {
  name: string;
  symbol: 'X' | 'O' | '?';
  color: string;
  rgb: string;
  isTurn: boolean;
  /** Local play tracks a running score; online matches do not. */
  wins: number | null;
  isYou: boolean;
}

function getLocalLabels(localPlayerNames: LocalPlayerNames, t: TFunction) {
  return {
    p1: localPlayerNames.p1.trim() || t('ttt.player1'),
    p2: localPlayerNames.p2.trim() || t('ttt.player2'),
  };
}

function getSeats(props: TicTacToeGameViewProps, t: TFunction): [Seat, Seat] {
  if (props.mode === 'online') {
    const playing = props.onlinePhase === 'playing';
    return [
      {
        name: t('ttt.you'),
        symbol: props.mySymbol ?? '?',
        ...NEAR,
        isTurn: playing && props.isMyTurn,
        wins: null,
        isYou: true,
      },
      {
        name: props.opponentName,
        symbol: getOpponentSymbol(props.mySymbol),
        ...FAR,
        isTurn: playing && !props.isMyTurn,
        wins: null,
        isYou: false,
      },
    ];
  }

  const labels = getLocalLabels(props.localPlayerNames, t);
  const live = props.localNamesReady && !props.displayWinner;
  return [
    {
      name: labels.p1,
      symbol: 'X',
      ...NEAR,
      isTurn: live && props.isXTurn,
      wins: props.scores.X,
      isYou: false,
    },
    {
      name: labels.p2,
      symbol: 'O',
      ...FAR,
      isTurn: live && !props.isXTurn,
      wins: props.scores.O,
      isYou: false,
    },
  ];
}

function getStatusLabel(props: TicTacToeGameViewProps, t: TFunction): string {
  if (props.mode === 'local') {
    return props.displayWinner ? t('ttt.game_over') : t('ttt.live');
  }
  if (isRecoveringSocketStatus(props.gameSocketStatus)) return t('ttt.reconnecting');
  if (props.gamePaused) return t('ttt.paused');
  if (props.onlinePhase === 'playing') return t('ttt.live');
  if (props.onlinePhase === 'searching') return t('ttt.searching');
  if (props.onlinePhase === 'game_over') return t('ttt.game_over');
  // idle and waiting already own the screen with a full overlay.
  return '';
}

function isBoardCellDisabled(props: TicTacToeGameViewProps, cell: CellValue): boolean {
  if (props.mode === 'online') {
    return Boolean(cell) || !props.isMyTurn || props.onlinePhase !== 'playing';
  }
  return Boolean(cell) || Boolean(props.displayWinner) || !props.localNamesReady;
}

function seatForSymbol(seats: [Seat, Seat], symbol: Exclude<CellValue, null>): Seat {
  return seats[0].symbol === symbol ? seats[0] : seats[1];
}

/* ───────────────────────── marks ───────────────────────── */

/**
 * Drawn as strokes rather than typed as letters: a glyph cannot animate on, and
 * a real X/O reads far better at board size than a font's rendering of them.
 */
function MarkX({ color, animate, className }: { color: string; animate: boolean; className: string }) {
  const line = 'ttt-stroke';
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <line
        x1="22" y1="22" x2="78" y2="78"
        stroke={color} strokeWidth="13" strokeLinecap="round"
        className={animate ? line : undefined}
        style={{ '--ttt-len': 80 } as React.CSSProperties}
      />
      <line
        x1="78" y1="22" x2="22" y2="78"
        stroke={color} strokeWidth="13" strokeLinecap="round"
        className={animate ? `${line} ttt-stroke-delayed` : undefined}
        style={{ '--ttt-len': 80 } as React.CSSProperties}
      />
    </svg>
  );
}

function MarkO({ color, animate, className }: { color: string; animate: boolean; className: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle
        cx="50" cy="50" r="28" fill="none"
        stroke={color} strokeWidth="13" strokeLinecap="round"
        transform="rotate(-90 50 50)"
        className={animate ? 'ttt-stroke' : undefined}
        style={{ '--ttt-len': 176 } as React.CSSProperties}
      />
    </svg>
  );
}

/**
 * `block` matters: an inline SVG sits on the text baseline, which left the
 * marks riding a couple of pixels high inside the seat badges.
 */
function Mark({
  symbol, color, animate, size = 'w-3/5 h-3/5',
}: {
  symbol: Exclude<CellValue, null>;
  color: string;
  animate: boolean;
  size?: string;
}) {
  const className = `${size} block`;
  return symbol === 'X'
    ? <MarkX color={color} animate={animate} className={className} />
    : <MarkO color={color} animate={animate} className={className} />;
}

/* ───────────────────────── player seats ───────────────────────── */

function SeatCard({ seat, compact }: { seat: Seat; compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-col items-center">
      {/* Caret rides above whoever is on the clock, the way the turn indicator
          reads in a physical game: you look up and see who is being waited on. */}
      <div className="h-5 flex items-end justify-center">
        {seat.isTurn && (
          <svg width="18" height="11" viewBox="0 0 18 11" className="ttt-caret" aria-hidden="true">
            <path d="M9 11 L0 0 L18 0 Z" fill={seat.color} />
          </svg>
        )}
      </div>

      <div className="relative w-full">
        {seat.isTurn && (
          <div
            className="absolute -inset-1 rounded-2xl ttt-active-glow pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 40%, rgb(${seat.rgb} / 0.32), transparent 72%)` }}
          />
        )}
        <div
          className={cn(
            'relative flex flex-col items-center gap-2.5 rounded-2xl transition-all duration-300',
            compact ? 'px-3 py-4' : 'px-5 py-7',
          )}
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: seat.isTurn
              ? `2px solid rgb(${seat.rgb})`
              : '1px solid var(--color-border)',
            boxShadow: seat.isTurn
              ? `0 18px 40px -22px rgb(${seat.rgb} / 0.9), inset 0 1px 0 rgb(255 255 255 / 0.04)`
              : 'inset 0 1px 0 rgb(255 255 255 / 0.03)',
            transform: seat.isTurn ? 'translateY(-2px)' : 'none',
            opacity: seat.isTurn ? 1 : 0.72,
          }}
        >
          <div className="relative">
            <Avatar name={seat.name} size={compact ? 'lg' : 'xl'} />
            <span
              className={cn(
                'absolute rounded-full flex items-center justify-center',
                compact ? 'w-6 h-6' : 'w-7 h-7',
              )}
              style={{
                bottom: '-0.25rem',
                insetInlineEnd: '-0.25rem',
                backgroundColor: 'var(--color-bg-card)',
                border: `2px solid rgb(${seat.rgb})`,
              }}
            >
              {seat.symbol === '?'
                ? <span className="text-[10px] font-bold" style={{ color: seat.color }}>?</span>
                : <Mark symbol={seat.symbol} color={seat.color} animate={false} />}
            </span>
          </div>

          <p
            className={cn('font-bold text-center leading-tight break-words max-w-full', compact ? 'text-[14px]' : 'text-[17px]')}
            style={{ color: 'var(--color-text-primary)' }}
            title={seat.name}
          >
            {seat.name}
          </p>

          {seat.wins !== null && (
            <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              {t('ttt.wins_count', { count: seat.wins })}
            </p>
          )}
        </div>
      </div>

      {/* Label under the card, matching the caret above it. */}
      <div className="h-7 flex items-center justify-center">
        {seat.isTurn && (
          <span className="text-[13px] font-extrabold tracking-wide" style={{ color: seat.color }}>
            {seat.isYou ? t('ttt.your_turn') : t('ttt.turn_of', { name: seat.name })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── overlays ───────────────────────── */

function OpponentLeftOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  if (!props.opponentLeftMsg) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div className="rounded-2xl p-8 max-w-sm w-full text-center space-y-4 mx-4 ttt-result-in"
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
          className="px-6 py-2 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundImage: 'var(--gradient-brand)' }}>
          {t('ttt.back_to_games')}
        </button>
      </div>
    </div>
  );
}

function ForfeitConfirm({
  open, onCancel, onConfirm,
}: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
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
          {t('ttt.forfeit_confirm_title')}
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {t('ttt.forfeit_confirm_body')}
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
            {t('ttt.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-danger)' }}>
            {t('ttt.forfeit_confirm_yes')}
          </button>
        </div>
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
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 rounded-2xl px-6"
      style={{ backgroundColor: 'rgb(var(--color-background-rgb) / 0.94)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
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
        className="px-8 py-3 rounded-xl font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
        style={{ backgroundImage: 'var(--gradient-brand)' }}
      >
        {t('ttt.start_local_match')}
      </button>
    </div>
  );
}

/**
 * One row per player. `ttt.opponent_ready_status` / `ttt.opponent_not_ready` are
 * name-generic ("{{name}} is ready"), so they serve for the local player too
 * and no new translation keys are needed.
 */
function ReadyStatus({ name, ready }: { name: string; ready: boolean }) {
  const { t } = useTranslation();
  return (
    <span style={{ color: ready ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
      {ready
        ? t('ttt.opponent_ready_status', { name })
        : t('ttt.opponent_not_ready', { name })}
    </span>
  );
}

function OnlineWaitingOverlay({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myName = user?.display_name || user?.username || t('ttt.you');
  const opponentName = props.opponentName || t('ttt.opponent');

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-20 rounded-2xl px-4"
      style={{ backgroundColor: 'rgb(var(--color-background-rgb) / 0.94)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      {/* Interpolating the opponent into `vs {{name}}` keeps word order under the
          translator's control instead of hard-coding an English "A vs B". */}
      <p className="text-xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
        <span style={{ color: 'var(--color-primary)' }}>{myName}</span>
        {' '}{t('ttt.vs_opponent', { name: opponentName })}
      </p>

      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
        <ReadyStatus name={myName} ready={props.iReady} />
        <ReadyStatus name={opponentName} ready={props.opponentReady} />
      </div>

      {!props.iReady ? (
        <button
          onClick={props.onReady}
          className="px-10 py-3 rounded-xl font-bold text-white text-lg transition-transform hover:scale-[1.03] active:scale-95"
          style={{ backgroundColor: 'var(--color-success)' }}
        >
          {t('ttt.ready')}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          {props.opponentReady && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('ttt.starting')}
            </p>
          )}
        </div>
      )}

      <button
        onClick={props.onCancelOnline}
        className="text-sm px-5 py-2 rounded-lg transition-colors hover:bg-surface-hover"
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-20 rounded-2xl"
      style={{ backgroundColor: 'rgb(var(--color-background-rgb) / 0.94)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="w-12 h-12 rounded-full border-4 animate-spin"
        style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.searching')}
      </p>
      <button
        onClick={props.onCancelOnline}
        className="text-sm px-5 py-2 rounded-lg transition-colors hover:bg-surface-hover"
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20 rounded-2xl px-4"
      style={{ backgroundColor: 'rgb(var(--color-background-rgb) / 0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('ttt.reconnecting_players')}
      </p>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {t('ttt.reconnecting_resume')}
      </p>
    </div>
  );
}

/* ───────────────────────── board ───────────────────────── */

function GameBoard({ props, seats }: { props: TicTacToeGameViewProps; seats: [Seat, Seat] }) {
  // Hover lives in state rather than in imperative style writes: a cell that
  // gets disabled by the click that filled it never receives its mouse-leave,
  // so a hand-written style would stay stuck on that cell for every later game.
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  // Whoever is on the clock owns the ghost preview a hover paints.
  const activeSeat = seats[0].isTurn ? seats[0] : seats[1].isTurn ? seats[1] : null;

  return (
    // The square lives on the container, with three 1fr rows inside it, rather
    // than on each cell. Safari sizes an `aspect-ratio` grid *item* against the
    // row it is in, so per-cell squares grew the rows without bound and pushed
    // the last one clean out of the board.
    <div
      className="relative grid grid-cols-3 grid-rows-3 gap-2.5 w-full aspect-square rounded-2xl p-2.5"
      style={{
        backgroundColor: 'rgb(var(--color-primary-rgb) / 0.04)',
        border: '1px solid var(--color-border)',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
      }}
    >
      {props.displayBoard.map((cell, index) => {
        const isWinCell = Boolean(props.displayLine?.includes(index));
        const isDisabled = isBoardCellDisabled(props, cell);
        const isHovered = !isDisabled && hoveredCell === index;
        const winSeat = isWinCell && cell ? seatForSymbol(seats, cell) : null;

        return (
          <button
            key={index}
            onClick={() => props.onCellClick(index)}
            disabled={isDisabled}
            aria-label={`${index + 1}`}
            className={cn(
              'relative w-full h-full min-w-0 min-h-0 rounded-xl',
              'flex items-center justify-center outline-none',
              'transition-[background-color,border-color,transform] duration-200',
              !isDisabled && 'cursor-pointer hover:-translate-y-0.5',
              isDisabled && 'cursor-default',
              isWinCell && 'ttt-win-cell',
            )}
            style={{
              backgroundColor: isHovered ? 'var(--color-bg-hover)' : 'var(--color-bg-card)',
              border: isWinCell && winSeat
                ? `2px solid ${winSeat.color}`
                : `1px solid ${isHovered && activeSeat ? activeSeat.color : 'var(--color-border)'}`,
              ...(isWinCell && winSeat
                ? ({ '--ttt-win-rgb': winSeat.rgb } as React.CSSProperties)
                : {}),
            }}
            onMouseEnter={() => setHoveredCell(index)}
            onMouseLeave={() => setHoveredCell((current) => (current === index ? null : current))}
          >
            {cell && (
              <span className="w-full h-full flex items-center justify-center ttt-cell-land">
                <Mark symbol={cell} color={seatForSymbol(seats, cell).color} animate />
              </span>
            )}
            {/* A ghost of the mark you are about to place — the board answers
                before you commit, which is most of what makes it feel alive. */}
            {!cell && isHovered && activeSeat && activeSeat.symbol !== '?' && (
              <span className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
                <Mark symbol={activeSeat.symbol} color={activeSeat.color} animate={false} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── result ───────────────────────── */

function forfeitNote(reason: string | null, iWon: boolean, t: TFunction): string | null {
  if (reason !== 'forfeit' && reason !== 'disconnect_forfeit') return null;
  return iWon ? t('ttt.won_by_forfeit') : t('ttt.you_forfeited');
}

function ResultBanner({ props, seats }: { props: TicTacToeGameViewProps; seats: [Seat, Seat] }) {
  const { t } = useTranslation();

  const isLocalOver = props.mode === 'local' && Boolean(props.displayWinner);
  const isOnlineOver = props.mode === 'online' && props.onlinePhase === 'game_over';
  if (!isLocalOver && !isOnlineOver) return null;

  const winner = isOnlineOver ? props.onlineWinner : props.displayWinner;
  const isDraw = winner === 'draw';
  const iWon = isOnlineOver && winner === props.mySymbol;

  const accent = isDraw
    ? 'var(--color-warning)'
    : isOnlineOver
      ? (iWon ? 'var(--color-success)' : 'var(--color-danger)')
      : seatForSymbol(seats, winner as 'X' | 'O').color;

  const headline = isDraw
    ? t('ttt.draw_result')
    : isOnlineOver
      ? (iWon ? t('ttt.you_win') : t('ttt.you_lose'))
      : t('ttt.local_player_wins', { name: seatForSymbol(seats, winner as 'X' | 'O').name });

  const note = isOnlineOver && !isDraw
    ? forfeitNote(props.gameOverReason, iWon, t)
    : null;

  return (
    <div
      className="ttt-result-in w-full rounded-2xl px-5 py-4 text-center space-y-3"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: `1px solid ${accent}`,
        boxShadow: `0 20px 50px -30px ${accent}`,
      }}
    >
      <h2 className="text-2xl font-extrabold" style={{ color: accent }}>{headline}</h2>
      {note && (
        <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>{note}</p>
      )}
      <div className="flex gap-2.5 justify-center">
        <button
          onClick={isOnlineOver ? props.onPlayAgainOnline : props.onResetGame}
          className="px-6 py-2.5 rounded-xl font-bold text-white transition-transform hover:scale-[1.03] active:scale-95"
          style={{ backgroundImage: 'var(--gradient-brand)' }}>
          {t('ttt.play_again')}
        </button>
        <button
          onClick={props.onBackToGames}
          className="px-6 py-2.5 rounded-xl font-semibold transition-colors hover:bg-surface-hover"
          style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
          {t('ttt.back_to_games')}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── chrome ───────────────────────── */

function IconFlag({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function IconSmile({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function TopBar({ props }: { props: TicTacToeGameViewProps }) {
  const { t } = useTranslation();
  const statusLabel = getStatusLabel(props, t);

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2"
        style={{ color: 'var(--color-text-primary)' }}>
        <TicTacToeIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
        {t('ttt.title')}
      </h1>
      {statusLabel && (
        <span className="px-3 py-1.5 rounded-full text-[11.5px] font-bold flex items-center gap-1.5"
          style={{ backgroundColor: 'rgb(var(--color-success-rgb) / 0.12)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--color-success)' }} />
          {statusLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Emote and forfeit sit together under the board: both are things you do to the
 * match rather than moves within it.
 */
function ActionBar({
  props, onRequestForfeit,
}: { props: TicTacToeGameViewProps; onRequestForfeit: () => void }) {
  const { t } = useTranslation();

  const canEmote = props.mode === 'online'
    && (props.onlinePhase === 'playing' || props.onlinePhase === 'game_over');
  const canForfeit = props.mode === 'online' && props.onlinePhase === 'playing';
  const canExitLocal = props.mode === 'local' && props.localNamesReady && !props.displayWinner;

  if (!canEmote && !canForfeit && !canExitLocal) return null;

  return (
    <div className="relative flex items-center justify-center gap-2.5">
      {/* The inline variant is the one that lays out in normal flow; the default
          variant positions itself absolutely and would collapse this wrapper.
          Muted because the server echoes the emote back and plays it on arrival. */}
      {canEmote && props.showEmotePalette && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-30 flex justify-center ttt-palette-in">
          <div style={{ width: 'min(23rem, calc(100vw - 2rem))' }}>
            <EmotePalette inline silent onEmote={(emote) => props.onSendEmote(emote.id)} />
          </div>
        </div>
      )}

      {canEmote && (
        <button
          onClick={props.onToggleEmotePalette}
          aria-pressed={props.showEmotePalette}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{
            backgroundColor: props.showEmotePalette
              ? 'rgb(var(--color-primary-rgb) / 0.16)'
              : 'var(--color-bg-card)',
            color: props.showEmotePalette ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            border: `1px solid ${props.showEmotePalette ? 'var(--color-primary)' : 'var(--color-border)'}`,
          }}>
          <IconSmile size={17} />
          {t('ttt.react')}
        </button>
      )}

      {canForfeit && (
        <button
          onClick={onRequestForfeit}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-surface-hover"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            color: 'var(--color-danger)',
            border: '1px solid rgb(var(--color-danger-rgb) / 0.45)',
          }}>
          <IconFlag size={16} />
          {t('ttt.forfeit')}
        </button>
      )}

      {canExitLocal && (
        <button
          onClick={props.onBackToGames}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-surface-hover"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}>
          {t('ttt.exit')}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── sound ───────────────────────── */

/**
 * Cues are driven off the board itself rather than off the click handler, so a
 * mark sounds the same whether you placed it, your opponent did, or it arrived
 * from the server after a reconnect. The previous board is held in a ref: this
 * has to compare against what was last *rendered*, not re-run on every render.
 */
function useTicTacToeSounds(props: TicTacToeGameViewProps) {
  const previousBoard = useRef<CellValue[] | null>(null);
  const previousResult = useRef<GameResult>(null);

  const { displayBoard, mode, mySymbol } = props;

  useEffect(() => {
    const before = previousBoard.current;
    previousBoard.current = displayBoard;
    if (!before) return;

    // A reset or a fresh match empties the board; that is not a move.
    const landedIndex = displayBoard.findIndex((cell, i) => cell && !before[i]);
    if (landedIndex === -1) return;

    const landed = displayBoard[landedIndex] as 'X' | 'O';
    if (mode === 'local') {
      playLocalPlaceSound(landed);
      return;
    }
    // Online, the opponent's mark doubles as the cue that you are up, so it
    // gets the rising pair and your own gets the plain tick.
    if (landed === mySymbol) playPlaceSound();
    else playTurnSound();
  }, [displayBoard, mode, mySymbol]);

  const result = mode === 'online'
    ? (props.onlinePhase === 'game_over' ? props.onlineWinner : null)
    : props.displayWinner;

  useEffect(() => {
    const before = previousResult.current;
    previousResult.current = result;
    if (!result || before === result) return;

    if (result === 'draw') playResultSound('draw');
    else if (mode === 'local') playResultSound('win');
    else playResultSound(result === mySymbol ? 'win' : 'lose');
  }, [result, mode, mySymbol]);
}

/* ───────────────────────── page ───────────────────────── */

export default function TicTacToeGameView(props: TicTacToeGameViewProps) {
  const { t } = useTranslation();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const seats = getSeats(props, t);

  // A match that ends while the dialog is open (the opponent won, or they quit
  // first) leaves nothing to forfeit, so the prompt should not linger.
  useEffect(() => {
    if (props.onlinePhase !== 'playing') setConfirmForfeit(false);
  }, [props.onlinePhase]);

  useTicTacToeSounds(props);

  return (
    <>
      <OpponentLeftOverlay props={props} />
      <ForfeitConfirm
        open={confirmForfeit}
        onCancel={() => setConfirmForfeit(false)}
        onConfirm={() => {
          setConfirmForfeit(false);
          props.onForfeit();
        }}
      />

      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4 sm:p-6 lg:p-8"
        style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="w-full max-w-6xl">
          <TopBar props={props} />
        </div>

        <div className="relative w-full max-w-6xl">
          <FloatingEmoteOverlay
            emotes={props.floatingEmotes}
            leftColor={NEAR.color}
            rightColor={FAR.color}
          />

          {/* Seats flank the board on a wide screen and sit above it on a
              narrow one, so the two of them always read as facing each other. */}
          <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:justify-center lg:gap-12">
            <div className="grid grid-cols-2 gap-3 w-full max-w-[30rem] lg:hidden">
              <SeatCard seat={seats[0]} compact />
              <SeatCard seat={seats[1]} compact />
            </div>

            <div className="hidden lg:block w-[240px] shrink-0">
              <SeatCard seat={seats[0]} />
            </div>

            <div className="relative w-full max-w-[26rem] lg:max-w-[30rem] flex flex-col items-center gap-4">
              <LocalNameSetup props={props} />
              <OnlinePhaseOverlay props={props} />
              <RealtimeRecoveryOverlay props={props} />
              <GameBoard props={props} seats={seats} />
              <ResultBanner props={props} seats={seats} />
            </div>

            <div className="hidden lg:block w-[240px] shrink-0">
              <SeatCard seat={seats[1]} />
            </div>
          </div>
        </div>

        <div className="w-full max-w-6xl">
          <ActionBar props={props} onRequestForfeit={() => setConfirmForfeit(true)} />
        </div>
      </div>
    </>
  );
}
