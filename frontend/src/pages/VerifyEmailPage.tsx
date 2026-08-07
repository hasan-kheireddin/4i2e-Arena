import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { verifyEmail, resendOTP } from "../services/auth";
import type { ApiError } from "../services/api";
import { Link } from "react-router-dom";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleDigitChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError("");

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when last digit filled
    if (index === 5 && char) {
      const code = [...next].join("");
      if (code.length === 6) submitCode(code);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      submitCode(pasted);
    }
  };

  const submitCode = async (code: string) => {
    if (!email) {
      setError(t("verify_email.email_not_found"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await verifyEmail({ email, code });
      setUser(res.user);
      navigate("/home");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.detail ?? t("verify_email.invalid_code"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < 6) {
      setError(t("verify_email.enter_all_digits"));
      return;
    }
    submitCode(code);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    try {
      await resendOTP(email);
      setResendCooldown(60);
      setError("");
    } catch {
      setError(t("verify_email.resend_failed"));
    }
  };

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="max-w-md w-full px-6">


      {/* Back Home */}
    <div className="mb-6">
      <Link
        to="/register"
        className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--color-text-muted)" }}
      >
        ← {t("Back to Register Page", "Back to Register Page")}
      </Link>
    </div>


        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(99,102,241,0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                style={{ color: "var(--color-primary)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("verify_email.check_email")}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("verify_email.sent_code_to")}
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: "var(--color-text-primary)" }}>
            {email}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm text-center"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "var(--color-error)",
              border: "1px solid var(--color-border-error)",
            }}
          >
            {error}
          </div>
        )}

        {/* OTP input */}
        <form onSubmit={handleSubmit}>
          <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-lg focus:outline-none"
                style={{
                  border: `2px solid ${error ? "var(--color-border-error)" : d ? "var(--color-primary)" : "var(--color-border)"}`,
                  backgroundColor: "var(--color-bg-input)",
                  color: "var(--color-text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.boxShadow = "0 0 0 2px var(--color-border-focus)")
                }
                onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || digits.join("").length < 6}
            className="w-full font-medium py-3.5 rounded-lg transition-colors duration-200"
            style={{
              backgroundColor:
                loading || digits.join("").length < 6
                  ? "var(--color-primary-disabled)"
                  : "var(--color-primary)",
              color: "#ffffff",
            }}
            onMouseEnter={(e) => {
              if (!loading && digits.join("").length === 6)
                e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
            }}
            onMouseLeave={(e) => {
              if (!loading && digits.join("").length === 6)
                e.currentTarget.style.backgroundColor = "var(--color-primary)";
            }}
          >
            {loading ? t("loading.verifying") : t("verify_email.verify_btn")}
          </button>
        </form>

        {/* Resend */}
        <p className="text-center text-sm mt-6" style={{ color: "var(--color-text-muted)" }}>
          {t("forgot.didnt_receive")}{" "}
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "var(--color-text-link)" }}
          >
            {resendCooldown > 0 ? t("verify_email.resend_in", { count: resendCooldown }) : t("forgot.resend")}
          </button>
        </p>
      </div>
    </div>
  );
}
