import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import registerImg from "../images/registerimg.png";

export default function RegisterPage() {
  const { login } = useAuth();
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

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validate = () => {
    const newErrors = { username: "", email: "", password: "", confirmPassword: "" };
    let valid = true;

    if (!formData.username) {
      newErrors.username = "Username is required";
      valid = false;
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
      valid = false;
    } else if (formData.username.length > 30) {
      newErrors.username = "Username must be at most 30 characters";
      valid = false;
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(formData.username)) {
      newErrors.username = "Username must start with a letter and contain only letters, numbers, underscores, and hyphens";
      valid = false;
    }

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
      newErrors.confirmPassword = "Please confirm your password";
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
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
    // When integrating with backend, send:
    // { username: formData.username, email: formData.email, password: formData.password, password2: formData.confirmPassword }
    login({ id: 1, username: formData.username, email: formData.email });
    navigate("/");
    setLoading(false);
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
            src={registerImg}
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
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  handleChange,
  handleSubmit,
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
          {t("register.title", "Create an account")}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("register.username", "Username")}
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="myusername"
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
          {!errors.username && formData.username && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>
              {t("register.username_hint", "8-30 characters. Letters, numbers, underscores, and hyphens only.")}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("register.email", "Email")}
          </label>
          <input
            type="email"
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
              {t("register.password", "Password")}
            </label>
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
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.password}
            </p>
          )}
          {!errors.password && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>
              {t("register.password_length", "Min 10 chars with uppercase, lowercase, digit, and special character.")}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("register.confirm_password", "Confirm Password")}
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
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs mt-1.5" style={{ color: "var(--color-error)" }}>
              {errors.confirmPassword}
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
          {loading ? "Creating account..." : t("register.submit", "Get started")}
        </button>
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