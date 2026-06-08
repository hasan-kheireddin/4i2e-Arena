import { useRef, useState } from "react";
import { EMOTES } from "../../assets/emotes/emotes";
import { playEmoteSound, playEmoteMp3 } from "../../assets/emotes/sound";

interface FloatingEmoteData {
  id: number;
  emoji: string;
  webp?: string;
  color: string;
  soundFreq: number;
  soundDuration: number;
  side: "left" | "right";
  x: number;
  y: number;
  username?: string;
}

const EMOTE_LIFETIME = 2500;

export function useFloatingEmotes() {
  const [emotes, setEmotes] = useState<FloatingEmoteData[]>([]);
  const nextId = useRef(0);

  const addEmote = (emoteId: string, slot: number, username?: string) => {
    const def = EMOTES.find((e) => e.id === emoteId);
    if (!def) return;
    const id = nextId.current++;
    const side = slot === 1 ? "left" : "right";
    const newEmote: FloatingEmoteData = {
      id,
      emoji: def.emoji,
      webp: def.webp,
      color: def.color,
      soundFreq: def.soundFreq,
      soundDuration: def.soundDuration,
      side,
      username,
      x: side === "left" ? 30 + Math.random() * 20 : 50 + Math.random() * 20,
      y: 20 + Math.random() * 60,
    };
    if (def.mp3) playEmoteMp3(def.mp3);
    else playEmoteSound(def.soundFreq, def.soundDuration);
    setEmotes((prev) => [...prev, newEmote]);
    setTimeout(() => {
      setEmotes((prev) => prev.filter((e) => e.id !== id));
    }, EMOTE_LIFETIME);
  };

  const addSpectatorEmote = (emoteId: string, teamSide: number) => {
    const def = EMOTES.find((e) => e.id === emoteId);
    if (!def) return;
    const id = nextId.current++;
    const isLeft = teamSide === 1;
    const newEmote: FloatingEmoteData = {
      id,
      emoji: def.emoji,
      webp: def.webp,
      color: def.color,
      soundFreq: def.soundFreq,
      soundDuration: def.soundDuration,
      side: isLeft ? "left" : "right",
      x: isLeft ? 2 + Math.random() * 10 : 88 + Math.random() * 10,
      y: 10 + Math.random() * 80,
    };
    setEmotes((prev) => [...prev, newEmote]);
    setTimeout(() => {
      setEmotes((prev) => prev.filter((e) => e.id !== id));
    }, EMOTE_LIFETIME);
  };

  return { emotes, addEmote, addSpectatorEmote };
}

interface FloatingEmoteOverlayProps {
  emotes: FloatingEmoteData[];
  flipped?: boolean;
}

export default function FloatingEmoteOverlay({ emotes, flipped }: FloatingEmoteOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
      {emotes.map((emote) => {
        const dispSide = flipped ? (emote.side === "left" ? "right" : "left") : emote.side;
        const dispX = flipped ? 100 - emote.x : emote.x;
        return (
          <div
            key={emote.id}
            className="absolute animate-floating-emote flex flex-col items-center"
            style={{
              left: `${dispX}%`,
              top: `${emote.y}%`,
              animation: "float-up 2.5s ease-out forwards",
            }}
          >
            {emote.webp ? (
              <img src={emote.webp} alt="" className="w-24 h-24" style={{ imageRendering: "auto" }} />
            ) : (
              <span style={{ fontSize: "3rem", lineHeight: 1 }}>{emote.emoji}</span>
            )}
            {emote.username && (
              <span
                className="text-[10px] font-medium mt-0.5 whitespace-nowrap opacity-70"
                style={{ color: dispSide === "left" ? "#3B82F6" : "#EF4444" }}
              >
                {emote.username}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
