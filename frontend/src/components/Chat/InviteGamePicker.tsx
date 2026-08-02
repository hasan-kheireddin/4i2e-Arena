interface InviteGamePickerProps {
  onSelect: (gameType: string) => void;
  onCancel: () => void;
}

export default function InviteGamePicker({ onSelect, onCancel }: InviteGamePickerProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-4 mx-4 shadow-2xl" style={{ backgroundColor: "var(--color-bg-card)" }}>
        <p className="text-sm font-medium mb-3" style={{ color: "var(--color-text-primary)" }}>Choose a game</p>
        <div className="flex flex-col gap-2">
          {["pong", "pong3d", "tictactoe"].map((g) => (
            <button
              key={g}
              onClick={() => onSelect(g)}
              className="px-4 py-2 rounded text-xs font-medium text-white text-left"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {g === "pong3d" ? "Pong 3D" : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded text-xs"
            style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
