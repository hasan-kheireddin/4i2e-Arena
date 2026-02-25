import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Player = "X" | "O" | null;
type Board = Player[];

interface GameState {
  board: Board;
  currentPlayer: Player;
  winner: Player;
  isDraw: boolean;
  scores: { X: number; O: number; draws: number };
}

export default function TicTacToePage() {
  const navigate = useNavigate();
  
  const [gameState, setGameState] = useState<GameState>({
    board: Array(9).fill(null),
    currentPlayer: "X",
    winner: null,
    isDraw: false,
    scores: { X: 0, O: 0, draws: 0 },
  });

  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  const checkWinner = (board: Board): { winner: Player; line: number[] | null } => {
    const lines = [
      [0, 1, 2], // Row 1
      [3, 4, 5], // Row 2
      [6, 7, 8], // Row 3
      [0, 3, 6], // Col 1
      [1, 4, 7], // Col 2
      [2, 5, 8], // Col 3
      [0, 4, 8], // Diagonal 1
      [2, 4, 6], // Diagonal 2
    ];

    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line: [a, b, c] };
      }
    }

    return { winner: null, line: null };
  };

  const handleCellClick = (index: number) => {
    if (gameState.board[index] || gameState.winner || gameState.isDraw) return;

    const newBoard = [...gameState.board];
    newBoard[index] = gameState.currentPlayer;

    const { winner, line } = checkWinner(newBoard);
    const isDraw = !winner && newBoard.every((cell) => cell !== null);

    setGameState((prev) => ({
      ...prev,
      board: newBoard,
      currentPlayer: prev.currentPlayer === "X" ? "O" : "X",
      winner,
      isDraw,
    }));

    if (winner) {
      setWinningLine(line);
      setGameState((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          [winner]: prev.scores[winner] + 1,
        },
      }));
    } else if (isDraw) {
      setGameState((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          draws: prev.scores.draws + 1,
        },
      }));
    }
  };

  const resetGame = () => {
    setGameState((prev) => ({
      ...prev,
      board: Array(9).fill(null),
      currentPlayer: "X",
      winner: null,
      isDraw: false,
    }));
    setWinningLine(null);
  };

  const resetScores = () => {
    setGameState({
      board: Array(9).fill(null),
      currentPlayer: "X",
      winner: null,
      isDraw: false,
      scores: { X: 0, O: 0, draws: 0 },
    });
    setWinningLine(null);
  };

  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 px-4 py-2 rounded-lg transition-colors"
        style={{
          backgroundColor: "var(--color-bg-input)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      >
        ← Back to Home
      </button>

      {/* Game container */}
      <div className="flex flex-col items-center max-w-2xl w-full px-6">
        {/* Title */}
        <h1
          className="text-4xl font-bold mb-8"
          style={{ color: "var(--color-text-primary)" }}
        >
          Tic-Tac-Toe
        </h1>

        {/* Scores */}
        <div className="flex gap-8 mb-8">
          <div className="text-center">
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--color-primary)" }}
            >
              {gameState.scores.X}
            </div>
            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Player X
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--color-text-muted)" }}
            >
              {gameState.scores.draws}
            </div>
            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Draws
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-3xl font-bold"
              style={{ color: "#f87171" }}
            >
              {gameState.scores.O}
            </div>
            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Player O
            </div>
          </div>
        </div>

        {/* Game status */}
        <div className="mb-6 text-center">
          {gameState.winner ? (
            <div
              className="text-2xl font-bold animate-slideUp"
              style={{ color: "var(--color-success)" }}
            >
              🎉 Player {gameState.winner} wins!
            </div>
          ) : gameState.isDraw ? (
            <div
              className="text-2xl font-bold animate-slideUp"
              style={{ color: "var(--color-text-muted)" }}
            >
              It's a draw!
            </div>
          ) : (
            <div
              className="text-xl"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Current turn:{" "}
              <span
                className="font-bold"
                style={{
                  color:
                    gameState.currentPlayer === "X"
                      ? "var(--color-primary)"
                      : "#f87171",
                }}
              >
                Player {gameState.currentPlayer}
              </span>
            </div>
          )}
        </div>

        {/* SVG Board */}
        <svg
          viewBox="0 0 300 300"
          className="w-full max-w-md mb-8 animate-fadeIn"
          style={{ filter: "drop-shadow(0 4px 12px var(--color-shadow))" }}
        >
          {/* Grid lines */}
          <line
            x1="100"
            y1="0"
            x2="100"
            y2="300"
            stroke="var(--color-border)"
            strokeWidth="2"
          />
          <line
            x1="200"
            y1="0"
            x2="200"
            y2="300"
            stroke="var(--color-border)"
            strokeWidth="2"
          />
          <line
            x1="0"
            y1="100"
            x2="300"
            y2="100"
            stroke="var(--color-border)"
            strokeWidth="2"
          />
          <line
            x1="0"
            y1="200"
            x2="300"
            y2="200"
            stroke="var(--color-border)"
            strokeWidth="2"
          />

          {/* Cells */}
          {gameState.board.map((cell, index) => {
            const row = Math.floor(index / 3);
            const col = index % 3;
            const x = col * 100 + 50;
            const y = row * 100 + 50;
            const isWinningCell = winningLine?.includes(index);

            return (
              <g key={index}>
                {/* Invisible clickable area */}
                <rect
                  x={col * 100}
                  y={row * 100}
                  width="100"
                  height="100"
                  fill="transparent"
                  onClick={() => handleCellClick(index)}
                  style={{ cursor: cell ? "default" : "pointer" }}
                  className="hover:opacity-80 transition-opacity"
                />

                {/* X mark */}
                {cell === "X" && (
                  <g className="animate-fadeIn">
                    <line
                      x1={x - 25}
                      y1={y - 25}
                      x2={x + 25}
                      y2={y + 25}
                      stroke={isWinningCell ? "var(--color-success)" : "var(--color-primary)"}
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <line
                      x1={x + 25}
                      y1={y - 25}
                      x2={x - 25}
                      y2={y + 25}
                      stroke={isWinningCell ? "var(--color-success)" : "var(--color-primary)"}
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* O mark */}
                {cell === "O" && (
                  <circle
                    cx={x}
                    cy={y}
                    r="25"
                    fill="none"
                    stroke={isWinningCell ? "var(--color-success)" : "#f87171"}
                    strokeWidth="6"
                    className="animate-fadeIn"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Controls */}
        <div className="flex gap-4">
          <button
            onClick={resetGame}
            className="px-6 py-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "#ffffff",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-primary-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-primary)")
            }
          >
            New Game
          </button>
          <button
            onClick={resetScores}
            className="px-6 py-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-input)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Reset Scores
          </button>
        </div>
      </div>
    </div>
  );
}