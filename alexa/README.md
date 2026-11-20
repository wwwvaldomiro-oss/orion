# Amazon Alexa ↔ Órion (implantação controlada)

## Estado desta branch

A integração está **preparada para configuração**, não publicada nem ativa. Não altera as coleções existentes, não executa migrações, não solicita dados financeiros no navegador e não usa a Lovable. A publicação da Skill e os testes ponta a ponta exigem configurar uma conta Amazon Developer, uma Lambda AWS e um domínio HTTPS público para o backend Órion.

### Comandos implementados

- "Alexa, abrir Órion" — ajuda e menu.
- "Alexa, peça ao Órion minha lista de compras" — itens não marcados.
- "Alexa, peça ao Órion para adicionar arroz à lista de compras" — cria um item.
- "Alexa, pergunte ao Órion minha agenda de hoje" — compromissos **não recorrentes** do dia.
- "Alexa, pergunte ao Órion minhas próximas contas" — vencimentos da coleção `monthlyBills`.

**Limitações atuais:** agenda recorrente e turnos 12×36 ainda não são calculados; contratos parcelados e demais fontes das Despesas Anuais ainda não são conciliados para a resposta por voz. Rotinas automáticas de alertas, notificações proativas e resumos diários **ainda não foram ativadas/implementadas**; precisam de um agendador com idempotência, consentimento explícito e verificação de suporte pelas APIs da Amazon. Sem o agendador não há notificações automáticas. Não ativar até testes de conciliação.

### Segurança

1. OAuth 2.0 **authorization_code + PKCE S256**; o redirecionamento é conferido contra allowlist.
2. A tela de autorização exige login Firebase com e-mail verificado e consentimento explícito.
3. O servidor armazena **somente hashes SHA-256** dos tokens aleatórios.
4. Access token de 60 minutos, refresh token de 30 dias com rotação e revogação por versão da conexão.
5. Backend de voz recusa tokens inválidos, não tem endpoints de pagamento, transferência ou exclusão.
6. A Lambda precisa de **Alexa Skills Kit trigger** limitado ao Skill ID e também verifica o ID no evento.
7. A integração é desativada por padrão; manter segredos exclusivamente no ambiente de servidor.

> Atenção: ainda são necessárias revisões de segurança, limite de chamadas por usuário e testes de abuso antes de expor endpoints à internet. A coleção de tokens requer política de retenção/TTL no Firestore. A Skill não deve ser publicada sem essas etapas.

### Configuração do backend Express

Configure variáveis no servidor (nunca em `VITE_*` ou Git):

```env
ALEXA_INTEGRATION_ENABLED=true
ALEXA_OAUTH_CLIENT_ID=orion-alexa
ALEXA_OAUTH_CLIENT_SECRET=<segredo-aleatorio-longo>
ALEXA_ALLOWED_REDIRECT_URIS=https://pitangui.amazon.com/api/skill/link/SEU_VENDOR_ID,https://layla.amazon.com/api/skill/link/SEU_VENDOR_ID
```

**Substitua os exemplos por todos e somente os redirect URLs exatos apresentados no Console Alexa para sua Skill e região.** Nunca invente ou autorize domínios adicionais.

No Alexa Developer Console:

- Locale: **pt-BR**; invocation name: **órion**.
- Modelo: `alexa/skill/interaction-model.pt-BR.json` (validar o modelo no console).
- Endpoint da Skill: AWS Lambda em região suportada com trigger Alexa Skills Kit configurado.
- Account linking: **Authorization Code Grant** e **PKCE SHA-256**.
- Authorization URI: `https://SEU_DOMINIO/api/alexa/oauth/authorize`
- Access Token URI: `https://SEU_DOMINIO/api/alexa/oauth/token`
- Client ID: valor de `ALEXA_OAUTH_CLIENT_ID`.
- Client Secret: valor de `ALEXA_OAUTH_CLIENT_SECRET`.
- Scope: nenhum escopo financeiro sensível. Verificar exigências do console.

Na Lambda, com Node.js 22+ e entrypoint `alexa/skill/index.mjs`:

```env
ALEXA_SKILL_ID=amzn1.ask.skill.SEUID
ORION_API_URL=https://SEU_DOMINIO
```

Após habilitar a Skill em testes, selecione "Vincular conta": o navegador abre `/alexa/autorizar`. Com seu Google/Firebase verificado, clique em Autorizar. Veja status e revogação em **Perfil & Configurações → Amazon Alexa**.

### Próximas verificações antes de publicação

- Testar fluxo OAuth com as URLs reais e garantir rotação/uso único do código e refresh.
- Confirmar se Alexa permite a invocação "órion" em pt-BR; ajustar exemplos conforme Console.
- Testar leitura de contas com fontes integradas e preservar a regra de não duplicar dívidas.
- Construir cálculo da agenda recorrente 12×36, sem alterar dados existentes.
- Implementar automações mediante consentimento explícito, agendador e horários, sem expor valores na voz sem confirmação.
- Testar `npm run build`, `npm test` e homologar end-to-end; esta branch ainda não foi homologada.

**Nunca faça merge automático em main antes de validar.**
