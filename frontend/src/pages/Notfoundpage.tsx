import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="text-center px-6">
        <h1
          className="text-6xl font-bold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          404
        </h1>
        <p
          className="text-xl mb-8"
          style={{ color: "var(--color-text-muted)" }}
        >
          Page not found
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 rounded-lg font-medium transition-colors"
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
          Go Home
        </Link>
      </div>
    </div>
  );
}