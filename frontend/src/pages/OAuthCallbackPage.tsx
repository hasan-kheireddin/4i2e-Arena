import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const provider = searchParams.get("provider"); // e.g., 'google' or '42'

      if (!code || !state) {
        setError("Invalid callback parameters");
        return;
      }

      try {
        // TODO: Call your backend OAuth callback endpoint
        // const response = await fetch(`/api/auth/oauth/${provider}/callback?code=${code}&state=${state}`);
        // const data = await response.json();
        
        // For now, simulate success
        // Replace this with actual API call when backend is ready
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Mock successful login
        // In production, use the actual user data from the backend response
        login({
          id: 1,
          username: "oauth_user",
          email: "oauth@example.com",
        });

        navigate("/");
      } catch (err) {
        console.error("OAuth callback error:", err);
        setError("Authentication failed. Please try again.");
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  if (error) {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="text-center max-w-md px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            Authentication Failed
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
            {error}
          </p>

          <button
            onClick={() => navigate("/login")}
            className="px-6 py-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "#ffffff",
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="text-center">
        {/* Loading spinner */}
        <div
          className="w-16 h-16 border-4 rounded-full animate-spin mx-auto mb-4"
          style={{
            borderColor: "var(--color-border)",
            borderTopColor: "var(--color-primary)",
          }}
        />
        <p className="text-lg" style={{ color: "var(--color-text-secondary)" }}>
          Completing authentication...
        </p>
      </div>
    </div>
  );
}