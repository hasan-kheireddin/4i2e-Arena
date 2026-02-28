import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import reset from "../images/loginimg.png";
import resetDark from "../images/loginimgDark.png";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { apiFetch } from "../services/api";
import type { ApiError } from "../services/api";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [serverError, setServerError] = useState("");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const validate = () => {
    const newErrors = { password: "", confirmPassword: "" };
    let valid = true;

    if (!formData.password) {
      newErrors.password = t("errors.password_required", "Password is required");
      valid = false;
    } else if (formData.password.length < 10) {
      newErrors.password = "Password must be at least 10 characters";
      valid = false;
    } else if (!/[A-Z]/.test(formData.password)) {
      newErrors.password = "Password must contain at least one uppercase letter";
      valid = false;
    } else if (!/[a-z]/.test(formData.password)) {
      newErrors.password = "Password must contain at least one lowercase letter";
      valid = false;
    } else if (!/\d/.test(formData.password)) {
      newErrors.password = "Password must contain at least one digit";
      valid = false;
    } else if (!/[^a-zA-Z0-9]/.test(formData.password)) {
      newErrors.password = "Password must contain at least one special character";
      valid = false;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t("errors.confirm_password_required", "Please confirm your password");
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t("errors.passwords_not_match", "Passwords do not match");
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
    setServerError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError("");

    try {
      // Backend endpoint for password reset confirmation
      // POST /api/accounts/password-reset/confirm/ — validates token + sets new password
      await apiFetch("/password-reset/confirm/", {
        method: "POST",
        body: {
          token,
          password: formData.password,
          password2: formData.confirmPassword,
        },
        auth: false,
      });
      navigate("/login");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.fieldErrors?.password) {
        setErrors({ ...errors, password: apiErr.fieldErrors.password[0] });
      } else {
        setServerError(apiErr.detail ?? "Failed to reset password. The link may have expired.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Invalid or expired token
  if (!token) {
    return (
      <div className="h-screen w-screen flex overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden lg:flex w-full h-full">
          {/* Form side - full height */}
          <div
            className="flex-1 flex flex-col justify-center px-16 overflow-y-auto "
            style={{ backgroundColor: "var(--color-bg)" }}
          >
            <div className="max-w-md mx-auto w-full py-12">
              <InvalidTokenContent navigate={navigate} t={t} />
            </div>
          </div>

          {/* Image side - full height */}
          <div className="w-[45%] flex-shrink-0 h-full ">
            <img
              src={isDark ? resetDark : reset}
              alt="Sport"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Mobile/Tablet layout */}
        <div className="flex lg:hidden flex-col w-full h-full overflow-y-auto">
          <div
            className="flex-1 flex items-center justify-center px-6 py-10"
            style={{ backgroundColor: "var(--color-bg)" }}
          >
            <div className="max-w-md w-full">
              <InvalidTokenContent navigate={navigate} t={t} />
            </div>
          </div>

          <div className="h-64 w-full flex-shrink-0">
            <img
              src={isDark ? resetDark : reset}
              alt="Sport"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* ─────────────────────────────────────────
          DESKTOP LAYOUT  (lg and above)
          Left: form (full height) | Right: image (full height)
      ───────────────────────────────────────── */}
      <div className="hidden lg:flex w-full h-full">
        {/* Form side - full height */}
        <div
          className="flex-1 flex flex-col justify-center px-16 overflow-y-auto animate-slideInLeft"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-md mx-auto w-full py-12">
            <FormContent
              formData={formData}
              errors={errors}
              serverError={serverError}
              loading={loading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              showConfirmPassword={showConfirmPassword}
              setShowConfirmPassword={setShowConfirmPassword}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              t={t}
            />
          </div>
        </div>

        {/* Image side - full height */}
        <div className="w-[45%] flex-shrink-0 h-full animate-slideInRight">
          <img
            src={isDark ? resetDark : reset}
            alt="Sport"
            className="w-full h-full object-cover"
          />
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
              formData={formData}
              errors={errors}
              serverError={serverError}
              loading={loading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              showConfirmPassword={showConfirmPassword}
              setShowConfirmPassword={setShowConfirmPassword}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
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
  formData: {
    password: string;
    confirmPassword: string;
  };
  errors: {
    password: string;
    confirmPassword: string;
  };
  loading: boolean;
  serverError: string;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPassword: boolean;
  setShowConfirmPassword: React.Dispatch<React.SetStateAction<boolean>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  t: (key: string, fallback?: string) => string;
}

function FormContent({
  formData,
  errors,
  loading,
  showPassword,
  serverError,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  handleChange,
  handleSubmit,
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
          {t("reset.title", "Set New Password")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("reset.subtitle", "Your new password must be different from previously used passwords")}
        </p>
      </div>

      {/* Server error banner */}
      {serverError && (
        <div
          className="mb-4 p-3 rounded-lg text-sm text-center"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--color-error)",
            border: "1px solid var(--color-border-error)",
          }}
        >
          {serverError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Password */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("reset.password", "New Password")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-lg px-4 py-3 pr-11 text-sm transition-colors focus:outline-none"
              style={{
                border: `1px solid ${errors.password ? "var(--color-border-error)" : "var(--color-border)"}`,
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 0 0 2px var(--color-border-focus)")
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
              style={{ color: "var(--color-text-muted)" }}
            >
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.password}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("reset.confirm_password", "Confirm New Password")}
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full rounded-lg px-4 py-3 pr-11 text-sm transition-colors focus:outline-none"
              style={{
                border: `1px solid ${errors.confirmPassword ? "var(--color-border-error)" : "var(--color-border)"}`,
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 0 0 2px var(--color-border-focus)")
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
              style={{ color: "var(--color-text-muted)" }}
            >
              {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.confirmPassword}
            </p>
          )}
          {!errors.confirmPassword && formData.password && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>
              {t("reset.password_length", "Must be at least 10 characters long")}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full font-medium py-3.5 rounded-lg transition-colors duration-200 mt-2"
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
          {loading ? "Resetting..." : t("reset.submit", "Reset password")}
        </button>
      </form>
    </>
  );
}

/* ─────────────────────────────────────────────────
   Invalid token content
───────────────────────────────────────────────── */
interface InvalidTokenContentProps {
  navigate: (path: string) => void;
  t: (key: string, fallback?: string) => string;
}

function InvalidTokenContent({ navigate, t }: InvalidTokenContentProps) {
  return (
    <div className="text-center">
      {/* Error icon */}
      <div className="mb-6 flex justify-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-error)", opacity: 0.2 }}
        >
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "var(--color-error)" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      </div>

      <h1
        className="text-3xl font-bold mb-3"
        style={{ color: "var(--color-text-primary)" }}
      >
        {t("reset.invalid_title", "Invalid Link")}
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>
        {t("reset.invalid_message", "This password reset link is invalid or has expired. Please request a new one.")}
      </p>

      <button
        onClick={() => navigate("/forgot-password")}
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
        {t("reset.request_new", "Request new link")}
      </button>
    </div>
  );
}