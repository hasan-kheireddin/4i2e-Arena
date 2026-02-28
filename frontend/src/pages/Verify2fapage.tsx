import { useState, useRef, KeyboardEvent, ClipboardEvent, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import verify from "../images/loginimg.png";
import verifyDark from "../images/loginimgDark.png";
import { twoFAVerify, twoFARecovery } from "../services/auth";
import type { ApiError } from "../services/api";

export default function Verify2FAPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searchParams] = useSearchParams();
  const tempToken = searchParams.get("temp") || "";
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const [isDark, setIsDark] = useState(() => {
      const saved = localStorage.getItem("darkMode");
      return saved !== null ? saved === "true" : true;
    });
  
    useEffect(() => {
      const observer = new MutationObserver(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
      });
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      return () => observer.disconnect();
    }, []);

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Backspace - move to previous input
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = [...code];
    
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    
    setCode(newCode);
    setError("");
    
    // Focus the next empty input or last input
    const nextEmptyIndex = newCode.findIndex(val => !val);
    if (nextEmptyIndex !== -1) {
      inputRefs.current[nextEmptyIndex]?.focus();
    } else {
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeString = code.join("");

    if (codeString.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }
    if (!tempToken) {
      setError("Missing temporary token. Please log in again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await twoFAVerify({ temp_token: tempToken, code: codeString });
      setUser(res.user);
      navigate("/");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.detail ?? "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryCode.trim()) {
      setError("Please enter a recovery code");
      return;
    }

    if (!tempToken) {
      setError("Missing temporary token. Please log in again.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await twoFARecovery({ temp_token: tempToken, code: recoveryCode.trim() });
      setUser(res.user);
      navigate("/");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.detail ?? "Invalid recovery code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* ─────────────────────────────────────────
          DESKTOP LAYOUT  (lg and above)
          Left: image (full height) | Right: form (full height)
      ───────────────────────────────────────── */}
      <div className="hidden lg:flex w-full h-full">
        {/* Image side - full height */}
        <div className="w-[45%] flex-shrink-0 h-full animate-slideInLeft">
          <img
            src={isDark ? verifyDark : verify}
            alt="Sport"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Form side - full height */}
        <div
          className="flex-1 flex flex-col justify-center px-16 overflow-y-auto animate-slideInRight"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-md mx-auto w-full py-12">
            <FormContent
              code={code}
              error={error}
              loading={loading}
              inputRefs={inputRefs}
              handleChange={handleChange}
              handleKeyDown={handleKeyDown}
              handlePaste={handlePaste}
              handleSubmit={handleSubmit}
              useRecovery={useRecovery}
              setUseRecovery={setUseRecovery}
              recoveryCode={recoveryCode}
              setRecoveryCode={setRecoveryCode}
              handleRecoverySubmit={handleRecoverySubmit}
              navigate={navigate}
              t={t}
            />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────
          MOBILE + TABLET LAYOUT  (below lg)
          Single column: form on top, image below
      ───────────────────────────────────────── */}
      <div className="flex lg:hidden flex-col w-full h-full overflow-y-auto">
        {/* Form */}
        <div
          className="flex-1 flex items-center justify-center px-6 py-10"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-md w-full">
            <FormContent
              code={code}
              error={error}
              loading={loading}
              inputRefs={inputRefs}
              handleChange={handleChange}
              handleKeyDown={handleKeyDown}
              handlePaste={handlePaste}
              handleSubmit={handleSubmit}
              useRecovery={useRecovery}
              setUseRecovery={setUseRecovery}
              recoveryCode={recoveryCode}
              setRecoveryCode={setRecoveryCode}
              handleRecoverySubmit={handleRecoverySubmit}
              navigate={navigate}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Form content
───────────────────────────────────────────────── */
interface FormContentProps {
  code: string[];
  error: string;
  loading: boolean;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  handleChange: (index: number, value: string) => void;
  handleKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  useRecovery: boolean;
  setUseRecovery: (val: boolean) => void;
  recoveryCode: string;
  setRecoveryCode: (val: string) => void;
  handleRecoverySubmit: (e: React.FormEvent) => void;
  navigate: (path: string) => void;
  t: (key: string, fallback?: string) => string;
}

function FormContent({
  code,
  error,
  loading,
  inputRefs,
  handleChange,
  handleKeyDown,
  handlePaste,
  handleSubmit,
  useRecovery,
  setUseRecovery,
  recoveryCode,
  setRecoveryCode,
  handleRecoverySubmit,
  navigate,
  t,
}: FormContentProps) {
  return (
    <>
      {/* Title */}
      <div className="mb-8 text-center">
        <h1
          className="text-4xl font-bold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("2fa.verify_title", "Two-Factor Authentication")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {useRecovery
            ? t("2fa.recovery_subtitle", "Enter one of your recovery codes")
            : t("2fa.verify_subtitle", "Enter the 6-digit code from your authenticator app")}
        </p>
      </div>

      {useRecovery ? (
        /* Recovery code form */
        <form onSubmit={handleRecoverySubmit} className="space-y-6">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("2fa.recovery_code", "Recovery Code")}
            </label>
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full rounded-lg px-4 py-3 text-sm font-mono tracking-wide transition-colors focus:outline-none"
              style={{
                border: `1px solid ${error ? "var(--color-border-error)" : "var(--color-border)"}`,
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 0 0 2px var(--color-border-focus)")
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            />
            {error && (
              <p className="text-sm mt-2 text-center" style={{ color: "var(--color-error)" }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-medium py-3.5 rounded-lg transition-colors duration-200"
            style={{
              backgroundColor: loading
                ? "var(--color-primary-disabled)"
                : "var(--color-primary)",
              color: "#ffffff",
            }}
          >
            {loading ? "Verifying..." : t("2fa.verify_recovery", "Verify Recovery Code")}
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setUseRecovery(false)}
              className="text-sm transition-colors hover:underline"
              style={{ color: "var(--color-text-link)" }}
            >
              {t("2fa.use_totp", "Use authenticator app instead")}
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* TOTP Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
        {/* 6-digit code input */}
        <div>
          <div className="flex gap-3 justify-center">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className="w-12 h-14 text-center text-2xl font-bold rounded-lg transition-colors focus:outline-none"
                style={{
                  border: `2px solid ${error ? "var(--color-border-error)" : "var(--color-border)"}`,
                  backgroundColor: "var(--color-bg-input)",
                  color: "var(--color-text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.boxShadow =
                    "0 0 0 2px var(--color-border-focus)")
                }
                onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
              />
            ))}
          </div>
          {error && (
            <p className="text-sm mt-3 text-center" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full font-medium py-3.5 rounded-lg transition-colors duration-200"
          style={{
            backgroundColor: loading
              ? "var(--color-primary-disabled)"
              : "var(--color-primary)",
            color: "#ffffff",
          }}
          onMouseEnter={(e) => {
            if (!loading)
              e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
          }}
          onMouseLeave={(e) => {
            if (!loading)
              e.currentTarget.style.backgroundColor = "var(--color-primary)";
          }}
        >
          {loading ? "Verifying..." : t("2fa.verify_submit", "Verify")}
        </button>
      </form>

      {/* Use recovery code */}
      <div className="mt-6 text-center">
        <button
          onClick={() => setUseRecovery(true)}
          disabled={loading}
          className="text-sm transition-colors hover:underline"
          style={{ color: "var(--color-text-link)" }}
        >
          {t("2fa.use_recovery", "Lost your device? Use a recovery code")}
        </button>
      </div>
      </>
      )}

      {/* Back to login */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("/login")}
          className="text-sm transition-colors hover:underline"
          style={{ color: "var(--color-text-muted)" }}
        >
          {t("2fa.back_to_login", "Back to login")}
        </button>
      </div>
    </>
  );
}