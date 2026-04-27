import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { t } = useTranslation();

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
          {t("not_found.message")}
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
          {t("not_found.go_home")}
        </Link>
      </div>
    </div>
  );
}
