import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useState } from 'react';

type GameMode = 'online' | 'ai' | 'local';
type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

export default function PlayPage() {
  const [selectedMode, setSelectedMode] = useState<GameMode>('online');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');

  const modes = [
    { id: 'online' as GameMode, icon: '🌐', label: 'Online', desc: 'Play against real players worldwide' },
    { id: 'ai' as GameMode, icon: '🤖', label: 'vs AI', desc: 'Challenge intelligent bots' },
    { id: 'local' as GameMode, icon: '🖥️', label: 'Local', desc: 'Play on the same device' },
  ];

  const difficulties: AIDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Choose Your Mode
          </h1>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Select how you want to play
          </p>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              className={cn(
                'relative p-6 rounded-xl text-center transition-all duration-250 outline-none'
              )}
              style={{
                backgroundColor: selectedMode === mode.id ? 'var(--color-bg-card)' : 'var(--color-bg-card)',
                border: selectedMode === mode.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                opacity: selectedMode === mode.id ? 1 : 0.7,
                boxShadow: selectedMode === mode.id ? '0 0 20px rgba(168, 85, 247, 0.3)' : 'none',
                transform: selectedMode === mode.id ? 'scale(1.02)' : 'scale(1)',
              }}
              onMouseEnter={(e) => {
                if (selectedMode !== mode.id) {
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedMode !== mode.id) {
                  e.currentTarget.style.opacity = '0.7';
                }
              }}
            >
              <div 
                className="text-5xl mb-4 transition-transform duration-200"
                style={{
                  filter: selectedMode === mode.id ? 'none' : 'grayscale(50%)',
                }}
              >
                {mode.icon}
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                {mode.label}
              </h3>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {mode.desc}
              </p>
            </button>
          ))}
        </div>

        {/* AI Difficulty */}
        {selectedMode === 'ai' && (
          <div>
            <p className="text-sm text-center mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              AI Difficulty
            </p>
            <div className="flex justify-center gap-2">
              {difficulties.map((d) => (
                <button
                  key={d}
                  onClick={() => setAiDifficulty(d)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 capitalize"
                  style={{
                    backgroundColor: aiDifficulty === d ? 'rgba(168, 85, 247, 0.2)' : 'var(--color-bg-card)',
                    color: aiDifficulty === d ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    border: aiDifficulty === d ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    boxShadow: aiDifficulty === d ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (aiDifficulty !== d) {
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (aiDifficulty !== d) {
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Game Selection */}
        <div>
          <h2 className="text-lg font-semibold text-center mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Select Game
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <Link to={`/games/pong?mode=${selectedMode}${selectedMode === 'ai' ? `&difficulty=${aiDifficulty}` : ''}`}>
              <div 
                className="flex items-center gap-4 p-5 rounded-lg transition-all duration-200 group"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div 
                  className="p-3 rounded-xl transition-transform duration-200"
                  style={{
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <span className="text-3xl">🏓</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Pong
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Classic arcade action
                  </p>
                </div>
                <span className="text-xl transition-transform duration-200 group-hover:translate-x-1" style={{ color: 'var(--color-text-muted)' }}>
                  →
                </span>
              </div>
            </Link>

            <Link to={`/games/tictactoe?mode=${selectedMode}${selectedMode === 'ai' ? `&difficulty=${aiDifficulty}` : ''}`}>
              <div 
                className="flex items-center gap-4 p-5 rounded-lg transition-all duration-200 group"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div 
                  className="p-3 rounded-xl transition-transform duration-200"
                  style={{
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    color: '#06b6d4',
                  }}
                >
                  <span className="text-3xl">⭕</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Tic-Tac-Toe
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Strategy showdown
                  </p>
                </div>
                <span className="text-xl transition-transform duration-200 group-hover:translate-x-1" style={{ color: 'var(--color-text-muted)' }}>
                  →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}