import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface HistoryBackButtonProps {
  label: string;
}

export default function HistoryBackButton({ label }: HistoryBackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    const historyIndex = window.history.state?.idx;

    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-opacity hover:opacity-80"
      style={{
        color: "var(--color-primary)",
        border: "1px solid var(--color-primary)",
      }}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4 icon-directional" />
      {label}
    </button>
  );
}
