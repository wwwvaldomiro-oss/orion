import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OrionProvider } from "@/store/orionStore";
import { useOrion } from "@/store/orionContext";
import { LoginPage } from "@/pages/LoginPage";
import { PainelPage } from "@/pages/PainelPage";
import { ReceitasPage } from "@/pages/ReceitasPage";
import { DespesasPage } from "@/pages/DespesasPage";
import { CarteiraPage } from "@/pages/CarteiraPage";
import { BolsaPage } from "@/pages/BolsaPage";
import { AgendaPage } from "@/pages/AgendaPage";
import { ComprasPage } from "@/pages/ComprasPage";
import { VeiculosPage } from "@/pages/VeiculosPage";
import { ViagensPage } from "@/pages/ViagensPage";
import { PerfilPage } from "@/pages/PerfilPage";
import { NotasFiscaisPage } from "@/pages/NotasFiscaisPage";
import { OrcamentoPage } from "@/pages/OrcamentoPage";
import { AgendaAlarmManager } from "@/components/agenda/AgendaAlarmManager";

function AppRoutes() {
  const { authReady, user } = useOrion();

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] text-[#0c1928] dark:bg-[#08121d] dark:text-slate-100">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#173d4a] border-t-transparent" />
          <p className="mt-3 text-xs font-medium text-[#52616a] dark:text-slate-400">
            Verificando sessão segura...
          </p>
        </div>
      </div>
    );
  }

  if (!user || !user.emailVerified) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/painel" replace />} />
      <Route path="/login" element={<Navigate to="/painel" replace />} />
      <Route path="/painel" element={<PainelPage />} />
      <Route path="/receitas" element={<ReceitasPage />} />
      <Route path="/despesas" element={<DespesasPage />} />
      <Route path="/orcamento" element={<OrcamentoPage />} />
      <Route path="/carteira" element={<CarteiraPage />} />
      <Route path="/notas-fiscais" element={<NotasFiscaisPage />} />
      <Route path="/cotacoes" element={<BolsaPage />} />
      <Route path="/agenda" element={<AgendaPage />} />
      <Route path="/compras" element={<ComprasPage />} />
      <Route path="/veiculos" element={<VeiculosPage />} />
      <Route path="/viagens" element={<ViagensPage />} />
      <Route path="/perfil" element={<PerfilPage />} />
      <Route path="*" element={<Navigate to="/painel" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <OrionProvider>
        <BrowserRouter>
          <AppRoutes />
          <AgendaAlarmManager />
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </OrionProvider>
    </ErrorBoundary>
  );
}

export default App;
