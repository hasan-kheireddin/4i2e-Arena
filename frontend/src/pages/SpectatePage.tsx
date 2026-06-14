import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../components/ui/Avatar";
import Renderer3D from "../components/Renderer3D/Renderer";
import EmotePalette from "../components/Chat/EmotePalette";
import FloatingEmoteOverlay, { useFloatingEmotes } from "../components/Chat/FloatingEmote";
import { useSpectatorSocket } from "../components/Spectate/useSpectatorSocket";

const FIELD_W = 800;
const FIELD_H = 387;
const ONLINE_FIELD_HEIGHT = 600;
const Y_SCALE = FIELD_H / ONLINE_FIELD_HEIGHT;

export default function SpectatePage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const side = searchParams.get("side") ? parseInt(searchParams.get("side")!) : null;

  const [players, setPlayers] = useState<Record<string, { username: string }>>({});
  const [ball, setBall] = useState({ x: FIELD_W / 2, y: FIELD_H / 2 });
  const [paddles, setPaddles] = useState({ 1: { y: FIELD_H / 2 }, 2: { y: FIELD_H / 2 } });
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [specCount, setSpecCount] = useState({ total: 0, side1: 0, side2: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const [joined, setJoined] = useState(false);
  const { emotes: floatingEmotes, addEmote, addSpectatorEmote } = useFloatingEmotes();

  const { status, join, sendEmote } = useSpectatorSocket({
    gameId: gameId!,
    side,
    onJoined: useCallback((data) => {
      setJoined(true);
      const info = data.game_info as Record<string, unknown>;
      if (info?.players) {
        setPlayers(info.players as Record<string, { username: string }>);
      }
    }, []),
    onGameState: useCallback((data) => {
      const ballData = data.ball as { x: number; y: number; vx: number; vy: number } | undefined;
      if (ballData) setBall({ x: ballData.x, y: ballData.y * Y_SCALE });
      const p1 = data.player1 as { paddle: { y: number }; score: number } | undefined;
      const p2 = data.player2 as { paddle: { y: number }; score: number } | undefined;
      if (p1) {
        setPaddles((prev) => ({ ...prev, 1: { y: p1.paddle.y * Y_SCALE } }));
        setScore((prev) => ({ ...prev, p1: p1.score }));
      }
      if (p2) {
        setPaddles((prev) => ({ ...prev, 2: { y: p2.paddle.y * Y_SCALE } }));
        setScore((prev) => ({ ...prev, p2: p2.score }));
      }
    }, []),
    onGameOver: useCallback((data) => {
      setGameOver(true);
      const fs = data.final_state as { player1?: { score: number }; player2?: { score: number } } | undefined;
      if (fs?.player1 && fs?.player2) {
        setScore({ p1: fs.player1.score, p2: fs.player2.score });
      }
    }, []),
    onSpectatorCount: useCallback((counts) => setSpecCount(counts), []),
    onEmote: useCallback((data) => {
      if (data.side !== undefined) {
        addSpectatorEmote(data.emote_id as string, data.side as number);
      } else {
        addEmote(data.emote_id as string, (data.slot as number) || 0, data.sender_username as string | undefined);
      }
    }, [addEmote, addSpectatorEmote]),
  });

  useEffect(() => {
    if (status === "open" && !joined && gameId) {
      join();
    }
  }, [status, joined, gameId, join]);

  const sideLabel = side === 1 ? "Blue" : side === 2 ? "Red" : "Neutral";
  const p1Label = players["1"]?.username || t("pong.player1");
  const p2Label = players["2"]?.username || t("pong.player2");

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="max-w-[54rem] w-full space-y-4">
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <Avatar name={p1Label} size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: "#3B82F6" }}>{p1Label}</span>
            <span className="text-2xl font-bold font-mono" style={{ color: "#3B82F6" }}>{score.p1}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                👁️ <span style={{ color: "#3B82F6" }}>{specCount.side1}</span>
                <span style={{ color: "var(--color-text-muted)" }}>/</span>
                <span style={{ color: "#EF4444" }}>{specCount.side2}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "var(--color-bg-input)", color: side === 1 ? "#3B82F6" : side === 2 ? "#EF4444" : "var(--color-text-muted)" }}>
                {sideLabel}
              </span>
            </div>
            <span className="text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>
              Spectator · WS: {status}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: "#EF4444" }}>{score.p2}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: "#EF4444" }}>{p2Label}</span>
            <Avatar name={p2Label} size="sm" />
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
          <div style={{ width: "100%", aspectRatio: `${FIELD_W}/${FIELD_H}` }}>
            <Renderer3D
              ball={ball}
              paddles={paddles}
              fieldWidth={FIELD_W}
              fieldHeight={FIELD_H}
              flipped={false}
            />
          </div>

          <FloatingEmoteOverlay emotes={floatingEmotes} />

          {showEmotes && (
            <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-4">
              <EmotePalette
                onEmote={(emote) => {
                  sendEmote(emote.id);
                  setShowEmotes(false);
                }}
              />
            </div>
          )}

          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "rgba(10,14,26,0.85)", backdropFilter: "blur(8px)" }}>
              <h2 className="text-4xl font-extrabold" style={{ color: "var(--color-text-primary)" }}>Game Over</h2>
              <p className="text-2xl font-mono font-bold" style={{ color: "var(--color-text-primary)" }}>{score.p1} — {score.p2}</p>
              <button onClick={() => navigate("/")} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: "var(--color-bg-card)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}>
                Back Home
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Watching {p1Label} vs {p2Label}
          </span>
          <button
            onClick={() => setShowEmotes(!showEmotes)}
            className="px-3 py-1.5 rounded-lg text-lg"
            style={{
              backgroundColor: showEmotes ? "var(--color-primary)" : "var(--color-bg-input)",
              border: "1px solid var(--color-border)",
            }}
          >
            😂 React
          </button>
        </div>
      </div>
    </div>
  );
}
