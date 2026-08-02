import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import registerImgDark from "../images/registerimgDark.jpg";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
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
    agreeTerms: false,
    agreePrivacy: false,
  });

  const [errors, setErrors] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeTerms: "",
    agreePrivacy: "",
  });

  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const validate = () => {
    const newErrors = {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      agreeTerms: "",
      agreePrivacy: "",
    };
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

    if (!formData.agreeTerms) {
      newErrors.agreeTerms = t(
        "register.terms_required",
        "You must agree to the terms and conditions"
      );
      valid = false;
    }

    if (!formData.agreePrivacy) {
      newErrors.agreePrivacy = t(
        "register.privacy_required",
        "You must agree to the privacy policy"
      );
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
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
    <div className="relative h-screen w-screen flex overflow-hidden">
      <div className="absolute top-4 z-20" style={{ insetInlineEnd: '1rem' }}>
        <LanguageSwitcher />
      </div>
      {/* ─────────────────────────────────────────
          DESKTOP LAYOUT  (lg and above)
          Left: image (full height) | Right: form (full height)
      ───────────────────────────────────────── */}
      <div className="hidden lg:flex w-full h-full">
        {/* Image side - full height */}
        <div className="w-[45%] flex-shrink-0 h-full animate-slideInLeft">
          <img
            src={registerImgDark}
            alt={t("register.hero_image_alt", "Sports arena illustration")}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Form side - full height */}
        <div
          className="flex-1 flex flex-col justify-center px-8 xl:px-12 overflow-y-auto animate-slideInRight"
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
    agreeTerms: boolean;
    agreePrivacy: boolean;
  };
  errors: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    agreeTerms: string;
    agreePrivacy: string;
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
      <div className="mb-6 text-center">
        <h1
          className="text-3xl font-bold mb-2"
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          name="username"
          value={formData.username}
          onChange={handleChange}
          label={t("register.username", "Username")}
          placeholder={t("register.username_placeholder", "myusername")}
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
          placeholder={t("register.email_placeholder", "m@example.com")}
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
                aria-label={showPassword ? t("register.hide_password", "Hide password") : t("register.show_password", "Show password")}
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
              aria-label={showConfirmPassword ? t("register.hide_password", "Hide password") : t("register.show_password", "Show password")}
            >
              {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          }
        />

        <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <input
            type="checkbox"
            name="agreeTerms"
            checked={formData.agreeTerms}
            onChange={handleChange}
            className="mt-0.5 h-4 w-4 rounded border"
            style={{ accentColor: "var(--color-text-link)" }}
          />
          <span>
            {t("register.agree_terms_prefix")}{" "}
            <Link
              to="/terms-of-service"
              className="font-medium hover:underline"
              style={{ color: "var(--color-text-link)" }}
            >
              {t("register.agree_terms_link")}
            </Link>
          </span>
        </label>
        {errors.agreeTerms && (
          <p className="text-sm" style={{ color: "var(--color-error)" }}>
            {errors.agreeTerms}
          </p>
        )}

        <label className="flex items-start gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <input
            type="checkbox"
            name="agreePrivacy"
            checked={formData.agreePrivacy}
            onChange={handleChange}
            className="mt-0.5 h-4 w-4 rounded border"
            style={{ accentColor: "var(--color-text-link)" }}
          />
          <span>
            {t("register.agree_privacy_prefix")}{" "}
            <Link
              to="/privacy-policy"
              className="font-medium hover:underline"
              style={{ color: "var(--color-text-link)" }}
            >
              {t("register.agree_privacy_link")}
            </Link>
          </span>
        </label>
        {errors.agreePrivacy && (
          <p className="text-sm" style={{ color: "var(--color-error)" }}>
            {errors.agreePrivacy}
          </p>
        )}
      </div>

        {/* Submit */}
        <Button
          type="submit"
          loading={loading}
          disabled={!formData.agreeTerms || !formData.agreePrivacy}
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
