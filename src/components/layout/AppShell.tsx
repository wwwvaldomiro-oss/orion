import { useState, type ReactNode } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CarFront,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogos";
import { useOrion } from "@/store/orionContext";

const FINANCE_NAV = [
  { to: "/painel", label: "Painel Financeiro", icon: LayoutDashboard },
  { to: "/receitas", label: "Receitas & Contratos", icon: TrendingUp },
  { to: "/despesas", label: "Despesas", icon: TrendingDown },
  { to: "/carteira", label: "Carteira", icon: Wallet },
  { to: "/cotacoes", label: "Bolsa & Moedas", icon: LineChart },
];

const PERSONAL_NAV = [
  { to: "/agenda", label: "Agenda (Brasília)", icon: CalendarDays },
  { to: "/compras", label: "Lista de Compras", icon: ClipboardList },
  { to: "/veiculos", label: "Garagem & Viagens", icon: CarFront },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, signOutUser } = useOrion();
  const location = useLocation();

  const renderGroup = (title: string, items: typeof FINANCE_NAV) => (
    <div className="space-y-1">
      <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-[0.09em] text-[#9eb2bd]">
        {title}
      </div>
      {items.map((item) => {
        const active =
          location.pathname === item.to ||
          (item.to !== "/painel" && location.pathname.startsWith(item.to));
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            data-active={active}
            className="orion-nav-link flex items-center gap-3 px-3 py-2 text-sm whitespace-nowrap"
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Link to="/painel" onClick={onNavigate} className="block px-1 pt-1">
        <BrandLogo logoId={state.profile.selectedLogoId} tone="light" />
      </Link>

      <nav aria-label="Menu principal" className="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
        {renderGroup("Controle financeiro", FINANCE_NAV)}
        {renderGroup("Organização pessoal", PERSONAL_NAV)}
      </nav>

      <div className="mt-4 space-y-1.5 border-t border-white/15 pt-4">
        <NavLink
          to="/perfil"
          onClick={onNavigate}
          data-active={location.pathname === "/perfil"}
          className="orion-nav-link flex items-center gap-3 px-3 py-2 text-sm whitespace-nowrap"
        >
          {state.profile.photoUrl ? (
            <img
              src={state.profile.photoUrl}
              alt={state.profile.name}
              referrerPolicy="no-referrer"
              className="size-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <UserRound className="size-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-white">{state.profile.name}</div>
            <div className="truncate text-[11px] text-white/70">
              {state.profile.city} · {state.profile.state}
            </div>
          </div>
        </NavLink>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-xs font-medium text-[#9eb2bd] transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-3.5 shrink-0" />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[#f7f8fa] text-[#0c1928]">
      {/* Desktop Sidebar */}
      <aside className="orion-sidebar no-print hidden w-72 shrink-0 flex-col p-5 md:sticky md:top-0 md:flex md:h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="no-print fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-[#0c1928]/60 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="orion-sidebar relative z-10 flex w-72 max-w-[85vw] flex-col p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#dce2e6] bg-white/90 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#dce2e6] text-[#0c1928] hover:bg-[#f0f3f5] md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="orion-page-title truncate text-xl font-semibold text-[#0c1928] md:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 truncate text-xs text-[#52616a]">{subtitle}</p>
              )}
            </div>
          </div>

          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 md:p-8 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Quick Bar */}
      <nav
        aria-label="Navegação rápida"
        className="no-print fixed right-0 bottom-0 left-0 z-30 grid grid-cols-4 border-t border-[#dce2e6] bg-white/95 px-2 py-1.5 backdrop-blur-md md:hidden"
      >
        {[
          { to: "/painel", label: "Painel", icon: LayoutDashboard },
          { to: "/receitas", label: "Receitas", icon: TrendingUp },
          { to: "/despesas", label: "Despesas", icon: TrendingDown },
          { to: "/agenda", label: "Agenda", icon: CalendarDays },
        ].map((item) => {
          const active =
            location.pathname === item.to ||
            (item.to !== "/painel" && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${
                active ? "bg-[#edf1f3] text-[#173d4a]" : "text-[#52616a]"
              }`}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
