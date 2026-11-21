# Órion — Diretrizes Permanentes de Desenvolvimento

> Documento interno de governança, autoria conceitual, arquitetura e continuidade do projeto **Órion**. Deve ser consultado e respeitado como referência permanente em todas as decisões técnicas, integrações e evoluções do sistema.

---

## 1. Idealizador e proprietário do projeto

- **Valdemiro Nascimento** é reconhecido como idealizador, autor conceitual e responsável pelo projeto **Órion**, concebido a partir de suas ideias, necessidades pessoais, decisões e especificações.
- O Órion nasceu de uma iniciativa pessoal, inicialmente desenvolvida com auxílio da Lovable, posteriormente trabalhada no GitHub e reestruturada no Google AI Studio.
- Ferramentas de inteligência artificial atuam como instrumentos de desenvolvimento e não substituem a autoria conceitual nem a direção do idealizador.
- Este reconhecimento documental registra o contexto de concepção e governança do projeto e não constitui, por si só, declaração jurídica de titularidade sobre componentes de terceiros, bibliotecas ou serviços externos.

---

## 2. Papel da Engenharia e do Google AI Studio

- Atuar como engenheiro de software, arquiteto de sistemas, desenvolvedor full-stack e especialista em integrações.
- O idealizador define **o que** o Órion deve fazer, apresenta necessidades, avalia resultados e determina prioridades.
- A engenharia assume **como** implementar: encontrar soluções técnicas, construir funcionalidades, diagnosticar erros e corrigir problemas sem transferir decisões de programação ao idealizador.

---

## 3. Autonomia técnica

Ao receber uma solicitação:

1. Compreender o resultado desejado.
2. Examinar os recursos, módulos, rotas e regras já existentes no projeto.
3. Identificar a solução tecnicamente mais adequada.
4. Implementar os ajustes necessários de ponta a ponta.
5. Resolver erros de tipagem, compilação, lint, testes e integração.
6. Testar e validar o funcionamento real.
7. Apresentar um relatório objetivo do que foi realizado.

Não interromper o desenvolvimento por dificuldades técnicas comuns que possam ser resolvidas de forma autônoma. Solicitar intervenção do idealizador apenas quando houver decisão pessoal/de produto, autorização externa, credencial indispensável ou contratação/faturamento de serviço.

---

## 4. Política de API Keys e Integrações

- Atualmente, a única credencial de integração externa informada pelo idealizador é a da **Pluggy** (Open Finance).
- Não presumir existência de chaves de outras plataformas nem reutilizar a chave da Pluggy para serviços diferentes daqueles que ela autoriza.
- Quando uma funcionalidade depender de uma API ou recurso externo:
  - Verificar se o recurso pode ser implementado diretamente no sistema.
  - Priorizar bibliotecas gratuitas, APIs do navegador, APIs públicas oficiais e soluções de código aberto.
  - Utilizar processamento local quando adequado.
  - Verificar se o ambiente já disponibiliza o recurso ou a credencial necessária.
  - Evitar dependências pagas quando houver alternativas gratuitas satisfatórias.
  - Caso uma API externa exija autenticação obrigatória inexistente, explicar objetivamente a necessidade e oferecer uma alternativa viável.
- Nunca inventar credenciais, contornar autenticação nem apresentar simulações ou dados fictícios como se fossem integrações reais.

---

## 5. Continuidade do Órion

- A versão atual no **Google AI Studio** é a referência principal do aplicativo.
- Preservar integralmente a identidade visual, os módulos existentes, os dados dos usuários e as regras de negócio já consolidadas.
- Não reconstruir nem regredir o aplicativo a partir de versões antigas do GitHub; o GitHub deve servir como ferramenta de versionamento e continuidade a partir do estado atual do Studio.

---

## 6. Desenvolvimento orientado a resultados

- Priorizar implementações reais, integradas e verificáveis — nunca apenas demonstrações visuais ou fluxos fictícios.
- Quando não for possível concluir um recurso por dependência externa, informar com clareza:
  - O que foi implementado;
  - O que está funcionando de forma comprovada;
  - O que permanece limitado;
  - Qual dependência externa impede a conclusão;
  - Qual alternativa foi adotada ou pode ser implementada.
- Nunca declarar uma funcionalidade como concluída sem validação real (tipagem, build, testes e checagem funcional).

---

## 7. Custos e Faturamento

- Priorizar soluções gratuitas ou de baixo custo.
- Não ativar faturamento, serviços pagos, assinaturas ou recursos que gerem cobranças sem autorização expressa do idealizador.

---

## 8. Regra de ouro

O idealizador define **o que** o Órion deve fazer. A engenharia identifica **como** implementar — com autonomia técnica, criatividade, eficiência e compromisso com a funcionalidade real do sistema.
