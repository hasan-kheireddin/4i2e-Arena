import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import resetDark from "../images/loginimgDark.png";
import { EyeIcon, EyeOffIcon } from "../components/icons/Eyeicons";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { confirmPasswordReset } from "../services/auth";
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
  const validate = () => {
    const newErrors = { password: "", confirmPassword: "" };
    let valid = true;

    if (!formData.password) {
      newErrors.password = t("errors.password_required", "Password is required");
      valid = false;
    } else if (formData.password.length < 10) {
      newErrors.password = t("errors.password_min_length");
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
      await confirmPasswordReset({
        token: token!,
        password: formData.password,
        password2: formData.confirmPassword,
      });
      navigate("/login");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.fieldErrors?.password) {
        setErrors({ ...errors, password: apiErr.fieldErrors.password[0] });
      } else {
        setServerError(apiErr.detail ?? t("errors.reset_failed"));
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
                src={resetDark}
                alt={t("reset.hero_image_alt")}
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
              src={resetDark}
              alt={t("reset.hero_image_alt")}
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
            src={resetDark}
            alt={t("reset.hero_image_alt")}
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
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {serverError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          type={showPassword ? "text" : "password"}
          name="password"
          value={formData.password}
          onChange={handleChange}
          label={t("reset.password", "New Password")}
          error={errors.password}
          autoComplete="new-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="rounded-md p-0.5 text-muted transition-colors hover:text-primary focus:outline-none"
                aria-label={showPassword ? t("reset.hide_password") : t("reset.show_password")}
            >
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          }
        />

        {/* Confirm Password */}
        <Input
          type={showConfirmPassword ? "text" : "password"}
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          label={t("reset.confirm_password", "Confirm New Password")}
          error={errors.confirmPassword}
          hint={
            !errors.confirmPassword && formData.password
              ? t("reset.password_length", "Must be at least 10 characters long")
              : undefined
          }
          autoComplete="new-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="rounded-md p-0.5 text-muted transition-colors hover:text-primary focus:outline-none"
                aria-label={showConfirmPassword ? t("reset.hide_password") : t("reset.show_password")}
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
          {t("reset.submit", "Reset password")}
        </Button>
      </form>
    </>
  );
}

/* ─────────────────────────────────────────────────
   Invalid token content
───────────────────────────────────────────────── */
interface InvalidTokenContentProps {
  navigate: (path: string) => void;
  t: TFunction;
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

      <Button
        onClick={() => navigate("/forgot-password")}
        className="inline-flex px-8"
      >
        {t("reset.request_new", "Request new link")}
      </Button>
    </div>
  );
}
