import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createLocalMatch } from '../services/games';
import {
  canPlayLocalMove,
  checkWinner,
  createEmptyBoard,
  shouldStartLocalTimer,
  type CellValue,
  type GameResult,
  type LocalPlayerNames,
  type LocalScores,
  type Mode,
} from './TicTacToeGameShared';

interface LocalGameOptions {
  mode: Mode;
}

function incrementLocalScore(
  nextWinner: GameResult,
  setScores: Dispatch<SetStateAction<LocalScores>>,
) {
  if (nextWinner === 'X') {
    setScores((prev) => ({ ...prev, X: prev.X + 1 }));
    return;
  }
  if (nextWinner === 'O') {
    setScores((prev) => ({ ...prev, O: prev.O + 1 }));
    return;
  }
  if (nextWinner === 'draw') {
    setScores((prev) => ({ ...prev, draw: prev.draw + 1 }));
  }
}

async function persistFinishedLocalMatch({
  winner,
  board,
  gameStartTime,
  localPlayerNames,
}: {
  winner: GameResult;
  board: CellValue[];
  gameStartTime: number | null;
  localPlayerNames: LocalPlayerNames;
}) {
  if (winner === null || !gameStartTime) return;

  const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
  try {
    await createLocalMatch({
      game_type: 'tictactoe',
      game_mode: 'pvp',
      winner: winner === 'draw' ? null : winner,
      duration_seconds: durationSeconds,
      player1_score: winner === 'X' ? 1 : 0,
      player2_score: winner === 'O' ? 1 : 0,
      metadata: {
        board,
        local_players: {
          player1_name: localPlayerNames.p1.trim(),
          player2_name: localPlayerNames.p2.trim(),
        },
      },
    });
  } catch {}
}

export function useTicTacToeLocalGame({ mode }: LocalGameOptions) {
  const [board, setBoard] = useState<CellValue[]>(createEmptyBoard);
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState<LocalScores>({ X: 0, O: 0, draw: 0 });
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [localPlayerNames, setLocalPlayerNames] = useState<LocalPlayerNames>({
    p1: '',
    p2: '',
  });
  const [localNamesReady, setLocalNamesReady] = useState(mode !== 'local');

  useEffect(() => {
    setLocalNamesReady(mode !== 'local');
  }, [mode]);

  const { winner, line } = checkWinner(board);

  const playMove = (index: number) => {
    if (!canPlayLocalMove(localNamesReady, board, index, winner)) return;

    const startTime = gameStartTime ?? Date.now();
    if (shouldStartLocalTimer(gameStartTime)) {
      setGameStartTime(startTime);
    }

    const nextBoard = [...board];
    const mark = isXTurn ? 'X' : 'O';
    nextBoard[index] = mark;

    setBoard(nextBoard);
    setIsXTurn((prev) => !prev);

    const result = checkWinner(nextBoard);
    incrementLocalScore(result.winner, setScores);
    void persistFinishedLocalMatch({
      winner: result.winner,
      board: nextBoard,
      gameStartTime: startTime,
      localPlayerNames,
    });
  };

  const resetGame = () => {
    setBoard(createEmptyBoard());
    setIsXTurn(true);
    setGameStartTime(null);

    if (mode === 'local') {
      setScores({ X: 0, O: 0, draw: 0 });
      setLocalPlayerNames({ p1: '', p2: '' });
      setLocalNamesReady(false);
    }
  };

  const startLocalGame = () => {
    if (!localPlayerNames.p1.trim() || !localPlayerNames.p2.trim()) return;
    setLocalNamesReady(true);
    setBoard(createEmptyBoard());
    setIsXTurn(true);
    setScores({ X: 0, O: 0, draw: 0 });
    setGameStartTime(null);
  };

  return {
    board,
    isXTurn,
    scores,
    localPlayerNames,
    localNamesReady,
    winner,
    line,
    setLocalPlayerNames,
    playMove,
    resetGame,
    startLocalGame,
  };
}
