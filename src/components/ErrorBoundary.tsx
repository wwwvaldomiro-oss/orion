import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Ocorreu um erro inesperado.",
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          friendly = `Erro de banco de dados (${parsed.operationType ?? "operação"} em ${parsed.path ?? "coleção"}): ${parsed.error}`;
        }
      } catch {
        // plain error message
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-6 text-[#0c1928]">
          <div className="w-full max-w-lg rounded-2xl border border-[#dce2e6] bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3 text-[#dc2626]">
              <AlertTriangle className="size-6 shrink-0" />
              <h1 className="font-serif text-xl font-semibold text-[#0c1928]">
                Algo interrompeu esta visualização
              </h1>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#52616a] break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <RotateCcw className="size-4" /> Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
