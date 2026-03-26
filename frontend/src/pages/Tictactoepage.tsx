import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import { useGameSocket } from '../hooks/useGameSocket';

type CellValue = 'X' | 'O' | null;
type GameResult = 'X' | 'O' | 'draw' | null;
type Mode = 'local' | 'online';
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

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
  // ── local mode state ────────────────────────────────────────────────────
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0 });
  const [moves, setMoves] = useState<string[]>([]);

  const { winner, line } = checkWinner(board);

  const positionNames = [
    'top-left','top-center','top-right',
    'middle-left','center','middle-right',
    'bottom-left','bottom-center','bottom-right',
  ];

  const handleClick = (i: number) => {
    if (board[i] || winner) return;
    const next = [...board];
    const mark = isXTurn ? 'X' : 'O';
    next[i] = mark;
    setBoard(next);
    setIsXTurn(!isXTurn);
    setMoves((prev) => [...prev, `${mark} → ${positionNames[i]}`]);
    const result = checkWinner(next);
    if (result.winner === 'X') setScores((s) => ({ ...s, X: s.X + 1 }));
    if (result.winner === 'O') setScores((s) => ({ ...s, O: s.O + 1 }));
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXTurn(true);
    setMoves([]);
  };

  // ── online mode state ───────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('local');
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [onlineBoard, setOnlineBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [currentTurn, setCurrentTurn] = useState<number>(1);
  const [onlineWinner, setOnlineWinner] = useState<string | null>(null);
  const [onlineDraw, setOnlineDraw] = useState(false);
  const [onlineReason, setOnlineReason] = useState<string | null>(null);
  const [opponentName, setOpponentName] = useState<string>('Opponent');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  // ── matchmaking socket ──────────────────────────────────────────────────
  const { send: mmSend } = useGameSocket(mmPath, {
    onOpen: useCallback(() => {
      mmSend({ type: 'find_match', game_type: 'tictactoe' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onMessage: useCallback((data: Record<string, unknown>) => {
      if (data.type === 'match_found') {
        const gid = data.game_id as string;
        setGameId(gid);
        setMmPath(null);
        setGamePath(`/ws/game/tictactoe/${gid}/`);
        setOnlinePhase('waiting');
      }
    }, []),
  });

  // ── game socket ─────────────────────────────────────────────────────────
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
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { username: string }> | undefined;
          if (players && mySlot !== null) {
            const oppSlot = mySlot === 1 ? '2' : '1';
            if (players[oppSlot]) setOpponentName(players[oppSlot].username);
          }
        }
      } else if (type === 'game_state') {
        const state = data.state as { board: (string | null)[]; current_turn: number } | undefined;
        if (state) {
          setOnlineBoard(state.board);
          setCurrentTurn(state.current_turn);
          setMoveError(null);
        }
      } else if (type === 'game_over') {
        const w = data.winner as string | null;
        const draw = data.is_draw as boolean;
        const reason = data.reason as string;
        const fs = data.final_state as { board?: (string | null)[] } | undefined;
        if (fs?.board) setOnlineBoard(fs.board);
        setOnlineWinner(w);
        setOnlineDraw(draw);
        setOnlineReason(reason);
        setOnlinePhase('over');
      } else if (type === 'player_left') {
        setOpponentLeft(true);
      } else if (type === 'move_error') {
        setMoveError(data.result as string);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mySlot]),
    onClose: useCallback(() => {
      if (onlinePhase === 'playing') setOnlinePhase('over');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlinePhase]),
  });

  const handleFindMatch = () => {
    setOnlinePhase('matchmaking');
    setOnlineBoard(Array(9).fill(null));
    setOnlineWinner(null);
    setOnlineDraw(false);
    setOnlineReason(null);
    setOpponentLeft(false);
    setMoveError(null);
    setMySlot(null);
    setOpponentName('Opponent');
    setGameId(null);
    setGamePath(null);
    setMmPath('/ws/matchmaking/');
  };

  const handleCancelMatchmaking = () => {
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
  };

  const handleOnlineCell = (i: number) => {
    if (onlinePhase !== 'playing') return;
    if (onlineBoard[i]) return;
    if (currentTurn !== mySlot) return;
    gameSend({ type: 'move', cell: i });
  };

  const handleForfeit = () => {
    gameSend({ type: 'forfeit' });
  };

  const handlePlayAgainOnline = () => {
    setGamePath(null);
    setOnlinePhase('idle');
  };

  const handleModeSwitch = (m: Mode) => {
    if (m === mode) return;
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    setMode(m);
  };

  // ── derived online values ───────────────────────────────────────────────
  const myMark = mySlot === 1 ? 'X' : 'O';
  const isMyTurn = onlinePhase === 'playing' && currentTurn === mySlot;
  const onlineWinLine: number[] | null = onlineWinner
    ? checkWinner(onlineBoard as CellValue[]).line
    : null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-4xl w-full space-y-4">

        {/* Mode selector */}
        <div className="flex justify-center">
          <div className="flex rounded-full p-1 gap-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            {(['local', 'online'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className="px-5 py-1.5 rounded-full text-sm font-medium capitalize transition-all duration-150"
                style={{
                  backgroundColor: mode === m ? 'rgba(168,85,247,0.2)' : 'transparent',
                  color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {m === 'local' ? 'Local' : 'Online'}
              </button>
            ))}
          </div>
        </div>

        {/* ── LOCAL MODE ──────────────────────────────────────────────── */}
        {mode === 'local' && (
          <>
            {/* HUD */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-3">
                <Avatar name="You" size="sm" />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>You (X)</span>
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Turn: <span style={{ color: isXTurn ? 'var(--color-primary)' : '#ec4899' }}>{isXTurn ? 'X' : 'O'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Opponent (O)</span>
                <Avatar name="Opponent" size="sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              {/* Game Grid */}
              <div className="flex flex-col items-center gap-6">
                <div className="grid grid-cols-3 gap-2 w-full max-w-xs aspect-square">
                  {board.map((cell, i) => {
                    const isWinCell = line?.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => handleClick(i)}
                        disabled={!!cell || !!winner}
                        className={cn('aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none', !cell && !winner && 'cursor-pointer', cell && 'cursor-default')}
                        style={{
                          backgroundColor: 'var(--color-bg-card)',
                          border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          boxShadow: isWinCell ? '0 0 20px rgba(168, 85, 247, 0.4)' : 'none',
                          transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
                        }}
                        onMouseEnter={(e) => { if (!cell && !winner) { e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; } }}
                        onMouseLeave={(e) => { if (!cell && !winner) { e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'; e.currentTarget.style.borderColor = 'var(--color-border)'; } }}
                      >
                        {cell === 'X' && <span className="text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>X</span>}
                        {cell === 'O' && <span className="text-4xl font-bold leading-none" style={{ color: '#ec4899' }}>○</span>}
                      </button>
                    );
                  })}
                </div>

                {winner && (
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: winner === 'X' ? 'var(--color-success)' : winner === 'O' ? 'var(--color-error)' : '#fbbf24' }}>
                      {winner === 'draw' ? "It's a Draw!" : winner === 'X' ? 'You Win!' : 'You Lose!'}
                    </h2>
                    <div className="flex gap-3 justify-center">
                      <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
                        Play Again
                      </button>
                      <Link to="/dashboard">
                        <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                          Back
                        </button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Panel */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200" style={{ backgroundColor: 'var(--color-bg-card)', border: isXTurn && !winner ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', boxShadow: isXTurn && !winner ? '0 0 20px rgba(168, 85, 247, 0.3)' : 'none', opacity: isXTurn && !winner ? 1 : 0.6 }}>
                  <Avatar name="You" size="md" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>You</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Wins: {scores.X}</p>
                    {isXTurn && !winner && <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-primary)' }}><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)' }} />Your turn</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200" style={{ backgroundColor: 'var(--color-bg-card)', border: !isXTurn && !winner ? '2px solid #ec4899' : '1px solid var(--color-border)', boxShadow: !isXTurn && !winner ? '0 0 20px rgba(236, 72, 153, 0.3)' : 'none', opacity: !isXTurn && !winner ? 1 : 0.6 }}>
                  <Avatar name="Opponent" size="md" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Opponent</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Wins: {scores.O}</p>
                    {!isXTurn && !winner && <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: '#ec4899' }}><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ec4899' }} />Their turn</span>}
                  </div>
                </div>
                <div className="p-4 rounded-lg max-h-64 overflow-y-auto" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Move History</h3>
                  {moves.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No moves yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {moves.map((move, i) => (
                        <div key={i} className="text-xs px-2 py-1.5 rounded-lg" style={{ backgroundColor: i === moves.length - 1 ? 'rgba(168, 85, 247, 0.1)' : 'transparent', color: i === moves.length - 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span> {move}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── ONLINE MODE ─────────────────────────────────────────────── */}
        {mode === 'online' && (
          <>
            {/* Idle */}
            {onlinePhase === 'idle' && (
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Online Tic-Tac-Toe</h2>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Play against real opponents in real-time</p>
                <button
                  onClick={handleFindMatch}
                  className="px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  Find Match
                </button>
              </div>
            )}

            {/* Matchmaking */}
            {onlinePhase === 'matchmaking' && (
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Searching for opponent…</p>
                <button onClick={handleCancelMatchmaking} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Waiting (connected to game, awaiting second player) */}
            {onlinePhase === 'waiting' && (
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: '#ec4899', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Waiting for opponent to join…</p>
                <button onClick={handleCancelMatchmaking} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Playing / Over */}
            {(onlinePhase === 'playing' || onlinePhase === 'over') && (
              <>
                {/* HUD */}
                <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <Avatar name="You" size="sm" />
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>You ({myMark})</span>
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    {onlinePhase === 'playing'
                      ? (isMyTurn ? <span style={{ color: 'var(--color-primary)' }}>Your turn</span> : <span style={{ color: '#ec4899' }}>Their turn</span>)
                      : <span>Game Over</span>
                    }
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{opponentName} ({myMark === 'X' ? 'O' : 'X'})</span>
                    <Avatar name={opponentName} size="sm" />
                  </div>
                </div>

                {opponentLeft && (
                  <div className="text-center py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    Opponent disconnected
                  </div>
                )}
                {moveError && (
                  <div className="text-center py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
                    {moveError}
                  </div>
                )}

                <div className="flex justify-center">
                  <div className="grid grid-cols-3 gap-2 w-full max-w-xs aspect-square">
                    {onlineBoard.map((cell, i) => {
                      const isWinCell = onlineWinLine?.includes(i);
                      const canClick = onlinePhase === 'playing' && !cell && isMyTurn;
                      return (
                        <button
                          key={i}
                          onClick={() => handleOnlineCell(i)}
                          disabled={!canClick}
                          className={cn('aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none', canClick && 'cursor-pointer', !canClick && 'cursor-default')}
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                            boxShadow: isWinCell ? '0 0 20px rgba(168, 85, 247, 0.4)' : 'none',
                            transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
                          }}
                          onMouseEnter={(e) => { if (canClick) { e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; } }}
                          onMouseLeave={(e) => { if (canClick) { e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'; e.currentTarget.style.borderColor = 'var(--color-border)'; } }}
                        >
                          {cell === 'X' && <span className="text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>X</span>}
                          {cell === 'O' && <span style={{ color: '#ec4899' }}>○</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Game over */}
                {onlinePhase === 'over' && (
                  <div className="text-center space-y-3">
                    <h2 className="text-2xl font-bold" style={{
                      color: onlineDraw ? '#fbbf24' :
                             onlineWinner === myMark ? 'var(--color-success)' :
                             'var(--color-error)',
                    }}>
                      {onlineDraw ? "It's a Draw!" :
                       onlineWinner === myMark ? 'You Win!' :
                       onlineReason === 'disconnect_forfeit' ? 'Opponent Disconnected — You Win!' :
                       onlineReason === 'forfeit' ? 'Opponent Forfeited' :
                       'You Lose!'}
                    </h2>
                    <div className="flex gap-3 justify-center">
                      <button onClick={handlePlayAgainOnline} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
                        Find New Match
                      </button>
                      <Link to="/dashboard">
                        <button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                          Back
                        </button>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Forfeit button during play */}
                {onlinePhase === 'playing' && (
                  <div className="flex justify-center">
                    <button
                      onClick={handleForfeit}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                      style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'}
                    >
                      Forfeit
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
