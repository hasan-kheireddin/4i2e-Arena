export interface EmoteDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  soundFreq: number;
  soundDuration: number;
  webp?: string;
  mp3?: string;
}

export const EMOTES: EmoteDef[] = [
  { id: "laugh",      label: "Laugh",      emoji: "😂", color: "#FCD34D", soundFreq: 880,  soundDuration: 0.40, webp: "/emotes/laugh.webp", mp3: "/emotes/laugh.mp3" },
  { id: "cry",        label: "Cry",        emoji: "😭", color: "#60A5FA", soundFreq: 440,  soundDuration: 0.60, webp: "/emotes/cry.webp", mp3: "/emotes/cry.mp3" },
  { id: "angry",      label: "Angry",      emoji: "😤", color: "#EF4444", soundFreq: 220,  soundDuration: 0.50, webp: "/emotes/angry.webp", mp3: "/emotes/angry.mp3" },
  { id: "love",       label: "Love",       emoji: "❤️", color: "#F472B6", soundFreq: 1047, soundDuration: 0.30, webp: "/emotes/love.webp", mp3: "/emotes/love.mp3" },
  { id: "wow",        label: "Wow",        emoji: "😮", color: "#A78BFA", soundFreq: 660,  soundDuration: 0.35, webp: "/emotes/wow.webp", mp3: "/emotes/wow.mp3" },
  { id: "thumbsup",   label: "Thumbs Up",  emoji: "👍", color: "#34D399", soundFreq: 523,  soundDuration: 0.25, webp: "/emotes/thumbsup.webp", mp3: "/emotes/thumbsup.mp3" },
  { id: "celebrate",  label: "Celebrate",  emoji: "🥳", color: "#FBBF24", soundFreq: 1319, soundDuration: 0.35, webp: "/emotes/celebrate.webp", mp3: "/emotes/celebrate.mp3" },
  { id: "smirk",      label: "Smirk",      emoji: "😏", color: "#FB923C", soundFreq: 587,  soundDuration: 0.30, webp: "/emotes/smirk.webp", mp3: "/emotes/smirk.mp3" },
  { id: "clown",      label: "Clown",      emoji: "🤡", color: "#F43F5E", soundFreq: 300,  soundDuration: 0.50, webp: "/emotes/clown.webp", mp3: "/emotes/clown.mp3" },
  { id: "sleep",      label: "Sleep",      emoji: "😴", color: "#818CF8", soundFreq: 180,  soundDuration: 0.70, webp: "/emotes/sleep.webp", mp3: "/emotes/sleep.mp3" },
  { id: "cool",       label: "Cool",       emoji: "😎", color: "#06B6D4", soundFreq: 698,  soundDuration: 0.28, webp: "/emotes/cool.webp", mp3: "/emotes/cool.mp3" },
  { id: "dance",      label: "Dance",      emoji: "💃", color: "#EC4899", soundFreq: 523,  soundDuration: 0.40, webp: "/emotes/dance.webp", mp3: "/emotes/dance.mp3" },
  { id: "evil2",      label: "Evil",       emoji: "😈", color: "#A855F7", soundFreq: 660,  soundDuration: 0.35, webp: "/emotes/evil2.webp", mp3: "/emotes/evil2.mp3" },
];
