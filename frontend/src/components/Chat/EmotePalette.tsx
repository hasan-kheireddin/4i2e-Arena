import { useTranslation } from "react-i18next";
import { EMOTES, type EmoteDef } from "../../assets/emotes/emotes";
import { playEmoteMp3, playEmoteSound } from "../../assets/emotes/sound";

interface EmotePaletteProps {
  onEmote: (emote: EmoteDef) => void;
  inline?: boolean;
}

export default function EmotePalette({ onEmote, inline }: EmotePaletteProps) {
  const { t } = useTranslation();
  if (inline) {
    return (
      <div className="flex flex-wrap gap-2 p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
        <p className="w-full text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>{t("chat.send_emote")}</p>
        <div className="flex flex-wrap gap-1.5">
          {EMOTES.map((emote) => (
            <button
              key={emote.id}
              onClick={() => {
                if (emote.mp3) { playEmoteMp3(emote.mp3); } else { playEmoteSound(emote.soundFreq, emote.soundDuration); }
                onEmote(emote);
              }}
              title={emote.label}
              className="w-10 h-10 flex items-center justify-center rounded-lg transition-transform hover:scale-125 active:scale-90 cursor-pointer"
              style={{ backgroundColor: `${emote.color}20` }}
            >
              {emote.webp ? (
                <img src={emote.webp} alt={emote.label} className="w-10 h-10" />
              ) : (
                <span className="text-xl">{emote.emoji}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-16 left-0 right-0 z-50 p-3 rounded-xl shadow-xl"
      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex flex-wrap gap-1.5">
        {EMOTES.map((emote) => (
          <button
            key={emote.id}
            onClick={() => {
              if (emote.mp3) { playEmoteMp3(emote.mp3); } else { playEmoteSound(emote.soundFreq, emote.soundDuration); }
              onEmote(emote);
            }}
            title={emote.label}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-transform hover:scale-125 active:scale-90 cursor-pointer"
            style={{ backgroundColor: `${emote.color}20` }}
          >
            {emote.webp ? (
              <img src={emote.webp} alt={emote.label} className="w-9 h-9" />
            ) : (
              <span className="text-lg">{emote.emoji}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
