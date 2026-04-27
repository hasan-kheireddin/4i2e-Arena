import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function TermsOfServicePage() {
  const { t } = useTranslation();

  const accountItems = [
    "accounts_accurate",
    "accounts_responsibility",
    "accounts_sharing",
    "accounts_prohibited",
  ] as const;

  const acceptableUseItems = [
    "use_cheating",
    "use_bots",
    "use_exploit",
    "use_harassment",
    "use_unfair",
    "use_reverse",
  ] as const;

  const enforcementItems = [
    "enforcement_suspend",
    "enforcement_cheating",
    "enforcement_discretion",
  ] as const;

  const gameplayItems = ["gameplay_ranked", "gameplay_bugs", "gameplay_disclaimer"] as const;
  const warrantyItems = ["warranty_as_is", "warranty_no_guarantee"] as const;

  const liabilityItems = [
    "liability_downtime",
    "liability_loss",
    "liability_bugs",
    "liability_indirect",
  ] as const;

  const ipItems = ["ip_owned", "ip_no_copy", "ip_no_reverse"] as const;

  const thirdPartyItems = [
    "third_party_42",
    "third_party_not_responsible",
    "third_party_refer",
  ] as const;

  return (
    <div style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <div
        className="w-full py-8 border-b"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{t("terms_of_service.title")}</h1>
          <p style={{ color: "var(--color-text-muted)" }} className="text-sm">
            {t("terms_of_service.last_updated")}
          </p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 md:px-8 py-12">
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.intro_title")}</h2>
          <p className="text-lg leading-relaxed mb-4" style={{ color: "var(--color-text-secondary)" }}>
            {t("terms_of_service.intro")}
          </p>
          <p className="leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            {t("terms_of_service.ownership")}
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.eligibility_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t("terms_of_service.eligibility_age")}</li>
            <li>{t("terms_of_service.eligibility_minor")}</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.accounts_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {accountItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.use_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {acceptableUseItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.enforcement_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {enforcementItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.gameplay_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {gameplayItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.warranty_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {warrantyItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.liability_title")}</h2>
          <p style={{ color: "var(--color-text-secondary)" }} className="mb-3">
            {t("terms_of_service.liability_not_responsible")}
          </p>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {liabilityItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.ip_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {ipItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.third_party_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            {thirdPartyItems.map((item) => (
              <li key={item}>{t(`terms_of_service.${item}`)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.availability_title")}</h2>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t("terms_of_service.availability_modify")}</li>
            <li>{t("terms_of_service.availability_no_uptime")}</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.termination_title")}</h2>
          <p style={{ color: "var(--color-text-secondary)" }} className="mb-3">
            {t("terms_of_service.termination_right")}
          </p>
          <ul style={{ color: "var(--color-text-secondary)" }} className="list-disc list-inside space-y-2 ml-2">
            <li>{t("terms_of_service.termination_violation")}</li>
            <li>{t("terms_of_service.termination_other")}</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.governing_title")}</h2>
          <p style={{ color: "var(--color-text-secondary)" }}>{t("terms_of_service.governing_law")}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.changes_title")}</h2>
          <p style={{ color: "var(--color-text-secondary)" }}>{t("terms_of_service.changes_notice")}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("terms_of_service.contact_title")}</h2>
          <p style={{ color: "var(--color-text-secondary)" }} className="mb-3">
            {t("terms_of_service.contact_text")}
          </p>
          <div
            className="p-4 rounded-lg mt-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p style={{ color: "var(--color-text-secondary)" }}>
              <a
                href="mailto:hakcathonthon@gmail.com"
                style={{ color: "var(--color-primary)" }}
                className="hover:opacity-80"
              >
                {t("terms_of_service.contact_email")}
              </a>
            </p>
          </div>
        </section>

        <hr style={{ borderColor: "var(--color-border)", margin: "2rem 0" }} />

        <div className="mt-10 mb-6">
          <Link to="/" style={{ color: "var(--color-primary)" }} className="hover:opacity-80">
            {t("terms_of_service.back_home")}
          </Link>
        </div>
      </main>

      <footer
        style={{
          backgroundColor: "var(--color-bg)",
          borderTop: "1px solid var(--color-border)",
          marginTop: "3rem",
        }}
      >
        <div className="max-w-3xl mx-auto px-6 md:px-8 py-8">
          <p style={{ color: "var(--color-text-muted)" }} className="text-sm text-center">
            {t("terms_of_service.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}