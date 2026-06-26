import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import loginImgDark from "../images/loginimgDark.png";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { clearPendingTwoFA, login as apiLogin, isTwoFARequired, oauthInitiate } from "../services/auth";
import { clearTokens } from "../services/api";
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
    clearPendingTwoFA();

    try {
      const res = await apiLogin({
        username: formData.username,
        password: formData.password,
      });

      if (isTwoFARequired(res)) {
        clearTokens();
        setUser(null);
        navigate("/verify-2fa");
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
        setServerError(t("errors.unexpected"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handle42Login = async () => {
    try {
      clearPendingTwoFA();
      const { authorize_url } = await oauthInitiate("42");
      sessionStorage.setItem("oauth_provider", "42");
      window.location.href = authorize_url;
    } catch {
      setServerError(t("errors.login_42_failed"));
    }
  };

  return (
    <div className="relative h-screen w-screen flex overflow-hidden">
      <div className="absolute top-4 z-20" style={{ insetInlineEnd: '1rem' }}>
        <LanguageSwitcher />
      </div>
      {/* ─────────────────────────────────────────
          DESKTOP LAYOUT  (lg and above)
          Left: form (full height) | Right: image (full height)
      ───────────────────────────────────────── */}
      <div className="hidden lg:flex w-full h-full">
        {/* Form side - full height */}
        <div
          className="flex-1 flex flex-col justify-center px-10 xl:px-14 overflow-y-auto animate-slideInLeft"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-sm mx-auto w-full py-8">
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
            alt={t("login.hero_image_alt", "Sports arena illustration")}
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
          className="flex-1 flex items-center justify-center px-5 py-8"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <div className="max-w-sm w-full">
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
  t: TFunction;
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
      <div className="mb-6 text-center">
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("login.title", "Welcome Back")}
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("login.subtitle", "Enter your username or email below to log in to your account")}
        </p>
      </div>
       {/* Server error banner */}
      {serverError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {serverError}
        </div>
      )}

      {/* 42 OAuth button */}
      <Button
        type="button"
        onClick={handle42Login}
        variant="secondary"
        className="mb-6 w-full"
        icon={<span className="text-lg font-bold leading-none">42</span>}
      >
        {t("login.42", "Log in with 42")}
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("login.or", "Or")}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          name="username"
          value={formData.username}
          onChange={handleChange}
          label={t("login.username", "Username or Email")}
          placeholder={t("login.username_placeholder", "username or m@example.com")}
          error={errors.username}
          autoComplete="username"
        />

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
          <Input
            type={showPassword ? "text" : "password"}
            name="password"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            autoComplete="current-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="rounded-md p-0.5 text-muted transition-colors hover:text-primary focus:outline-none"
                aria-label={showPassword ? t("login.hide_password", "Hide password") : t("login.show_password", "Show password")}
              >
                {showPassword ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            }
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          loading={loading}
          className="mt-2 w-full"
        >
          {t("login.submit", "Log in")}
        </Button>
      </form>

      {/* Register link */}
      <p className="text-center text-sm mt-6" style={{ color: "var(--color-text-muted)" }}>
        {t("login.no_account", "Don't have an account?")}{" "}
        <Link
          to="/register"
          className="font-medium hover:underline"
          style={{ color: "var(--color-text-link)" }}
        >
          {t("login.sign_up", "Register")}
        </Link>
      </p>
    </>
  );
}
