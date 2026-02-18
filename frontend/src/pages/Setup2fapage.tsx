import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Setup2FAPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [step, setStep] = useState<"qr" | "verify">("qr");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [backupCodes] = useState([
    "ABCD-1234-EFGH-5678",
    "IJKL-9012-MNOP-3456",
    "QRST-7890-UVWX-1234",
    "YZAB-5678-CDEF-9012",
    "GHIJ-3456-KLMN-7890",
    "OPQR-1234-STUV-5678",
  ]);

  // Fake QR code data (in real app, this comes from backend)
  const qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/ft_transcendence:nathan@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ft_transcendence";
  const secretKey = "JBSWY3DPEHPK3PXP";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    // TODO: replace with real API call
    await new Promise((r) => setTimeout(r, 800));
    
    // Simulate validation
    if (code === "123456") {
      navigate("/");
    } else {
      setError("Invalid code. Please try again.");
      setCode("");
    }
    setLoading(false);
  };

  return (
    <div
      className="h-screen w-screen flex items-center justify-center overflow-y-auto p-6"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="max-w-lg w-full">
        {step === "qr" ? (
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
                  <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
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
                {loading ? "Verifying..." : t("2fa.enable", "Enable 2FA")}
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