import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import loginImg from "../images/loginimg.png";
import loginImgDark from "../images/loginimgDark.png";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { login as apiLogin, isTwoFARequired, oauthInitiate } from "../services/auth";
import type { ApiError } from "../services/api";

export default function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    const newErrors = { username: "", password: "" };
    let valid = true;

    if (!formData.username) {
      newErrors.username = t("errors.username_required", "Username or email is required");
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = t("errors.password_required", "Password is required");
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
      const res = await apiLogin({
        username: formData.username,
        password: formData.password,
      });

      if (isTwoFARequired(res)) {
        // Redirect to 2FA verification with temp token
        navigate(`/verify-2fa?temp=${encodeURIComponent(res.temp_token)}`);
      } else {
        setUser(res.user);
        navigate("/home");
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.detail) {
        setServerError(apiErr.detail);
      } else if (apiErr.fieldErrors) {
        const newErrors = { ...errors };
        if (apiErr.fieldErrors.username) newErrors.username = apiErr.fieldErrors.username[0];
        if (apiErr.fieldErrors.password) newErrors.password = apiErr.fieldErrors.password[0];
        setErrors(newErrors);
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handle42Login = async () => {
    try {
      const { authorize_url } = await oauthInitiate("42");
      sessionStorage.setItem("oauth_provider", "42");
      window.location.href = authorize_url;
    } catch {
      setServerError("Failed to initiate 42 login. Please try again.");
    }
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
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              handle42Login={handle42Login}
              t={t}
            />
          </div>
        </div>

        {/* Image side - full height */}
        <div className="w-[45%] flex-shrink-0 h-full animate-slideInRight">
          <img
            src={isDark ? loginImgDark : loginImg}
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
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              handle42Login={handle42Login}
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
  formData: { username: string; password: string };
  errors: { username: string; password: string };
  serverError: string;
  loading: boolean;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handle42Login: () => void;
  t: (key: string, fallback?: string) => string;
}

function FormContent({
  formData,
  errors,
  serverError,
  loading,
  showPassword,
  setShowPassword,
  handleChange,
  handleSubmit,
  handle42Login,
  t,
}: FormProps) {
  return (
    <>
      {/* Back to landing */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--color-text-muted)" }}
        >
          ← {t("login.back_home", "Back to Home")}
        </Link>
      </div>

      {/* Title */}
      <div className="mb-8 text-center">
        <h1
          className="text-4xl font-bold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("login.title", "Welcome Back")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("login.subtitle", "Enter your username or email below to login to your account")}
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

      {/* 42 OAuth button */}
      <button
        onClick={handle42Login}
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
        <span className="text-lg font-bold">42</span>
        {t("login.42", "Login with 42")}
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
        {/* Username or Email */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("login.username", "Username or Email")}
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="username or m@example.com"
            className="w-full rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none"
            style={{
              border: `1px solid ${errors.username ? "var(--color-border-error)" : "var(--color-border)"}`,
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.boxShadow =
                "0 0 0 2px var(--color-border-focus)")
            }
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {errors.username && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.username}
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
          {loading ? t("loading.logging_in", "Logging in...") : t("login.submit", "Log in")}
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

