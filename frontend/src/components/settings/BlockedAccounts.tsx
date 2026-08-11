import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ChatAvatar from "@/components/Chat/ChatAvatar";
import { IconBlock, IconUnblock } from "@/components/Chat/ChatIcons";
import { useAuth } from "@/context/AuthContext";
import { useBlocks } from "@/context/BlockContext";
import { useFriendships } from "@/context/FriendshipContext";
import { useToast } from "@/context/ToastContext";

/**
 * Blocked accounts live in Settings rather than on the profile: the list is
 * private, rarely touched, and this is the only place to undo a block once the
 * other person's profile is out of reach.
 */
export default function BlockedAccounts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { blocks, unblock } = useBlocks();
  const { refresh: refreshFriendships } = useFriendships();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // `blocks` carries both directions; only the ones you made are yours to undo.
  const mine = blocks.filter((b) => b.blocker === user?.id);

  const handleUnblock = async (blockId: string, name: string) => {
    setBusyId(blockId);
    await unblock(blockId);
    refreshFriendships();
    setBusyId(null);
    showToast({ title: t("settings.privacy.unblocked", { name }), variant: "info", duration: 2500 });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-base font-semibold text-primary">
          {t("settings.privacy.blocked_title")}
        </h2>
        <p className="text-sm text-secondary">{t("settings.privacy.blocked_desc")}</p>
      </div>

      {mine.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-8 py-10 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
          >
            <IconBlock size={22} />
          </div>
          <p className="text-[13px] font-semibold text-primary">
            {t("settings.privacy.empty_title")}
          </p>
          <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
            {t("settings.privacy.empty_body")}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {mine.map((b) => {
            const name = b.blocked_display_name || b.blocked_username;
            return (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <ChatAvatar src={b.blocked_avatar} name={name} size={44} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${b.blocked}`)}
                    className="block max-w-full truncate text-start text-[13.5px] font-semibold text-primary hover:underline"
                  >
                    {name}
                  </button>
                  <p className="truncate text-[12px] text-muted">
                    {t("settings.privacy.blocked_on", {
                      date: new Date(b.created_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={() => void handleUnblock(b.id, name)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--color-bg-input)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <IconUnblock size={14} />
                  {t("settings.privacy.unblock")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
