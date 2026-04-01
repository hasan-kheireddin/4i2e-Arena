import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import { useGameSocket } from '../hooks/useGameSocket';
import { createLocalMatch } from '../services/games';

type CellValue = 'X' | 'O' | null;
type GameResult = 'X' | 'O' | 'draw' | null;
type Mode = 'local' | 'online';
type OnlinePhase = 'idle' | 'searching' | 'waiting' | 'playing' | 'game_over';

interface OnlineGameState {
  board: CellValue[];
  current_turn: 'X' | 'O';
}

function checkWinner(board: CellValue[]): { winner: GameResult; line: number[] | null } {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a,b,c] };
    }
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

export default function TicTacToePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('mode') ?? 'local';
  const mode: Mode = rawMode === 'online' ? 'online' : 'local';

  // ── Local mode state ──────────────────────────────────────────────────────
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [moves, setMoves] = useState<string[]>([]);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);

  const { winner, line } = checkWinner(board);

  const positionNames = [
    'top-left','top-center','top-right',
    'mid-left','center','mid-right',
    'bot-left','bot-center','bot-right',
  ];

  // ── Online mode state ─────────────────────────────────────────────────────
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [onlineWinner, setOnlineWinner] = useState<'X' | 'O' | 'draw' | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [opponentLeftMsg, setOpponentLeftMsg] = useState<string | null>(null);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  // ── Local game handlers ───────────────────────────────────────────────────
  const handleClick = async (i: number) => {
    if (mode === 'local') {
      if (board[i] || winner) return;
      
      // Start timer on first move
      if (!gameStartTime) setGameStartTime(Date.now());

      const next = [...board];
      const mark = isXTurn ? 'X' : 'O';
      next[i] = mark;
      setBoard(next);
      setIsXTurn(!isXTurn);
      setMoves((prev) => [...prev, `${mark} → ${positionNames[i]}`]);
      
      const result = checkWinner(next);
      if (result.winner === 'X')     setScores((s) => ({ ...s, X: s.X + 1 }));
      if (result.winner === 'O')     setScores((s) => ({ ...s, O: s.O + 1 }));
      if (result.winner === 'draw')  setScores((s) => ({ ...s, draw: s.draw + 1 }));

      // Save to history when game ends (win or draw)
      if (result.winner !== null && gameStartTime) {
        const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
        try {
          await createLocalMatch({
            game_type: 'tictactoe',
            game_mode: 'pvp',
            winner: result.winner === 'draw' ? null : result.winner,
            duration_seconds: durationSeconds,
            player1_score: result.winner === 'X' ? 1 : 0,
            player2_score: result.winner === 'O' ? 1 : 0,
            metadata: { board: next },
          });
        } catch (error) {
          console.error('Failed to save match:', error);
        }
      }
    } else if (mode === 'online') {
      // Online mode: send move to server
      if (!onlineGameState || onlineGameState.board[i]) return;
      if (onlineGameState.current_turn !== mySymbol) return;
      
      gameSend({ type: 'move', cell: i });
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXTurn(true);
    setMoves([]);
    setGameStartTime(null);
  };

  // ── Online matchmaking socket ─────────────────────────────────────────────
  const { send: mmSend } = useGameSocket(mmPath, {
    onOpen: useCallback(() => {
      mmSend({ type: 'find_match', game_type: 'tictactoe' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onMessage: useCallback((data: Record<string, unknown>) => {
      if (data.type === 'match_found') {
        const gid = data.game_id as string;
        const opponent = data.opponent as { username?: string } | undefined;
        if (opponent?.username) setOpponentName(opponent.username);
        setGameId(gid);
        setMmPath(null);
        setGamePath(`/ws/game/tictactoe/${gid}/`);
        setOnlinePhase('waiting');
      } else if (data.type === 'queue_update') {
        setQueuePosition(data.position as number);
      }
    }, []),
  });

  // ── Online game socket ────────────────────────────────────────────────────
  const { send: gameSend } = useGameSocket(gamePath, {
    onOpen: useCallback(() => {
      if (gameId) gameSend({ type: 'join', game_id: gameId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameId]),
    onMessage: useCallback((data: Record<string, unknown>) => {
      const type = data.type as string;

      if (type === 'game_joined') {
        const slot = data.slot as number;
        setMySlot(slot);
        // slot 1 = X, slot 2 = O
        setMySymbol(slot === 1 ? 'X' : 'O');
        
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { username: string }> | undefined;
          if (players) {
            const oppSlot = slot === 1 ? '2' : '1';
            if (players[oppSlot]) setOpponentName(players[oppSlot].username);
          }
        }
      } else if (type === 'game_start') {
        setOnlinePhase('playing');
        // Initialize board
        setOnlineGameState({
          board: Array(9).fill(null),
          current_turn: 'X',
        });
      } else if (type === 'game_state') {
        // Server sends updated board state
        const boardData = data.board as CellValue[];
        const currentTurn = data.current_turn as 'X' | 'O';
        setOnlineGameState({
          board: boardData,
          current_turn: currentTurn,
        });
      } else if (type === 'both_connected') {
        // both players in lobby — ready to accept Ready clicks
      } else if (type === 'player_ready') {
        setOpponentReady(true);
      } else if (type === 'opponent_left_lobby') {
        setOpponentLeftMsg((data.username as string) || 'Opponent');
        setGamePath(null);
        setOnlinePhase('idle');
      } else if (type === 'game_over') {
        const winnerData = data.winner as 'X' | 'O' | 'draw' | null;
        setOnlineWinner(winnerData);
        setOnlinePhase('game_over');
      }
    }, []),
    onClose: useCallback(() => {
      if (onlinePhase === 'playing') setOnlinePhase('game_over');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlinePhase]),
  });

  // ── Online helpers ────────────────────────────────────────────────────────
  const handleFindMatch = () => {
    setOnlinePhase('searching');
    setOnlineGameState(null);
    setOnlineWinner(null);
    setMySlot(null);
    setMySymbol(null);
    setOpponentName('Opponent');
    setGameId(null);
    setGamePath(null);
    setQueuePosition(null);
    setIReady(false);
    setOpponentReady(false);
    setMmPath('/ws/matchmaking/');
  };

  const handleReady = () => {
    if (iReady) return;
    setIReady(true);
    gameSend({ type: 'ready' });
  };

  const handleCancelOnline = () => {
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    navigate('/games/playpage');
  };

  // Auto-start matchmaking for online mode
  useEffect(() => {
    if (mode === 'online' && onlinePhase === 'idle') {
      handleFindMatch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const displayBoard = mode === 'online' ? (onlineGameState?.board ?? Array(9).fill(null)) : board;
  const displayWinner = mode === 'online' ? onlineWinner : winner;
  const displayLine = mode === 'online' ? checkWinner(displayBoard).line : line;
  
  const isMyTurn = mode === 'online' 
    ? (onlineGameState?.current_turn === mySymbol && onlinePhase === 'playing')
    : false;

  const currentTurnSymbol = mode === 'online' ? onlineGameState?.current_turn : (isXTurn ? 'X' : 'O');

  const modeLabel = mode === 'online' ? 'Online PvP' : 'Local 2P';

  return (
    <>
    {/* Opponent left popup */}
    {opponentLeftMsg && (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <div className="rounded-xl p-8 max-w-sm w-full text-center space-y-4 mx-4"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-2xl">🚪</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {opponentLeftMsg} exited the match
          </p>
          <button
            onClick={() => { setOpponentLeftMsg(null); navigate('/games/playpage'); }}
            className="px-6 py-2 rounded-lg font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
            Back to Games
          </button>
        </div>
      </div>
    )}
    <div className="min-h-screen flex flex-col items-center justify-start p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-4xl w-full space-y-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
            ⭕ Tic-Tac-Toe
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'online' ? 'Online PvP — Turn-based multiplayer' : 'Local 2-Player — take turns on the same screen'}
          </p>
        </div>

        {/* Score banner (local mode only) */}
        {mode === 'local' && (
          <div className="flex items-center justify-center gap-6">
            {[
              { label: 'Player 1 (X)', val: scores.X, color: 'var(--color-primary)' },
              { label: 'Draws', val: scores.draw, color: '#f59e0b' },
              { label: 'Player 2 (O)', val: scores.O, color: '#ec4899' },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center px-5 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-2xl font-extrabold" style={{ color }}>{val}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name={mode === 'online' ? 'You' : 'P1'} size="sm" />
            <div>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                {mode === 'online' ? 'You' : 'Player 1'}
              </span>
              <span className="ml-2 text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                ({mode === 'online' ? mySymbol ?? '?' : 'X'})
              </span>
            </div>
            {mode === 'local' && isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-primary)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)' }} />
                Your turn
              </span>
            )}
            {mode === 'online' && isMyTurn && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-primary)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)' }} />
                Your turn
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" 
              style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              {onlinePhase === 'playing' ? 'Live' : onlinePhase}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{modeLabel}</span>
          </div>

          <div className="flex items-center gap-3">
            {mode === 'local' && !isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#ec4899' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ec4899' }} />
                Your turn
              </span>
            )}
            {mode === 'online' && !isMyTurn && onlinePhase === 'playing' && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#ec4899' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ec4899' }} />
                Opponent's turn
              </span>
            )}
            <div>
              <span className="text-sm font-semibold" style={{ color: '#ec4899' }}>
                {mode === 'online' ? opponentName : 'Player 2'}
              </span>
              <span className="ml-2 text-xs font-bold" style={{ color: '#ec4899' }}>
                ({mode === 'online' ? (mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : '?') : 'O'})
              </span>
            </div>
            <Avatar name={mode === 'online' ? opponentName : 'P2'} size="sm" />
          </div>
        </div>

        {/* Main area */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* Game Grid */}
          <div className="flex flex-col items-center gap-6 relative">
            
            {/* Ready lobby overlay */}
            {mode === 'online' && onlinePhase === 'waiting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
                style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
                <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>vs {opponentName}</p>

                <div className="flex gap-8 text-sm">
                  <span style={{ color: iReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {iReady ? '✓ You are ready' : '◌ You'}
                  </span>
                  <span style={{ color: opponentReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {opponentReady ? `✓ ${opponentName} is ready` : `◌ ${opponentName}`}
                  </span>
                </div>

                {!iReady ? (
                  <button
                    onClick={handleReady}
                    className="px-10 py-3 rounded-lg font-bold text-white text-lg"
                    style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  >
                    Ready!
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full border-4 animate-spin"
                      style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {opponentReady ? 'Starting…' : 'Waiting for opponent…'}
                    </p>
                  </div>
                )}

                <button onClick={handleCancelOnline}
                  className="text-sm px-5 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Exit
                </button>
              </div>
            )}

            {/* Searching overlay */}
            {mode === 'online' && onlinePhase === 'searching' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
                style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
                <div className="w-12 h-12 rounded-full border-4 animate-spin" 
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Searching for opponent…
                </p>
                {queuePosition !== null && (
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Queue position: {queuePosition}
                  </p>
                )}
                <button onClick={handleCancelOnline} 
                  className="text-sm px-5 py-2 rounded-lg" 
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 w-full max-w-xs aspect-square">
              {displayBoard.map((cell, i) => {
                const isWinCell = displayLine?.includes(i);
                const isDisabled = mode === 'online' 
                  ? (!!cell || !isMyTurn || onlinePhase !== 'playing')
                  : (!!cell || !!displayWinner);
                
                return (
                  <button
                    key={i}
                    onClick={() => handleClick(i)}
                    disabled={isDisabled}
                    className={cn(
                      'aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none',
                      !isDisabled && 'cursor-pointer',
                      isDisabled && 'cursor-default'
                    )}
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      boxShadow: isWinCell ? '0 0 20px rgba(168,85,247,0.4)' : 'none',
                      transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }
                    }}
                  >
                    {cell === 'X' && (
                      <span className="text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>X</span>
                    )}
                    {cell === 'O' && (
                      <span className="text-4xl font-bold leading-none" style={{ color: '#ec4899' }}>○</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Local game over */}
            {mode === 'local' && displayWinner && (
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-extrabold"
                  style={{ color: displayWinner === 'X' ? 'var(--color-primary)' : displayWinner === 'O' ? '#ec4899' : '#fbbf24' }}>
                  {displayWinner === 'draw' ? "It's a Draw!" : displayWinner === 'X' ? 'Player 1 Wins! 🎉' : 'Player 2 Wins! 🎉'}
                </h2>
                <div className="flex gap-3 justify-center">
                  <button onClick={resetGame}
                    className="px-6 py-2 rounded-lg font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
                    Play Again
                  </button>
                  <button
                    onClick={() => navigate('/games/playpage')}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                    Back to Games
                  </button>
                </div>
              </div>
            )}

            {/* Online game over */}
            {mode === 'online' && onlinePhase === 'game_over' && (
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-extrabold"
                  style={{ 
                    color: onlineWinner === 'draw' ? '#fbbf24' : 
                           onlineWinner === mySymbol ? 'var(--color-primary)' : '#ec4899' 
                  }}>
                  {onlineWinner === 'draw' ? "It's a Draw!" : 
                   onlineWinner === mySymbol ? 'You Win! 🎉' : 'You Lose'}
                </h2>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleFindMatch}
                    className="px-6 py-2 rounded-lg font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
                    Play Again
                  </button>
                  <button
                    onClick={() => navigate('/games/playpage')}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                    Back to Games
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Player cards */}
            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: (mode === 'local' ? isXTurn : currentTurnSymbol === 'X') && !displayWinner ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                boxShadow: (mode === 'local' ? isXTurn : currentTurnSymbol === 'X') && !displayWinner ? '0 0 20px rgba(168,85,247,0.25)' : 'none',
                opacity: (mode === 'local' ? isXTurn : currentTurnSymbol === 'X') && !displayWinner ? 1 : 0.65,
              }}>
              <Avatar name={mode === 'online' ? 'You' : 'P1'} size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                  {mode === 'online' ? 'You' : 'Player 1'} ({mode === 'online' ? mySymbol ?? '?' : 'X'})
                </p>
                {mode === 'local' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{scores.X} wins</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: (mode === 'local' ? !isXTurn : currentTurnSymbol === 'O') && !displayWinner ? '2px solid #ec4899' : '1px solid var(--color-border)',
                boxShadow: (mode === 'local' ? !isXTurn : currentTurnSymbol === 'O') && !displayWinner ? '0 0 20px rgba(236,72,153,0.25)' : 'none',
                opacity: (mode === 'local' ? !isXTurn : currentTurnSymbol === 'O') && !displayWinner ? 1 : 0.65,
              }}>
              <Avatar name={mode === 'online' ? opponentName : 'P2'} size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#ec4899' }}>
                  {mode === 'online' ? opponentName : 'Player 2'} ({mode === 'online' ? (mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : '?') : 'O'})
                </p>
                {mode === 'local' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{scores.O} wins</p>
                )}
              </div>
            </div>

            {/* Move history (local only) */}
            {mode === 'local' && (
              <>
                <div className="p-4 rounded-lg max-h-52 overflow-y-auto"
                  style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Move History</h3>
                  {moves.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No moves yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {moves.map((move, i) => (
                        <div key={i} className="text-xs px-2 py-1.5 rounded-lg"
                          style={{
                            backgroundColor: i === moves.length - 1 ? 'rgba(168,85,247,0.1)' : 'transparent',
                            color: i === moves.length - 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span> {move}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={resetGame}
                  className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-150"
                  style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                  Reset Game
                </button>
              </>
            )}

            {/* Online status */}
            {mode === 'online' && onlinePhase === 'playing' && (
              <div className="p-4 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Game Status</h3>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {isMyTurn ? "It's your turn!" : `Waiting for ${opponentName}...`}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
    </>
  );
}
