# ÓRION — PROMPT MESTRE PARA REFORMULAÇÃO COMPLETA DO MÓDULO AGENDA

**Destinatário:** Google AI Studio (agente de desenvolvimento do projeto Órion)  
**Data da especificação:** 21/11/2026  
**Natureza:** implementação, correção, integração, verificação funcional e relatório auditável  
**Prioridade:** preservar os dados reais e a arquitetura em funcionamento; modificar a Agenda existente, não criar uma Agenda paralela.

---

## 0. INSTRUÇÃO DE EXECUÇÃO OBRIGATÓRIA

Você é o agente de desenvolvimento do sistema **Órion**, idealizado pelo proprietário do projeto. **Execute a implementação de verdade no código do projeto aberto no Google AI Studio**. Não se limite a propor layouts, dar orientações, produzir imagens de interface ou responder que implementou sem alterar código. Investigue o repositório e os componentes reais, implemente, integre, execute testes e informe com precisão o que foi validado e o que continua pendente.

**NÃO** apague, substitua, migre de modo destrutivo, preencha com dados fictícios ou duplique dados reais existentes. Não modifique de forma desnecessária os outros módulos, rotas, cadastros ou a autenticação. Não execute ferramentas externas que gerem custos, nem chamadas a serviços pagos, sem autorização explícita do proprietário. Caso falte chave, credencial, permissão, API ou infraestrutura, implemente o máximo funcional possível com configuração clara e modo degradado honesto; **nunca invente integrações funcionando**.

**Entrada visual:** foram apresentadas três capturas da interface atual, incluindo a busca global no topo (“Buscar no Órion…”, atalho Ctrl+K), a faixa de navegação por mês com botão “+ Novo evento” e a visão mensal de novembro de 2026, com compromissos financeiros no painel lateral. Utilize-as para localizar os elementos a reorganizar. A instrução de remover a função assinalada pelas imagens aplica-se **somente à página Agenda**: retire a caixa/atalho de busca “Buscar no Órion…” (Ctrl+K) de dentro dessa página ou de seu cabeçalho visível, preservando sua implementação global nas outras páginas, caso exista. Não remova o mecanismo de busca de outros módulos.

---

## 1. ESCOPO E IDENTIDADE VISUAL

1. Renomear a exibição do módulo de **“Agenda Brasília”** para apenas **“Agenda”**, inclusive título da página e item do menu lateral, onde aplicável.
2. Excluir especificamente da Agenda o subtítulo: **“Brasília, DF · Feriados oficiais, vencimentos financeiros e rotina pessoal”** (ou variações equivalentes).
3. Eliminar integralmente da página o bloco intitulado **“Linha do Tempo do Mês (Presente · Futuro · Passado)”**, sem apagar os eventos que esse bloco utilizava.
4. Preservar a identidade do Órion: azul-noite `#0C1928`, petróleo `#173D4A`, ouro `#B99555`, marfim `#E7E1D5` e gelo `#F7F8FA`; visual minimalista, sóbrio, elegante, maduro, acessível e nada futurista. Respeitar temas claro/escuro e o padrão de componentes já adotado.
5. Todas as janelas de formulário, detalhe, confirmação e ferramentas devem surgir **centralizadas na janela de visualização**, com dimensões adaptativas, rolagem interna quando necessária, cabeçalhos visíveis e sem campos iniciais ocultos. No celular, utilizar diálogos responsivos compatíveis com o teclado virtual.
6. Manter responsividade real em desktop e Android, contraste adequado, navegação por teclado, estados de foco visíveis, rótulos de acessibilidade e tooltips.
7. Não criar rotas paralelas ou duplicadas para recursos já existentes. Integrar os novos recursos à Agenda atual. As funções auxiliares devem abrir prioritariamente por **pop-up/modal dentro da Agenda**.

---

## 2. NOVO CABEÇALHO E DISPOSIÇÃO DA AGENDA

### 2.1. Cabeçalho

- **Primeira linha:** título **Agenda** à esquerda; à direita, botões **+ Novo evento**, **Contatos** e ícone de **engrenagem (Configurações)**, todos com funções reais.
- **Segunda linha, imediatamente abaixo do título Agenda:** seletor de mês/ano, com botões anterior/próximo, botão “Hoje” opcional e seleção direta de mês/ano. A troca de mês atualiza simultaneamente calendário e painel lateral.
- **Remover da página Agenda:** a busca visual “Buscar no Órion…” / Ctrl+K mostrada no anexo, sem remover a função global usada em outras áreas do sistema.
- Não repetir títulos, subtítulos, informações ou comandos em diferentes regiões da mesma página.

### 2.2. Calendário ampliado

- Ampliar o espaço do **calendário mensal**, aproveitando a área liberada pela remoção da linha do tempo e dos textos.
- Visualizar grade mensal completa, 7 colunas, cabeçalho de dias da semana, 5 ou 6 linhas conforme o mês, inclusive dias dos meses vizinhos quando for útil. Não cortar a última semana.
- Mostrar em cada dia indicadores discretos de eventos por tipo (trabalho, financeiro, aniversário, lembrete, manutenção, feriado etc.). Se exceder a área, utilizar marcador de contagem e detalhamento lateral, sem esconder registros.
- Ao selecionar qualquer dia, o painel **lateral** carrega **todos** os compromissos desse dia, organizados por horário e/ou grupo; não limitar arbitrariamente a quantidade de eventos.
- Manter o dia selecionado visualmente distinto de “hoje”, de feriado e de evento, de modo acessível.
- Em telas estreitas, o painel lateral passa para abaixo do calendário ou abre como painel móvel; nunca deve ser inacessível.
- Não inserir eventos financeiros inventados e não marcar como pago/concluído por simples visualização.

### 2.3. Painel de eventos do dia

Cada compromisso apresenta título, horário ou data, tipo, situação e, quando fizer sentido, origem e valor. **Clicar no corpo do evento abre um modal de detalhes**, com informações completas e vínculo ao registro de origem. Ao lado de cada evento colocar ícones pequenos, com `title`, `aria-label` e tooltip no mouse/foco:

- **Concluir:** ícone de verificação (`check` ou `check-circle`), com confirmação quando o efeito for relevante.
- **Adiar:** ícone de relógio com seta/calendário (`clock`, `calendar-clock`), abrindo seletor de nova data e hora.
- **Excluir:** ícone de lixeira (`trash-2`), solicitando confirmação e explicando o alcance.

O modal de detalhe também permite executar essas ações e **Fechar**, além de **Editar** quando o registro for editável. As opções em ícones não devem sacrificar acessibilidade.

**Regra essencial por origem:** se o evento vier de contrato, fatura, parcela, transação, manutenção, lembrete automático ou outro módulo, NÃO converter a ação “Concluir” em quitação financeira, baixa bancária, cancelamento de contrato ou alteração de obrigação sem o fluxo específico e confirmação no módulo de origem. Para eventos sincronizados, “Excluir” deve oferecer remover apenas da visualização/ocultar lembrete quando apropriado; nunca apagar diretamente um registro financeiro de origem. “Adiar” de um lembrete não altera o vencimento contratual original. Eventos próprios da Agenda podem ser editados, concluídos ou excluídos normalmente, respeitando recorrências.

---

## 3. BOTÃO “CONTATOS”: DIRETÓRIO COMPLETO

O botão **Contatos**, no cabeçalho da Agenda, abre a área de contatos (modal/painel amplo interno à Agenda, sem criar um módulo externo desnecessário). No topo, disponibilizar ações **+ Novo**, **Contatos**, **Comercial** e **Aniversários**.

### 3.1. Cadastro de contatos

O formulário **Novo contato** terá, pelo menos:

- Nome completo (**obrigatório**); nome social/apelido opcional.
- Data de nascimento (dia, mês e ano se conhecido; permitir dia/mês sem ano, sem inventar idade).
- Telefone(s), incluindo celular/WhatsApp; e-mail(s), com validação.
- **Categoria** (**obrigatória**) e **subcategoria** (opcional, escolhida ou criada).
- Relação/vínculo (opcional), empresa/estabelecimento (quando comercial), profissão ou serviço, endereço, cidade/UF, site, observações e canais de contato opcionais.
- Cor da categoria e cor da subcategoria, provenientes da paleta e personalizáveis.
- Configurações de aniversário, lembretes e notificações, quando aplicáveis.

Permitir **salvar, editar, excluir com confirmação, cancelar e fechar**. Evitar contatos duplicados evidentes com aviso não bloqueante; preservar registros de nomes iguais quando são pessoas distintas. Persistir os dados no armazenamento real do projeto e no usuário correto; não depender apenas do estado temporário do componente.

### 3.2. Categorias e subcategorias personalizáveis

Categorias iniciais **Família, Amigos e Comércio**; permitir outras categorias via botão **+ Novo**. Exemplos de subcategorias de Família: **Esposa, Irmã, Mãe, Pai, Primo** (podem existir outras); exemplos de Comércio: **Eletricista, Loja de materiais, Encanador, Loja de pães congelados**.

- Em todo seletor de categoria/subcategoria, botão **+ Novo** abre entrada de texto, seleção de cor e salvar; item criado aparece imediatamente na lista.
- Possibilitar **editar nome/cor e excluir** categorias e subcategorias, preservando vínculos: antes de excluir uma categoria em uso, solicitar remapeamento ou impedir exclusão destrutiva.
- Categoria e subcategoria armazenadas com **IDs estáveis**, não por comparação textual; diferenciação por grupo.
- Catálogo de cores selecionáveis, com contraste de texto e acessibilidade; permitir cores diferentes em categoria e subcategoria.
- Cada contato pertence a uma categoria principal e pode ter subcategoria opcional; permitir reclassificação sem perder dados ou aniversário.

### 3.3. Visualização das listas

- Na aba **Contatos**, exibir lista limpa com **apenas nome e categoria** por linha, acrescidos de sinalização discreta de cor (sem telefone, e-mail ou outros detalhes na listagem). Ex.: `Fabrícia | Família`.
- A aba **Comercial** exibe exclusivamente contatos classificados como **Comércio**, como `Carlos | Comércio`, independentemente de subcategoria. **Não repetir esses contatos na listagem principal de Contatos.**
- Lista principal inclui Família, Amigos e outras categorias não comerciais. Disponibilizar filtros e busca local ao diretório, sem reintroduzir a busca global removida do cabeçalho da Agenda.
- Clicar em qualquer **nome** abre modal com cadastro completo e comandos **Editar** (lápis), **Excluir** (lixeira) e **Fechar** (X), com tooltips.

### 3.4. Aba “Aniversários”

- Lista **unificada de aniversários** de todas as categorias, **inclusive Comércio**, quando houver data de nascimento/cadastro de aniversário.
- Exibir **nome, data de nascimento, categoria e subcategoria** em colunas; se o ano não tiver sido informado, mostrar dia/mês e idade como não informada.
- Ordenar por próximo aniversário ou por mês/dia, com filtros opcionais.
- **Aniversários são recorrentes TODOS OS ANOS**, sem data de término automática. Criar ocorrência anual visível no calendário e painel lateral, independentemente do ano consultado, evitando a duplicação de contatos e eventos materiais.
- Permitir lembretes configuráveis e selecionar como lidar com 29 de fevereiro em anos não bissextos (por exemplo, 28/02 ou 01/03), configurável, sem mudar a data original armazenada.
- Clicar no nome abre a mesma janela completa de contato. Alterar a data de nascimento atualiza futuras ocorrências sem duplicá-las.

---

## 4. EVENTO “TRABALHO”: CORREÇÃO DA ESCALA 12×36

Revisar e corrigir a recorrência que aparentemente **interrompe a sequência dos plantões** ao avançar os dias ou meses. A regra é 12 horas de trabalho e 36 horas de descanso; para plantões diurnos consecutivos isso normalmente gera trabalho a **cada dois dias**, a partir de uma data-base válida.

- Preservar os eventos reais, a data inicial de escala e as configurações de trabalho existentes.
- Manter campos **Empresa/Trabalho/Local**, hora de entrada, **hora de saída** e **intervalo**; exemplo de jornada 07:00–19:00. Não apagar a possibilidade de regras específicas de intervalo do cadastro atual.
- Oferecer tipos de escala **12×36** e **Outros**. Em **Outros**, abrir mini calendário para seleção personalizada dos dias de trabalho, mantendo o que já foi implementado.
- Gerar ocorrências da escala 12×36 dinamicamente ou por recorrência confiável, inclusive em transições de mês/ano, ano bissexto, meses de 28/29/30/31 dias, sem depender de um limite arbitrário de eventos previamente materializados.
- Não redefinir a fase da escala na mudança de mês ou ano. Usar uma **data-base fixa** do compromisso, não a data inicial do mês exibido.
- Se a data-base for 19/11/2026, por exemplo, a sequência diurna deve seguir **19, 21, 23, 25, 27, 29/11; 01/12/2026**, sem reiniciar a contagem no primeiro dia do mês. *Esse exemplo é teste de cálculo, não dado a inserir no usuário.*
- Permitir exceções pontuais (férias, troca de plantão, ausência), sem corromper a recorrência original; distinguir ocorrência individual da série inteira ao editar/excluir.
- Testar preservação de horário e intervalo em cada ocorrência, inclusive quando houver horários atravessando meia-noite.

---

## 5. INTEGRAÇÃO AUTOMÁTICA DOS COMPROMISSOS DE OUTROS MÓDULOS

A Agenda deve **consultar e apresentar**, com atualização consistente, compromissos e avisos cadastrados em outras áreas do Órion, conforme houver fontes de dados válidas:

1. **Despesas Anuais, contas a pagar e cartões:** datas de vencimento, parcelas ainda devidas, faturas e compromissos financeiros, com situação correta.
2. **Recebíveis, receitas previstas e contratos:** previsão de recebimento e alertas de vencimento, sem confundir previsão com receita efetivamente recebida.
3. **Contratos Parcelados:** datas das parcelas, vínculo com o contrato e reflexo de pagamentos já registrados.
4. **Veículos/Frota:** revisões, manutenções, serviços agendados, obrigações e vencimentos registrados (quando disponíveis).
5. **Lembretes gerais, compromissos pessoais, trabalho e aniversários:** eventos próprios e recorrentes.
6. **Feriados nacionais/locais** quando houver integração existente confiável, sem manter o texto Brasília no cabeçalho. Preservar o mecanismo de feriados existente; não inventar feriados.

**Modelo de agregação recomendado:** unificar para apresentação por meio de um adaptador/event view (`sourceType`, `sourceId`, `occurrenceKey`, `title`, `startAt`, `endAt`, `status`, `value?`, `category`, `readOnly`, `actionPermissions`), sem copiar automaticamente obrigações entre tabelas e sem duplicar valores. Usar chave composta estável `(origem, id do registro, ocorrência)` e idempotência na sincronização. Quando a origem mudar, a Agenda atualiza; quando for removida, não deixa “evento fantasma”. Respeitar fuso horário `America/Sao_Paulo` para apresentação e calendário, armazenando timestamps de maneira correta.

**Não presumir que a origem existe ou está acessível.** Investigar os módulos reais e declarar explicitamente no relatório que integrações foram conectadas e quais dependeram de ajustes ou dados ausentes. Nunca apresentar o símbolo de “pago” se a origem permanecer em aberto.

---

## 6. MENU DE ENGRENAGEM E FERRAMENTAS

Adicionar **engrenagem no canto superior direito da Agenda**, que abre menu funcional com, no mínimo:

- **Relógio** (relógio, despertador e cronômetro)
- **Bloco de notas**
- **Calculadora**
- **Previsão do tempo**
- **Configurações da Agenda** (preferências de alertas, cores, data/hora e permissões, conforme aplicável)

Cada opção abre janela/painel centralizado dentro da Agenda, sem navegação externa desnecessária, e deve ser utilizável em desktop e Android.

### 6.1. Relógio, despertador e cronômetro

**Relógio:** horário atual em tempo real com segundos opcionais, formato 12/24 horas configurável e fuso horário correto.

**Despertador:** cadastrar vários alarmes com nome, hora, dias de repetição, som (quando suportado), status ativado/desativado e ações editar/excluir. Ao disparar com a aplicação ativa, abrir modal destacado com ícones e tooltips para **Adiar (soneca)**, **Desligar/Concluir** e **Excluir alarme**, sem exigir acesso à página Agenda. Tempo de soneca configurável, sem descartar a recorrência original. Ao tocar, a interface deve refletir o estado do alarme e impedir múltiplos disparos duplicados.

**Android/PWA:** implementar notificação push quando houver instalação, permissão do usuário e suporte real de Service Worker/Web Push e backend/agendador. Ao tocar a notificação, abrir o fluxo do alarme e oferecer ações rápidas de **Adiar** e **Desligar/Excluir** apenas quando o navegador/sistema operacional permitir botões de ação; fornecer alternativa que abre diretamente o alarme. **Nunca prometer que uma aplicação web/PWA tocará exatamente no horário com o navegador fechado ou celular suspenso:** isso depende de permissões, entrega push, sistema e infraestrutura. Documentar limites. Para garantia equivalente a despertador nativo Android, identificar necessidade de app nativo/integração específica e solicitar aprovação antes de implementá-la. Não usar polling contínuo caro ou abusivo.

**Cronômetro:** iniciar, pausar, continuar, zerar, registrar voltas, leitura precisa com tempo monotônico; manter consistência ao alternar abas e evitar reinícios incorretos.

### 6.2. Bloco de notas e listas

- Abrir pop-up com lista de notas salvas, pesquisar, criar, editar, excluir e escolher **cor de cada nota**; não perder conteúdo ao fechar.
- Tipos: **Nota livre**, **Lista de tarefas/fazeres** (checkbox por item) e **Lista de compras**.
- Possibilitar **Enviar para calendário**: escolher dia e, se desejado, horário, título, lembrete; criar evento vinculado à nota, sem duplicação ao repetir a ação inadvertidamente. Um evento deve abrir a nota correspondente.
- Na lista de tarefas, cada item é marcável; concluídos têm marcação visual sem exclusão automática.

**Lista de compras multiloja:**

- Permitir **várias lojas na mesma lista** e botão **+ Nova loja**. Cada loja tem nome (opcionalmente endereço/observação) e diversos itens.
- Cada item contém descrição, quantidade positiva, unidade opcional, **valor unitário** em BRL, **valor total = quantidade × valor unitário** e checkbox **Comprado**.
- Totais reativos: **Total previsto da lista** = soma de todos os itens; **Total comprado** = soma dos itens marcados; opcionalmente **Falta comprar** = previsto − comprado.
- Ao marcar comprado, realçar a linha ao estilo **marcador de texto** com cor configurável, preservar legibilidade e mostrar o valor em “Comprado” atualizado imediatamente. Desmarcar desfaz a marcação e recalcula o subtotal.
- Mostrar subtotal por loja e total geral; permitir alterar quantidades e preços e reordenar/remover itens sem comprometer outros registros.

**Exemplo apenas para teste (NÃO importar como dado real):**

| Loja | Produto | Qtde. | Unitário | Subtotal | Comprado |
|---|---|---:|---:|---:|---|
| Tatico | Leite | 12 | R$ 5,00 | R$ 60,00 | Não |
| Assaí | Sabão | 1 | R$ 1,00 | R$ 1,00 | Sim |
| **Total** | | | | **R$ 61,00** | |
| **Comprado** | | | | **R$ 1,00** | |

Se marcar também o leite, **Comprado** deve mudar para **R$ 61,00**. Utilizar aritmética decimal segura/centavos inteiros para moeda, evitar erro por `float`, aceitar vírgula brasileira e exibir duas casas decimais.

### 6.3. Calculadora com histórico lado a lado

- Ao selecionar **Calculadora**, abrir pop-up em que **calculadora** e **histórico de cálculos** sejam exibidos **lado a lado no desktop** e em disposição adaptativa no celular.
- Alternância clara entre **Normal** e **Científica**, preservando histórico.
- Calculadora normal: números, vírgula decimal, operações fundamentais, porcentagem, troca de sinal, limpar e apagar último dígito, precedência e tratamento de divisão por zero.
- Científica: além do básico, parênteses, potências, raiz, funções trigonométricas, logaritmo e constantes; indicar graus/radianos e utilizar parser seguro, sem `eval` de expressões não confiáveis.
- **Obrigatório funcionar pelo teclado físico**, além dos botões visuais: `0–9`, `+`, `-`, `*`, `/`, `Enter`/`=`, `Backspace`, `Escape`/`Delete` conforme ação, ponto/vírgula decimal e parênteses quando compatíveis. Não sequestrar teclas enquanto o foco estiver em outro formulário.
- Histórico com expressão, resultado, data/hora e ação clicar para reutilizar/copiar; opção de limpar histórico com confirmação. Persistência por usuário.

### 6.4. Previsão do tempo — integração Google quando tecnicamente disponível

- Adicionar **Previsão do tempo** à engrenagem; abrir pop-up visualmente bem resolvido, com condições atuais, temperatura, sensação térmica, máximas/mínimas, precipitação, vento, umidade, previsão horária e próximos dias, conforme realmente disponível na API habilitada.
- Dar preferência a soluções **oficiais do Google Maps Platform**, inclusive **Weather API** se disponível à conta/projeto/região e com uso autorizado; **verificar no ambiente real** nomes de APIs, cobrança, quotas, cobertura, endpoints e restrições antes de integrar. Não presumir que toda funcionalidade meteorológica é gratuita nem que uma chave Maps já oferece Weather.
- Permitir localidade configurável por busca, com opção de geolocalização **somente com permissão explícita**; guardar localização escolhida sem exigir GPS permanente.
- Se não houver chave ou faturamento autorizados, disponibilizar tela de configuração/informação e modo sem dados externos ou fonte alternativa aprovada; jamais fabricar temperatura/previsão.
- Manter chaves secretas no servidor quando exigido, observar restrições de domínio e quotas, cache e limites de chamadas, estados carregando/erro/offline, atribuições exigidas pelo fornecedor e proteção de privacidade.
- Caprichar no design com informações legíveis e foco no que ajuda o usuário; não criar animações futuristas ou poluição visual.

---

## 7. DADOS, MODELO, SEGURANÇA E SINCRONIZAÇÃO

Antes de escrever, **mapear** componentes, serviços, banco, hooks, rotas e armazenamento reais da Agenda e dos módulos financeiros/veiculares. Desenvolver migrações **aditivas**, versionadas e reversíveis quando aplicável. Reutilizar autenticação e vínculo ao usuário atual.

Entidades conceituais recomendadas (adaptar ao esquema real, não impor tabela duplicada):

- `Contact` (`id`, `ownerId`, `name`, `birthMonth`, `birthDay`, `birthYear?`, `phones[]`, `emails[]`, `categoryId`, `subcategoryId?`, `company?`, `profession?`, `address?`, `notes?`, `createdAt`, `updatedAt`).
- `ContactCategory` e `ContactSubcategory` com IDs estáveis, nome, cor, ordenação e dono; a subcategoria referencia a categoria.
- `AgendaEvent` para compromissos próprios, com tipo, datas, horário, status, recorrência, lembretes e associação opcional a nota ou contato.
- `AgendaEventOverride` para alteração de uma ocorrência específica da série, sem perder regra-base.
- `Alarm`, `Note`, `ChecklistItem`, `ShoppingStore`, `ShoppingItem`, `CalculatorHistory`, `AgendaSettings` (adequar à infraestrutura).
- `ExternalEventAdapter` ou projeção de leitura para registros externos, com ID de origem estável e situação atual da origem.

**Restrições essenciais:** isolamento por usuário; validação de tipos e valores; tratamento de datas locais sem erros de UTC; saneamento de campos textuais; nenhum segredo no código cliente; autorização nas APIs; eventos idempotentes; exclusão com confirmação; atualização consistente entre tela e banco; acessibilidade; responsividade; estados vazio/carregamento/erro; logs sem dados pessoais sensíveis. Quando a versão atual usar armazenamento local, manter compatibilidade e definir claramente limites de sincronização; não declarar sincronização em nuvem sem backend real.

**Dados existentes:** preservar integralmente as despesas, receitas, recebíveis, cartões, contratos parcelados, histórico de pagamentos e recebimentos, notas fiscais, veículos, compromissos de trabalho, cadastro e regras de autenticação. Uma simples conclusão na Agenda **jamais** deve alterar saldos ou efetuar baixa automática. Não importar exemplos de teste no ambiente de produção.

---

## 8. TESTES OBRIGATÓRIOS E CONFERÊNCIA ITEM POR ITEM

Ao implementar cada item, **abrir a tela correspondente, testar o fluxo completo, corrigir falhas e testar novamente**. Não usar apenas uma verificação de compilação como evidência de funcionalidade. Adicionar testes automatizados onde possível e verificações manuais/integração onde necessárias. Conferir também ausência de erros no console, requisições inválidas, persistência após recarregar, tema escuro e funcionamento Android/responsivo.

### Checklist de aceite (marcar `PASSOU`, `FALHOU`, `BLOQUEADO` ou `NÃO TESTADO`, anexando evidência)

| ID | Requisito e teste mínimo |
|---|---|
| AG-01 | Nome visual é somente “Agenda”; texto Brasília/DF foi removido apenas da Agenda |
| AG-02 | Busca “Buscar no Órion…”, Ctrl+K não aparece dentro da página Agenda; demais páginas mantidas |
| AG-03 | Seletor de mês/ano está sob o título e navega corretamente |
| AG-04 | “+ Novo evento”, “Contatos” e engrenagem estão no canto superior e funcionam |
| AG-05 | “Linha do Tempo do Mês” não existe mais; eventos foram preservados |
| AG-06 | Calendário mensal ampliado exibe todas as semanas, sem cortes, em desktop e celular |
| AG-07 | Selecionar um dia mostra TODOS os seus compromissos no painel lateral |
| AG-08 | Clicar no evento abre modal com seus detalhes e origem |
| AG-09 | Ícones concluir, adiar, excluir, editar/fechar têm tooltip, foco e ação real |
| AG-10 | Eventos financeiros não são quitados, apagados na origem ou reagendados contratualmente por engano |
| CT-01 | Botão Contatos abre área com + Novo, Contatos, Comercial e Aniversários |
| CT-02 | Criar contato com nome, nascimento, telefone, e-mail, categoria/subcategoria; editar, excluir e persistir |
| CT-03 | Na lista Contatos aparecem somente nome e categoria, sem contatos comerciais |
| CT-04 | Na aba Comercial aparecem contatos da categoria Comércio com seus vínculos corretos |
| CT-05 | Categorias Família/Amigos/Comércio e subcategorias funcionam |
| CT-06 | + Novo cria categoria ou subcategoria digitada, salva e exibe imediatamente |
| CT-07 | Paleta de cores por categoria e subcategoria persiste, inclusive após recarregar |
| CT-08 | Clique no nome abre pop com dados, editar, excluir e fechar |
| AN-01 | Aniversários exibe nome, data de nascimento, categoria e subcategoria de todos os grupos |
| AN-02 | Aniversário reaparece no calendário de 2026, 2027, 2028 e anos seguintes, sem duplicidade |
| AN-03 | Alteração da data atualiza recorrência; 29/02 segue preferência escolhida |
| TR-01 | Escala 12×36 mantém sequência sem interrupção na virada do mês e ano |
| TR-02 | Escala Outros abre mini calendário e respeita os dias selecionados |
| TR-03 | Trabalho preserva empresa/local, entrada, saída e intervalo |
| TR-04 | Exceção de plantão altera só ocorrência escolhida, não toda a série sem autorização |
| IN-01 | Vencimentos de despesas e cartões reais são apresentados sem duplicidade |
| IN-02 | Recebíveis reais são apresentados como previstos ou recebidos conforme origem |
| IN-03 | Parcelas de contratos acompanham status atualizado da origem |
| IN-04 | Manutenções/revisões de veículos são exibidas quando disponíveis |
| IN-05 | Lembretes, feriados e trabalho aparecem conforme os cadastros e fontes reais |
| IN-06 | Fonte alterada/excluída atualiza Agenda sem eventos fantasmas |
| RL-01 | Relógio exibe horário local correto e atualiza continuamente enquanto aberto |
| RL-02 | Despertador cria/edita/exclui alarmes, repete, toca com app ativo, permite adiar/desligar |
| RL-03 | No Android, permissão/push e limitações reais estão testadas/documentadas, sem prometer exatidão impossível |
| RL-04 | Cronômetro inicia, pausa, retoma, zera e registra voltas corretamente |
| NT-01 | Bloco de notas cria/edita/exclui, salva cores, persiste e reabre sem perder dados |
| NT-02 | Lista de tarefas permite checkbox por item e conserva estado |
| NT-03 | Nota é enviada para dia escolhido no calendário com vínculo de retorno |
| CP-01 | Lista de compras permite duas ou mais lojas, itens, quantidades, preços e subtotais |
| CP-02 | Exemplo Tatico R$ 60,00 + Assaí R$ 1,00 = Total R$ 61,00 |
| CP-03 | Selecionar somente sabão = Comprado R$ 1,00; selecionar ambos = R$ 61,00 |
| CP-04 | Checkbox pinta item estilo marca-texto; desmarcar desfaz cor e recalcula |
| CL-01 | Calculadora normal e científica funcionam com operações e validações |
| CL-02 | Teclado físico funciona: números, operações, Enter, Backspace e limpar |
| CL-03 | Histórico lado a lado no desktop, adaptativo em celular, persiste e pode ser reutilizado |
| TP-01 | Pop de previsão do tempo abre e mostra dados reais apenas com API funcional |
| TP-02 | Localidade, permissão, erro, ausência de chave e custos/quotas são tratados corretamente |
| UX-01 | Todos os modais são centralizados e nenhum campo inicial fica oculto |
| UX-02 | Tema claro/escuro, cores Órion, tooltips, foco e layout mobile estão íntegros |
| DT-01 | Dados reais existentes foram preservados e exemplos não foram inseridos |
| DT-02 | Reload, logout/login e isolamento entre usuários funcionam conforme backend disponível |
| QA-01 | Typecheck/lint/build passam; testes automatizados e de integração são executados |
| QA-02 | Todos os itens acima têm status, evidência e observações no relatório final |

### Cenários de regressão adicionais

- Novembro/2026 tem 30 dias e seu calendário não deve incluir incorretamente um dia 31; a passagem para dezembro/2026 deve preservar os eventos e a fase do 12×36.
- Contato “Fabrícia” na categoria Família/subcategoria Esposa **não** aparece na lista Comercial; “Carlos” em Comércio/Eletricista aparece na Comercial, mas não na lista principal. **Somente fixtures temporárias de teste**.
- Um evento de fatura em aberto pode ser visto e receber alerta, mas clicar “Concluir” não registra pagamento nem reduz o saldo devedor automaticamente.
- Repetir a sincronização dos registros de origem ou abrir a Agenda diversas vezes não duplica compromissos.
- Salvar uma nota com duas lojas, fechar a janela e reabrir conserva todos os itens, cores, quantidades e checkboxes.
- Uma tecla digitada em campo de busca/nome de contato não deve ser interpretada como entrada de calculadora.
- Ausência de rede/permissão meteorológica/push não provoca tela branca, travamento ou dados inventados.

---

## 9. ORDEM DE IMPLEMENTAÇÃO SUGERIDA

1. Fazer inventário da Agenda atual, estado dos dados, componentes e integrações; identificar arquivos reais e estrutura utilizada.
2. Ajustar o cabeçalho, remover elementos solicitados, ampliar calendário e tornar o painel lateral funcional.
3. Implementar diretório de contatos, categorias, subcategorias, cores e aniversário anual.
4. Corrigir recorrência 12×36 e exceções, com testes antes da integração de novos eventos.
5. Integrar eventos existentes dos módulos financeiros, recebíveis, contratos, veículos e lembretes, garantindo ausência de duplicatas.
6. Implementar engrenagem, relógio/despertador/cronômetro e suas limitações Android/PWA.
7. Implementar bloco de notas, tarefas, compras multiloja e integração notas ↔ calendário.
8. Implementar calculadora normal/científica, histórico e suporte a teclado.
9. Integrar previsão do tempo mediante API/credenciais disponíveis e permissão para eventuais custos.
10. Revisar UX, acessibilidade, responsividade, persistência e executar TODOS os testes do checklist; corrigir cada falha reproduzível.

A sequência pode ser ajustada às dependências reais do projeto, mas **nenhum requisito pode ser simplesmente ignorado**. Quando um item depender de serviço externo não configurado ou inviabilidade técnica, registrar bloqueio específico e entregar o restante de forma funcional.

---

## 10. RELATÓRIO FINAL QUE VOCÊ DEVE ENTREGAR

**Não declarar “concluído” antes de verificar.** Produza, ao finalizar sua execução, uma resposta estruturada com:

1. **Resumo do que foi realmente alterado** e onde, citando arquivos/componentes e eventuais migrações criadas.
2. **Checklist integral (IDs acima)**, com status individual `PASSOU`, `FALHOU`, `BLOQUEADO` ou `NÃO TESTADO`, evidência observável (teste, saída de comando, tela ou fluxo conferido) e correções realizadas.
3. **Testes executados** com comandos e resultados concretos: compilação, tipo/lint, testes unitários, integração, testes visuais e responsivos. Se não executou, afirmar isso.
4. **Fontes de eventos integradas** e confirmação de que não duplicam registros nem afetam pagamentos/recebimentos de maneira indevida.
5. **Verificação da escala 12×36**, incluindo virada de mês e de ano.
6. **Persistência e preservação dos dados**: que armazenamento foi utilizado, quais migrações ocorreram e como foi assegurada a integridade dos dados reais.
7. **Integrações externas e custos:** APIs efetivamente habilitadas, permissões necessárias, quotas/cobrança, segredos ausentes, limitações do Android/PWA e tarefas que dependem de autorização do proprietário.
8. **Pendências e riscos residuais**, com motivo, como reproduzir e a ação exata necessária para concluir; nunca esconder falhas.

### Critério de aceite final

O resultado esperado é uma **Agenda única, elegante, ampliada e realmente funcional**, preservando o Órion existente, exibindo eventos da origem correta, permitindo gerenciar contatos/aniversários e usando ferramentas úteis sem romper outros módulos. **Para cada item solicitado: implementar → verificar → corrigir → verificar novamente → documentar**.

**Execute agora no projeto aberto, respeitando os limites de ferramentas e as autorizações de serviços pagos.**
