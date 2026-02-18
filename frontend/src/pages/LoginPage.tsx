import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import loginImg from "../images/loginimg.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    const newErrors = { email: "", password: "" };
    let valid = true;

    if (!formData.email) {
      newErrors.email = "Email is required";
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
      valid = false;
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    // TODO: replace with real API call
    await new Promise((r) => setTimeout(r, 800));
    login({ id: 1, username: "nathan", email: formData.email });
    navigate("/");
    setLoading(false);
  };

  const handleGoogleLogin = () => {
    // TODO: replace with real backend OAuth URL
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* ─────────────────────────────────────────
          DESKTOP LAYOUT  (lg and above)
          Left: form (full height) | Right: image (full height)
      ───────────────────────────────────────── */}
      <div className="hidden lg:flex w-full h-full">
        {/* Form side - full height */}
        <div
          className="flex-1 flex flex-col justify-center px-16 overflow-y-auto"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-md mx-auto w-full py-12">
            <FormContent
              formData={formData}
              errors={errors}
              loading={loading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              handleGoogleLogin={handleGoogleLogin}
              t={t}
            />
          </div>
        </div>

        {/* Image side - full height */}
        <div className="w-[45%] flex-shrink-0 h-full">
          <img
            src={loginImg}
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
              loading={loading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              handleGoogleLogin={handleGoogleLogin}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Shared form content — used in both layouts
───────────────────────────────────────────────── */
interface FormProps {
  formData: { email: string; password: string };
  errors: { email: string; password: string };
  loading: boolean;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
  t: (key: string, fallback?: string) => string;
}

function FormContent({
  formData,
  errors,
  loading,
  showPassword,
  setShowPassword,
  handleChange,
  handleSubmit,
  handleGoogleLogin,
  t,
}: FormProps) {
  return (
    <>
      {/* Title */}
      <div className="mb-8 text-center">
        <h1
          className="text-4xl font-bold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("login.title", "Welcome Back")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("login.subtitle", "Enter your email below to login to your account")}
        </p>
      </div>

      {/* Google OAuth button */}
      <button
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 rounded-lg py-3 px-4 font-medium transition-colors duration-200 mb-6"
        style={{
          border: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
          backgroundColor: "var(--color-bg-input)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--color-bg-input)")
        }
      >
        <GoogleIcon />
        {t("login.google", "Login with Google")}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("login.or", "Or")}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("login.email", "Email")}
          </label>
          <input
            type="text"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="m@example.com"
            className="w-full rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none"
            style={{
              border: `1px solid ${errors.email ? "var(--color-border-error)" : "var(--color-border)"}`,
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.boxShadow =
                "0 0 0 2px var(--color-border-focus)")
            }
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {errors.email && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("login.password", "Password")}
            </label>
            <Link
              to="/forgot-password"
              className="text-sm transition-colors hover:underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              {t("login.forgot", "Forgot password?")}
            </Link>
          </div>
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
          {loading ? "Logging in..." : t("login.submit", "Log in")}
        </button>
      </form>

      {/* Register link */}
      <p className="text-center text-sm mt-6" style={{ color: "var(--color-text-muted)" }}>
        {t("login.no_account", "Don't have an account?")}{" "}
        <Link
          to="/register"
          className="font-medium hover:underline"
          style={{ color: "var(--color-text-link)" }}
        >
          {t("login.sign_up", "Sign up")}
        </Link>
      </p>
    </>
  );
}

/* Google icon SVG */
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/* Eye icon — password visible */
function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

/* Eye-off icon — password hidden */
function EyeOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}