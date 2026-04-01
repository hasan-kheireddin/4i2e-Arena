import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';

type CellValue = 'X' | 'O' | null;
type GameResult = 'X' | 'O' | 'draw' | null;

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
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [moves, setMoves] = useState<string[]>([]);

  const { winner, line } = checkWinner(board);

  const positionNames = [
    'top-left','top-center','top-right',
    'mid-left','center','mid-right',
    'bot-left','bot-center','bot-right',
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
    if (result.winner === 'X')     setScores((s) => ({ ...s, X: s.X + 1 }));
    if (result.winner === 'O')     setScores((s) => ({ ...s, O: s.O + 1 }));
    if (result.winner === 'draw')  setScores((s) => ({ ...s, draw: s.draw + 1 }));
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXTurn(true);
    setMoves([]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-4xl w-full space-y-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
            ⭕ Tic-Tac-Toe
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Local 2-Player — take turns on the same screen
          </p>
        </div>

        {/* Score banner */}
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

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name="P1" size="sm" />
            <div>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Player 1</span>
              <span className="ml-2 text-xs font-bold" style={{ color: 'var(--color-primary)' }}>(X)</span>
            </div>
            {isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-primary)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)' }} />
                Your turn
              </span>
            )}
          </div>

          <div className="text-sm font-medium px-3 py-1 rounded-full"
            style={{ backgroundColor: winner ? 'rgba(168,85,247,0.1)' : 'transparent', color: 'var(--color-text-secondary)' }}>
            {winner
              ? (winner === 'draw' ? "Draw!" : `${winner === 'X' ? 'Player 1' : 'Player 2'} wins!`)
              : `Turn: ${isXTurn ? 'X' : 'O'}`}
          </div>

          <div className="flex items-center gap-3">
            {!isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#ec4899' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ec4899' }} />
                Your turn
              </span>
            )}
            <div>
              <span className="text-sm font-semibold" style={{ color: '#ec4899' }}>Player 2</span>
              <span className="ml-2 text-xs font-bold" style={{ color: '#ec4899' }}>(O)</span>
            </div>
            <Avatar name="P2" size="sm" />
          </div>
        </div>

        {/* Main area */}
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
                      (cell || winner) && 'cursor-default'
                    )}
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      boxShadow: isWinCell ? '0 0 20px rgba(168,85,247,0.4)' : 'none',
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

            {winner && (
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-extrabold"
                  style={{ color: winner === 'X' ? 'var(--color-primary)' : winner === 'O' ? '#ec4899' : '#fbbf24' }}>
                  {winner === 'draw' ? "It's a Draw!" : winner === 'X' ? 'Player 1 Wins! 🎉' : 'Player 2 Wins! 🎉'}
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
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Player cards */}
            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: isXTurn && !winner ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                boxShadow: isXTurn && !winner ? '0 0 20px rgba(168,85,247,0.25)' : 'none',
                opacity: isXTurn && !winner ? 1 : 0.65,
              }}>
              <Avatar name="P1" size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>Player 1 (X)</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{scores.X} wins</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: !isXTurn && !winner ? '2px solid #ec4899' : '1px solid var(--color-border)',
                boxShadow: !isXTurn && !winner ? '0 0 20px rgba(236,72,153,0.25)' : 'none',
                opacity: !isXTurn && !winner ? 1 : 0.65,
              }}>
              <Avatar name="P2" size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#ec4899' }}>Player 2 (O)</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{scores.O} wins</p>
              </div>
            </div>

            {/* Move history */}
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
          </div>
        </div>

      </div>
    </div>
  );
}
