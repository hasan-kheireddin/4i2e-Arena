import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import registerImg from "../images/registerimg.png";
import registerImgDark from "../images/registerimgDark.png";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { register as apiRegister } from "../services/auth";
import type { ApiError } from "../services/api";
import type { RegisterResponse } from "../services/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [serverError, setServerError] = useState("");
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
    const newErrors = { username: "", email: "", password: "", confirmPassword: "" };
    let valid = true;

    if (!formData.username) {
      newErrors.username = t("errors.username_required", "Username is required");
      valid = false;
    } else if (formData.username.length < 8) {
      newErrors.username = t("errors.username_min_length", "Username must be at least 8 characters");
      valid = false;
    } else if (formData.username.length > 30) {
      newErrors.username = t("errors.username_max_length");
      valid = false;
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(formData.username)) {
      newErrors.username = t("errors.username_format");
      valid = false;
    }

    if (!formData.email) {
      newErrors.email = t("errors.email_required", "Email is required");
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = t("errors.email_invalid", "Email is invalid");
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = t("errors.password_required", "Password is required");
      valid = false;
    } else if (formData.password.length < 10) {
      newErrors.password = t("errors.password_min_length", "Password must be at least 10 characters");
      valid = false;
    } else if (!/[A-Z]/.test(formData.password)) {
      newErrors.password = t("errors.password_uppercase");
      valid = false;
    } else if (!/[a-z]/.test(formData.password)) {
      newErrors.password = t("errors.password_lowercase");
      valid = false;
    } else if (!/\d/.test(formData.password)) {
      newErrors.password = t("errors.password_digit");
      valid = false;
    } else if (!/[^a-zA-Z0-9]/.test(formData.password)) {
      newErrors.password = t("errors.password_special");
      valid = false;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t("errors.confirm_password_required");
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t("errors.passwords_not_match");
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
      const res: RegisterResponse = await apiRegister({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        password2: formData.confirmPassword,
      });
      if (res.requires_verification) {
        navigate(`/verify-email?email=${encodeURIComponent(res.email)}`);
        return;
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.detail) {
        setServerError(apiErr.detail);
      } else if (apiErr.fieldErrors) {
        const newErrors = { ...errors };
        if (apiErr.fieldErrors.username) newErrors.username = apiErr.fieldErrors.username[0];
        if (apiErr.fieldErrors.email) newErrors.email = apiErr.fieldErrors.email[0];
        if (apiErr.fieldErrors.password) newErrors.password = apiErr.fieldErrors.password[0];
        if (apiErr.fieldErrors.password2) newErrors.confirmPassword = apiErr.fieldErrors.password2[0];
        setErrors(newErrors);
      } else {
        setServerError(t("errors.unexpected"));
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
            src={isDark ? registerImgDark : registerImg}
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
   Shared form content — used in both layouts
───────────────────────────────────────────────── */
interface FormProps {
  formData: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  errors: {
    username: string;
    email: string;
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
  t: TFunction;
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
          {t("register.title", "Create an account")}
        </h1>
      </div>
      {/* Server error banner */}
      {serverError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {serverError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          type="text"
          name="username"
          value={formData.username}
          onChange={handleChange}
          label={t("register.username", "Username")}
          placeholder="myusername"
          error={errors.username}
          hint={
            formData.username && !errors.username
              ? t("register.username_hint", "8-30 characters, letters and numbers only")
              : undefined
          }
          autoComplete="username"
        />

        {/* Email */}
        <Input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          label={t("register.email", "Email")}
          placeholder="m@example.com"
          error={errors.email}
          autoComplete="email"
        />

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("register.password", "Password")}
            </label>
          </div>
          <Input
            type={showPassword ? "text" : "password"}
            name="password"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            hint={!errors.password ? t("register.password_length", "Must be at least 10 characters long.") : undefined}
            autoComplete="new-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="rounded-md p-0.5 text-muted transition-colors hover:text-primary focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            }
          />
        </div>

        {/* Confirm Password */}
        <Input
          type={showConfirmPassword ? "text" : "password"}
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          label={t("register.confirm_password", "Confirm Password")}
          error={errors.confirmPassword}
          autoComplete="new-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="rounded-md p-0.5 text-muted transition-colors hover:text-primary focus:outline-none"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          }
        />

        {/* Submit */}
        <Button
          type="submit"
          loading={loading}
          className="mt-2 w-full"
        >
          {t("register.submit", "Get started")}
        </Button>
      </form>

      {/* Login link */}
      <p className="text-center text-sm mt-6" style={{ color: "var(--color-text-muted)" }}>
        {t("register.have_account", "Already have an account?")}{" "}
        <Link
          to="/login"
          className="font-medium hover:underline"
          style={{ color: "var(--color-text-link)" }}
        >
          {t("register.log_in", "Log in")}
        </Link>
      </p>
    </>
  );
}
