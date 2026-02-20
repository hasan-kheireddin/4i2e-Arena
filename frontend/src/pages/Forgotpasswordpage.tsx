import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../services/api";
import type { ApiError } from "../services/api";
import loginImg from "../images/loginimg.png";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    if (!email) {
      setError("Email is required");
      return false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Email is invalid");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError("");

    try {
      // Backend endpoint for password reset request
      // POST /api/accounts/password-reset/ — sends email with reset link
      await apiFetch("/password-reset/", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      // Even if user not found, some backends still return 200 for security
      if (apiErr.status === 404) {
        // Show success anyway to prevent email enumeration
        setSubmitted(true);
      } else {
        setError(apiErr.detail ?? "Failed to send reset email. Please try again.");
      }
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
            src={loginImg}
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
            {submitted ? <SuccessContent email={email} setSubmitted={setSubmitted} t={t} /> : <FormContent email={email} setEmail={setEmail} error={error} setError={setError} loading={loading} handleSubmit={handleSubmit} t={t} />}
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
            {submitted ? <SuccessContent email={email} setSubmitted={setSubmitted} t={t} /> : <FormContent email={email} setEmail={setEmail} error={error} setError={setError} loading={loading} handleSubmit={handleSubmit} t={t} />}
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
  email: string;
  setEmail: (email: string) => void;
  error: string;
  setError: (error: string) => void;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  t: (key: string, fallback?: string) => string;
}

function FormContent({ email, setEmail, error, setError, loading, handleSubmit, t }: FormContentProps) {
  return (
    <>
      {/* Title */}
      <div className="mb-8 text-center">
        <h1
          className="text-4xl font-bold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("forgot.title", "Forgot Password?")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("forgot.subtitle", "No worries, we'll send you reset instructions")}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("forgot.email", "Email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="m@example.com"
            className="w-full rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none"
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
            <p className="text-sm mt-2" style={{ color: "var(--color-error)" }}>
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
          onMouseEnter={(e) => {
            if (!loading)
              e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
          }}
          onMouseLeave={(e) => {
            if (!loading)
              e.currentTarget.style.backgroundColor = "var(--color-primary)";
          }}
        >
          {loading ? "Sending..." : t("forgot.submit", "Reset password")}
        </button>
      </form>

      {/* Back to login */}
      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-sm transition-colors hover:underline inline-flex items-center gap-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t("forgot.back_to_login", "Back to login")}
        </Link>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────
   Success content
───────────────────────────────────────────────── */
interface SuccessContentProps {
  email: string;
  setSubmitted: (submitted: boolean) => void;
  t: (key: string, fallback?: string) => string;
}

function SuccessContent({ email, setSubmitted, t }: SuccessContentProps) {
  return (
    <div className="text-center">
      {/* Success icon */}
      <div className="mb-6 flex justify-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-success)", opacity: 0.2 }}
        >
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "var(--color-success)" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h1
        className="text-3xl font-bold mb-3"
        style={{ color: "var(--color-text-primary)" }}
      >
        {t("forgot.success_title", "Check your email")}
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>
        {t("forgot.success_message", "We sent a password reset link to")} <strong>{email}</strong>
      </p>

      {/* Back to login */}
      <Link
        to="/login"
        className="inline-block font-medium py-3.5 px-8 rounded-lg transition-colors duration-200"
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
        {t("forgot.back_to_login", "Back to login")}
      </Link>

      {/* Resend */}
      <p className="text-sm mt-6" style={{ color: "var(--color-text-muted)" }}>
        {t("forgot.didnt_receive", "Didn't receive the email?")}{" "}
        <button
          onClick={() => setSubmitted(false)}
          className="font-medium hover:underline"
          style={{ color: "var(--color-text-link)" }}
        >
          {t("forgot.resend", "Click to resend")}
        </button>
      </p>
    </div>
  );
}