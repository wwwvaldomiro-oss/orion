# Integração Notas Fiscais e Pluggy — revisão antes da produção

Este ramo integra arquivos já presentes no repositório, sem alterar dados de usuários.

## Incluído
- Rota `/notas-fiscais`, navegação e abas de notas gerais, mercado, aquisições e relatórios.
- Leitura de QR Code pela câmera; OCR opcional via Gemini no servidor; anexos PDF/imagem no Firebase Storage.
- Engrenagem Pluggy na Carteira, mantendo cadastro manual de contas e cartões.
- Duas credenciais independentes de Pluggy armazenadas no servidor, com sincronização manual.
- Rótulo lateral `Veículo` sem alteração da rota `/veiculos`.
- Regras propostas para `fiscalReceipts` no Firestore e anexos no Storage.

## Configuração obrigatória antes do uso
1. Instalar dependências: `npm install` e versionar o lockfile atualizado.
2. Executar `npm run build`, `npm test` e validar as regras do Firebase no emulador.
3. Configurar identidade Firebase Admin no ambiente do servidor. Nunca comitar chave de conta de serviço.
4. Configurar `ORION_INTEGRATION_ENCRYPTION_KEY` no servidor (segredo aleatório com pelo menos 32 caracteres). A troca dessa chave exige migrar/recriar as credenciais Pluggy criptografadas.
5. Configurar `GEMINI_API_KEY` apenas se OCR for utilizado, em segredo de servidor.
6. Publicar `firestore.rules` e `storage.rules` no projeto Firebase correto apenas após testes e revisão das regras existentes.

## Atenções
- A chave de configuração pública do Firebase **não** deve ser usada como chave secreta da API Gemini; aplicar restrições apropriadas e revisar alertas de segredo.
- OCR produz uma sugestão, não um registro fiscal autenticado. Confirmar visualmente dados e valores antes de salvar.
- QR Code/chave não garantem consulta automatizada a qualquer portal de SEFAZ.
- A sincronização Pluggy não quita obrigações, não deve alterar contas manuais e não cria faturas futuras automaticamente.
- As regras Firebase no repositório **não** são implantadas automaticamente por este PR.
- Build, testes de integração, armazenamento, permissões, sincronização Pluggy e OCR com serviços reais ainda exigem validação.
