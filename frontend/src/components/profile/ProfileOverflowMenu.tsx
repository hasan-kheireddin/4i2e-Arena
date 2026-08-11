import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import ChatAvatar from "@/components/Chat/ChatAvatar";
import { IconBlock, IconDotsHorizontal } from "@/components/Chat/ChatIcons";
import { useBlocks } from "@/context/BlockContext";
import { useFriendships } from "@/context/FriendshipContext";
import { useToast } from "@/context/ToastContext";

interface ProfileOverflowMenuProps {
  userId: string;
  username: string;
  displayName?: string;
}

/**
 * The "…" that sits beside the display name on someone else's profile: the
 * quiet and destructive actions live here rather than competing with Add Friend
 * / Message for attention.
 */
export default function ProfileOverflowMenu({ userId, username, displayName }: ProfileOverflowMenuProps) {
  const { t } = useTranslation();
  const { block } = useBlocks();
  const { refresh: refreshFriendships } = useFriendships();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const name = displayName || username;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirming(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [confirming]);

  const copyLink = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/profile/${userId}`);
      showToast({ title: t("profile.link_copied"), variant: "success", duration: 2000 });
    } catch {
      showToast({ title: t("profile.link_copy_failed"), variant: "info", duration: 2500 });
    }
  };

  const confirmBlock = async () => {
    setBusy(true);
    await block(userId);
    // Blocking deletes the friendship server-side, so pull the fresh list.
    refreshFriendships();
    setBusy(false);
    setConfirming(false);
    showToast({ title: t("profile.blocked_toast", { name }), variant: "info", duration: 2500 });
  };

  return (
    <>
      <div ref={ref} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("profile.more_options")}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
          style={{
            backgroundColor: open ? "var(--color-bg-hover)" : "transparent",
            color: open ? "var(--color-text-primary)" : "var(--color-text-muted)",
          }}
        >
          <IconDotsHorizontal size={18} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl py-1 text-start animate-scale-in"
            style={{
              insetInlineStart: 0,
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 24px 60px -18px var(--color-shadow)",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void copyLink()}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-text-primary)" }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  focusable="false"
                >
                  <path d="M10 13.5a3.5 3.5 0 0 0 5.1.4l3-3a3.5 3.5 0 0 0-5-5l-1.7 1.7" />
                  <path d="M14 10.5a3.5 3.5 0 0 0-5.1-.4l-3 3a3.5 3.5 0 0 0 5 5l1.7-1.7" />
                </svg>
              </span>
              {t("profile.copy_link")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setConfirming(true); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-danger)" }}
            >
              <span style={{ color: "var(--color-danger)" }}>
                <IconBlock size={15} />
              </span>
              {username ? t("profile.block_named", { username }) : t("profile.block")}
            </button>
          </div>
        )}
      </div>

      {confirming && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          onClick={() => !busy && setConfirming(false)}
        >
          <div className="absolute inset-0 bg-base/85 backdrop-blur-sm animate-fade-in" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("profile.block_title", { name })}
            className="relative z-10 w-full max-w-[340px] rounded-2xl p-6 text-center animate-scale-in"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 32px 96px -28px var(--color-shadow)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3.5 flex justify-center">
              <div className="relative">
                <ChatAvatar name={name} size={64} />
                <span
                  className="absolute -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white"
                  style={{
                    insetInlineEnd: "-0.15rem",
                    backgroundColor: "var(--color-danger)",
                    border: "2px solid var(--color-bg-elevated)",
                  }}
                >
                  <IconBlock size={12} />
                </span>
              </div>
            </div>

            <p className="text-[15px] font-bold text-primary">{t("profile.block_title", { name })}</p>
            <ul className="mx-auto mt-3 space-y-1.5 text-start text-[12px] leading-relaxed text-muted">
              {[
                t("profile.block_point_reach"),
                t("profile.block_point_friends"),
                t("profile.block_point_silent"),
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span
                    className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--color-text-muted)" }}
                  />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-muted">{t("profile.block_undo_hint")}</p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmBlock()}
                className="flex-1 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                {t("profile.block")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg px-4 py-2 text-[12.5px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {t("profile.cancel")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
