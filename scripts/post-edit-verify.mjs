#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit | Write)
 * Corre verify.mjs quando um ficheiro de UI em docs/ é alterado.
 * Instalado via .claude/settings.json → hooks → PostToolUse.
 */

import { createServer } from 'net';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Lê payload do stdin ────────────────────────────────────────
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const filePath = (payload.tool_input?.file_path ?? payload.tool_input?.path ?? '').replace(/\\/g, '/');

// ── Filtra: apenas ficheiros UI em docs/ (exclui workers/) ─────
const UI_RE = /\/docs\/(?!js\/workers\/).+\.(html|css|js)$/;
if (!UI_RE.test(filePath)) process.exit(0);

console.log(`\n[verify-ui] Ficheiro UI alterado: ${filePath.split('/docs/')[1]}`);
console.log('[verify-ui] A correr testes Playwright...\n');

// ── Verifica se servidor está activo ──────────────────────────
function portFree(port) {
  return new Promise(ok => {
    const s = createServer();
    s.once('error', () => ok(false));          // porta ocupada → servidor já corre
    s.once('listening', () => { s.close(); ok(true); });
    s.listen(port, '127.0.0.1');
  });
}

let serverProc = null;
if (await portFree(PORT)) {
  console.log(`[verify-ui] A iniciar servidor na porta ${PORT}...`);
  serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
    detached: false,
  });
  // Aguarda o servidor estar pronto
  await new Promise(r => setTimeout(r, 1500));
}

// ── Corre verify.mjs ──────────────────────────────────────────
const verify = spawn('node', ['verify.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit',
});

const exitCode = await new Promise(r => verify.on('close', r));
if (serverProc) serverProc.kill();

if (exitCode !== 0) {
  console.error(`\n[verify-ui] ❌ Testes falharam (exit ${exitCode}) — ver verify-shots/`);
} else {
  console.log('\n[verify-ui] ✅ Todos os testes passaram');
}

// Sai sempre com 0 para não bloquear o Claude
process.exit(0);
