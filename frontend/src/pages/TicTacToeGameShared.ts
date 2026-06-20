export type CellValue = 'X' | 'O' | null;
export type GameResult = 'X' | 'O' | 'draw' | null;
export type Mode = 'local' | 'online';
export type OnlinePhase = 'idle' | 'searching' | 'waiting' | 'playing' | 'game_over';
export type SocketMessage = Record<string, unknown>;

export interface OnlineGameState {
  board: CellValue[];
  current_turn: 'X' | 'O';
}

export interface LocalScores {
  X: number;
  O: number;
  draw: number;
}

export interface LocalPlayerNames {
  p1: string;
  p2: string;
}

export interface GameInfoPlayer {
  username: string;
  user_id?: string;
}

export const POSITION_NAMES = [
  'top_left', 'top_center', 'top_right',
  'mid_left', 'center', 'mid_right',
  'bot_left', 'bot_center', 'bot_right',
] as const;

export function createEmptyBoard(): CellValue[] {
  return Array(9).fill(null);
}

export function resolveMode(rawMode: string, hasGameId: boolean): Mode {
  if (hasGameId) return 'online';
  return rawMode === 'online' ? 'online' : 'local';
}

export function getOpponentSymbol(
  mySymbol: 'X' | 'O' | null,
): 'X' | 'O' | '?' {
  if (mySymbol === 'X') return 'O';
  if (mySymbol === 'O') return 'X';
  return '?';
}

export function getOpponentSlot(slot: number | null): '1' | '2' | null {
  if (slot === 1) return '2';
  if (slot === 2) return '1';
  return null;
}

export function canPlayLocalMove(
  localNamesReady: boolean,
  board: CellValue[],
  index: number,
  winner: GameResult,
): boolean {
  if (!localNamesReady) return false;
  if (board[index]) return false;
  return winner === null;
}

export function shouldStartLocalTimer(
  gameStartTime: number | null,
): boolean {
  return gameStartTime === null;
}

function hasMatchingWinner(
  board: CellValue[],
  a: number,
  b: number,
  c: number,
): board is ('X' | 'O' | null)[] {
  const firstCell = board[a];
  if (!firstCell) return false;
  return firstCell === board[b] && firstCell === board[c];
}

export function checkWinner(
  board: CellValue[],
): { winner: GameResult; line: number[] | null } {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (hasMatchingWinner(board, a, b, c)) {
      return { winner: board[a], line: [a, b, c] };
    }
  }

  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

export function canJoinOnlineGame(
  gamePath: string | null,
  gameSocketStatus: string,
  gameId: string | null,
): boolean {
  return Boolean(gamePath) && gameSocketStatus === 'open' && Boolean(gameId);
}

export function shouldAutoFindMatch(
  mode: Mode,
  onlinePhase: OnlinePhase,
): boolean {
  return mode === 'online' && onlinePhase === 'idle';
}

export function getDisplayBoard(
  mode: Mode,
  onlineGameState: OnlineGameState | null,
  board: CellValue[],
): CellValue[] {
  if (mode === 'online') {
    return onlineGameState?.board ?? createEmptyBoard();
  }
  return board;
}

export function isOnlineTurnPlayable(
  currentTurn: 'X' | 'O' | undefined,
  mySymbol: 'X' | 'O' | null,
  onlinePhase: OnlinePhase,
  gamePaused: boolean,
): boolean {
  if (onlinePhase !== 'playing') return false;
  if (gamePaused) return false;
  return currentTurn === mySymbol;
}

export function isRecoveringSocketStatus(
  gameSocketStatus: string,
): boolean {
  return gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting';
}

export function shouldShowRealtimeRecoveryOverlay(
  mode: Mode,
  onlinePhase: OnlinePhase,
  gamePaused: boolean,
  gameSocketStatus: string,
): boolean {
  if (mode !== 'online') return false;
  if (onlinePhase !== 'playing') return false;
  return gamePaused || isRecoveringSocketStatus(gameSocketStatus);
}
