import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';

type CellValue = 'X' | 'O' | null;
type GameResult = 'X' | 'O' | 'draw' | null;

function checkWinner(board: CellValue[]): { winner: GameResult; line: number[] | null } {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6],         // diagonals
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

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-4xl w-full">
        {/* HUD */}
        <div 
          className="flex items-center justify-between rounded-xl px-4 py-3 mb-4"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
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
                    className={cn(
                      'aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none',
                      !cell && !winner && 'cursor-pointer',
                      cell && 'cursor-default'
                    )}
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      boxShadow: isWinCell ? '0 0 20px rgba(168, 85, 247, 0.4)' : 'none',
                      transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!cell && !winner) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!cell && !winner) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }
                    }}
                  >
                    {cell === 'X' && <span style={{ color: 'var(--color-primary)' }}>✕</span>}
                    {cell === 'O' && <span style={{ color: '#ec4899' }}>○</span>}
                  </button>
                );
              })}
            </div>

            {/* Game Over */}
            {winner && (
              <div className="text-center">
                <h2 
                  className="text-2xl font-bold mb-2"
                  style={{ 
                    color: winner === 'X' ? 'var(--color-success)' : 
                           winner === 'O' ? 'var(--color-error)' : 
                           '#fbbf24' 
                  }}
                >
                  {winner === 'draw' ? "It's a Draw!" : winner === 'X' ? '🎉 You Win!' : 'You Lose!'}
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-success)' }}>
                  +{winner === 'X' ? 25 : winner === 'O' ? 5 : 10} XP
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={resetGame}
                    className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    🔄 Play Again
                  </button>
                  <Link to="/dashboard">
                    <button
                      className="px-6 py-2 rounded-lg font-medium transition-all duration-200"
                      style={{
                        backgroundColor: 'var(--color-bg-card)',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'}
                    >
                      🏠 Back
                    </button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Player Cards */}
            <div 
              className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: isXTurn && !winner ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                boxShadow: isXTurn && !winner ? '0 0 20px rgba(168, 85, 247, 0.3)' : 'none',
                opacity: isXTurn && !winner ? 1 : 0.6,
              }}
            >
              <Avatar name="You" size="md" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>You</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Wins: {scores.X}</p>
                {isXTurn && !winner && (
                  <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-primary)' }}>
                    <span 
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    />
                    Your turn
                  </span>
                )}
              </div>
            </div>

            <div 
              className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: !isXTurn && !winner ? '2px solid #ec4899' : '1px solid var(--color-border)',
                boxShadow: !isXTurn && !winner ? '0 0 20px rgba(236, 72, 153, 0.3)' : 'none',
                opacity: !isXTurn && !winner ? 1 : 0.6,
              }}
            >
              <Avatar name="Opponent" size="md" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Opponent</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Wins: {scores.O}</p>
                {!isXTurn && !winner && (
                  <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: '#ec4899' }}>
                    <span 
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: '#ec4899' }}
                    />
                    Their turn
                  </span>
                )}
              </div>
            </div>

            {/* Move History */}
            <div 
              className="p-4 rounded-lg max-h-64 overflow-y-auto"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Move History</h3>
              {moves.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No moves yet</p>
              ) : (
                <div className="space-y-1.5">
                  {moves.map((move, i) => (
                    <div
                      key={i}
                      className="text-xs px-2 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: i === moves.length - 1 ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                        color: i === moves.length - 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span> {move}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}