Corre os testes Playwright de verificação UI do G-Finance.

Passos a executar:
1. Verifica se o servidor está activo em `http://localhost:3000` com um request HEAD (timeout 2s).
2. Se não estiver, inicia em background: `node server.js` com `PORT=3000`.
3. Aguarda 2 segundos para o servidor estar pronto.
4. Executa `node verify.mjs` a partir de `c:\RepoAI\G-FinanceSuite` e mostra o output completo.
5. Resume os resultados: fluxos verificados, erros JS encontrados, e lista os screenshots gerados em `verify-shots/`.
