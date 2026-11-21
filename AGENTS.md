<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Pluggy (Open Finance) calls run only in src/lib/pluggy.functions.ts server functions; per-user credential overrides live in pluggy_credentials (service-role only), falling back to PLUGGY_CLIENT_ID/SECRET env — keeps secrets off the browser.
- AppShell shares navigation between the desktop sidebar and a mobile Sheet drawer; close the drawer on navigation so every destination remains reachable.
- The /despesas parent renders its monthly page only on an exact match and otherwise renders Outlet, so annual and installment child pages can display independently.
- Revenue uses user-scoped Cloud records and transaction functions for receipts and contract creation; append-only receipt events preserve originals and audited corrections separately from expense history.
- RevenueWorkspace separates source registration, annual receivables, installment contracts and receipt history; all views reuse revenue records and receipt dialogs so expense records never enter revenue history.
- Contract installments are calculated in integer cents from total less down payment; the same plan helper validates browser previews and server creation to preserve totals.
- Contract detail lives at /contratos-receitas/$contractId and reuses revenue receipts; completion requires every installment to cover its agreed amount.
- Monetary correction for IPCA and IGP-M is compounded from official SGS reference months from due month through the month preceding payment, bounded by the latest published observation; custom indices require explicit rates and interest uses a 30-day basis.
- Invoice PDFs are generated client-side from server-validated quotes and Pix payloads from pix-utils; prepare the file before the download click to preserve mobile activation.
- Agenda presentation uses a browser-safe holiday library and pure helpers for public holidays, actual payment/receipt dates, and current/future/past grouping; reuse existing financial reads rather than duplicating storage.
- Personal agenda records are user-owned Cloud rows; recurrence and reminder occurrences are derived with date-fns, and checklist completion is stored per occurrence so recurring lists remain independent.
- Agenda labels incoming revenue as payment on the received date (expected date until received) and expenses only as due items; holidays remain separate from daily activity rows to avoid duplicate display.

- Annual receivables include both source and contract entries grouped by due month; the same revenue records keep the annual grid and contract details consistent.
- Annual receipt actions target the existing entry ID; source edits use an owner-scoped atomic RPC to rebuild only unpaid projections and preserve confirmed receipt history.
- Saved invoice recipients are user-owned Cloud records; IBGE supplies municipality choices with a bundled Brazilian municipality catalogue fallback for outages, and only Pix payload fields are normalized to protocol lengths so PDFs and saved names remain complete.
- Axion provider keys are stored in server-only tables (no client grants) instead of the database vault, which Lovable Cloud migrations cannot use.

## Diretrizes Permanentes do Projeto Órion

Referência completa em `docs/DIRETRIZES-PERMANENTES.md`:

- **Idealizador e autoria conceitual:** Valdemiro Nascimento é o idealizador e responsável pelo projeto Órion (nascido em iniciativa pessoal com auxílio da Lovable, versionado no GitHub e reestruturado no Google AI Studio; reconhecimento documental sem constituir declaração jurídica sobre componentes de terceiros).
- **Autonomia e papéis:** O idealizador define objetivos, prioridades e avalia resultados; a engenharia decide e implementa arquitetura, correções, testes e validações de forma autônoma, acionando o idealizador apenas para decisões de produto, autorizações externas, credenciais indispensáveis ou custos.
- **Política de API Keys:** A única credencial externa confirmada atualmente é a da Pluggy (uso restrito ao que ela autoriza). Priorizar recursos nativos, bibliotecas gratuitas/open-source, APIs públicas e processamento local; nunca inventar credenciais nem apresentar simulações como integrações reais.
- **Continuidade e resultados:** A versão atual no Google AI Studio é a referência principal (não reconstruir a partir de histórico antigo do GitHub; preservar identidade visual, módulos, dados e regras de negócio). Nunca declarar conclusão sem validação real e sempre detalhar limitações ou dependências externas quando existentes.
- **Custos:** Priorizar soluções gratuitas/baixo custo e não ativar serviços pagos ou faturamento sem autorização expressa do idealizador.
