import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Toast from "../components/Toast";
import { twoFASetup, twoFAConfirm } from "../services/auth";
import type { ApiError } from "../services/api";

export default function Setup2FAPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [step, setStep] = useState<"qr" | "verify">("qr");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);

  // Data from backend
  const [qrCodeData, setQrCodeData] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Fetch 2FA setup data from backend on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSetup() {
      try {
        const data = await twoFASetup();
        if (cancelled) return;
        setQrCodeData(data.qr_code);
        setSecretKey(data.secret);
        setBackupCodes(data.recovery_codes);
      } catch (err: unknown) {
        if (cancelled) return;
        const apiErr = err as ApiError;
        setError(apiErr.detail ?? "Failed to initialize 2FA setup. Please try again.");
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    }

    fetchSetup();
    return () => { cancelled = true; };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setShowToast(true);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError(t("errors.code_length", "Please enter a 6-digit code"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      await twoFAConfirm(code);
      navigate("/home");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.detail ?? "Invalid code. Please try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-screen w-screen flex items-center justify-center overflow-y-auto p-6"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Toast notification */}
      {showToast && (
        <Toast
          message={t("2fa.copied", "Copied to clipboard!")}
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="max-w-lg w-full">
        {setupLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mb-4" style={{ borderColor: "var(--color-primary)" }} />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {t("2fa.loading", "Setting up two-factor authentication...")}
            </p>
          </div>
        ) : step === "qr" ? (
          <>
            {/* QR Code Step */}
            <div className="mb-8 text-center">
              <h1
                className="text-4xl font-bold mb-3"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t("2fa.setup_title", "Enable Two-Factor Authentication")}
              </h1>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {t("2fa.setup_subtitle", "Scan the QR code with your authenticator app")}
              </p>
            </div>

            {/* QR Code */}
            <div
              className="p-6 rounded-lg mb-6"
              style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg mb-4">
                  <img src={qrCodeData} alt="QR Code" className="w-48 h-48" />
                </div>
                <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                  {t("2fa.cant_scan", "Can't scan the code?")}
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="px-3 py-2 rounded text-sm font-mono"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {secretKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(secretKey)}
                    className="px-3 py-2 rounded text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      color: "var(--color-text-link)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {t("2fa.copy", "Copy")}
                  </button>
                </div>
              </div>
            </div>

            {/* Backup Codes */}
            <div
              className="p-6 rounded-lg mb-6"
              style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
            >
              <h2
                className="text-lg font-bold mb-3"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t("2fa.backup_codes_title", "Backup Codes")}
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
                {t("2fa.backup_codes_subtitle", "Save these codes in a safe place. You can use them to access your account if you lose your device.")}
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="px-3 py-2 rounded text-xs font-mono text-center"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {code}
                  </code>
                ))}
              </div>
              <button
                onClick={() => copyToClipboard(backupCodes.join("\n"))}
                className="w-full px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  color: "var(--color-text-link)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {t("2fa.copy_all", "Copy all codes")}
              </button>
            </div>

            {/* Continue */}
            <button
              onClick={() => setStep("verify")}
              className="w-full font-medium py-3.5 rounded-lg transition-colors duration-200"
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
              {t("2fa.continue", "Continue")}
            </button>
          </>
        ) : (
          <>
            {/* Verify Step */}
            <div className="mb-8 text-center">
              <h1
                className="text-4xl font-bold mb-3"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t("2fa.verify_setup_title", "Verify Setup")}
              </h1>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {t("2fa.verify_setup_subtitle", "Enter the 6-digit code from your authenticator app to complete setup")}
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {t("2fa.verification_code", "Verification Code")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setCode(val);
                    setError("");
                  }}
                  placeholder="000000"
                  className="w-full rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-widest transition-colors focus:outline-none"
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
                {loading ? t("loading.verifying", "Verifying...") : t("2fa.enable", "Enable 2FA")}
              </button>

              <button
                type="button"
                onClick={() => setStep("qr")}
                className="w-full text-sm transition-colors hover:underline"
                style={{ color: "var(--color-text-muted)" }}
              >
                {t("2fa.back", "Back")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}