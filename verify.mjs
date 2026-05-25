import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const SHOTS = 'c:/RepoAI/G-FinanceSuite/verify-shots';
mkdirSync(SHOTS, { recursive: true });

const errors   = [];
const warnings = [];
const logs     = [];

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

// Clica via JS puro — útil quando o elemento está coberto por outro
async function jsClick(page, selector) {
  await page.evaluate(sel => document.querySelector(sel)?.click(), selector);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page    = await ctx.newPage();

  page.on('console', m => {
    const t = m.type(), txt = m.text();
    logs.push(`[${t}] ${txt}`);
    if (t === 'error')   errors.push(txt);
    if (t === 'warning') warnings.push(txt);
  });
  page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));

  // ── 1. Carregar página ─────────────────────────────────────────
  console.log('\n=== 1. Carregar página ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, '01-home');
  console.log(`  import-section visível: ${await page.isVisible('#import-section')}`);
  console.log(`  Erros JS ao carregar: ${errors.length === 0 ? '✅ nenhum' : errors.join(' | ')}`);

  // ── 2. Log modal abre/fecha ────────────────────────────────────
  console.log('\n=== 2. Log modal ===');
  await page.click('#log-btn');
  await page.waitForTimeout(300);
  const modalOpen = await page.$eval('#log-modal', el => el.style.display);
  console.log(`  display após abrir: "${modalOpen}"  (esperado: flex)`);
  await shot(page, '02-log-modal');

  // Fecha via JS direto (backdrop coberto pelo dialog)
  await jsClick(page, '#log-modal-backdrop');
  await page.waitForTimeout(200);
  const modalClosed = await page.$eval('#log-modal', el => el.style.display);
  console.log(`  display após fechar backdrop: "${modalClosed}"  (esperado: none)`);

  // Abre de novo e fecha com X
  await page.click('#log-btn');
  await page.waitForTimeout(200);
  await page.click('#log-modal-close');
  await page.waitForTimeout(200);
  const modalClosedX = await page.$eval('#log-modal', el => el.style.display);
  console.log(`  display após fechar X: "${modalClosedX}"  (esperado: none)`);

  // ── 3. Upload JSON de teste ────────────────────────────────────
  console.log('\n=== 3. Upload + processar ficheiro ===');
  const testData = JSON.stringify(
    Array.from({ length: 30 }, (_, i) => ({
      numero_documento: `DOC-${String(i % 8).padStart(3,'0')}`,
      atribuicao:       `ATTR-${i % 3}`,
      montante:         parseFloat((100 + i * 17.5 - (i % 5) * 50).toFixed(2)),
      data:             `2024-0${(i%9)+1}-01`,
      descricao:        `Registo de teste ${i}`,
    }))
  );

  const fileInput = await page.$('#file-input');
  await fileInput.setInputFiles({
    name: 'test-data.json', mimeType: 'application/json',
    buffer: Buffer.from(testData),
  });
  await page.waitForTimeout(800);
  console.log(`  fila visível: ${await page.isVisible('#files-queue')}`);
  await shot(page, '03-file-queued');

  // 1 ficheiro → clicar "Processar" individual
  const processBtn = await page.$('[data-action="process-file"]');
  if (processBtn) {
    await jsClick(page, '[data-action="process-file"]');
    await page.waitForTimeout(1500);
    console.log('  ✅ process-file clicado via delegation');
  }
  await shot(page, '04-after-process');

  // Botão "Analisar e Consolidar"
  const analyseBtn = await page.$('[data-action="start-analysis"]');
  if (analyseBtn) {
    await jsClick(page, '[data-action="start-analysis"]');
    await page.waitForTimeout(1500);
    console.log('  ✅ start-analysis clicado via delegation');
  }
  await shot(page, '05-content');
  console.log(`  content visível: ${await page.isVisible('#content')}`);
  console.log(`  field-selector visível: ${await page.isVisible('#field-selector')}`);

  // ── 4. Op1 — executar análise de duplicados ────────────────────
  console.log('\n=== 4. Op1 — Executar análise duplicados ===');
  const btnRun = await page.$('#btn-run');
  if (btnRun) {
    await page.click('#btn-run');
    await page.waitForTimeout(1000);
    await shot(page, '06-op1-results');
    console.log(`  results-section visível: ${await page.isVisible('#results-section')}`);
    const sTotal = await page.$eval('#s-total', el => el.textContent).catch(() => '—');
    console.log(`  s-total (grupos): ${sTotal}`);
  }

  // ── 5. Cards sumário — delegation ─────────────────────────────
  console.log('\n=== 5. Cards de sumário ===');
  await jsClick(page, '#card-dups');
  await page.waitForTimeout(300);
  const errsBefore = errors.length;
  await jsClick(page, '#card-unique');
  await page.waitForTimeout(300);
  await jsClick(page, '#card-all');
  await page.waitForTimeout(300);
  const errsAfter = errors.length;
  console.log(`  Erros ao clicar cards: ${errsAfter - errsBefore === 0 ? '✅ nenhum' : errsAfter - errsBefore}`);
  await shot(page, '07-after-cards');

  // ── 6. Search field panel ──────────────────────────────────────
  console.log('\n=== 6. Search field panel ===');
  await jsClick(page, '#search-field-btn');
  await page.waitForTimeout(400);
  const panelDisplay = await page.$eval('#search-field-panel', el => el.style.display).catch(() => '—');
  console.log(`  search-field-panel display: "${panelDisplay}"  (esperado: block)`);
  await shot(page, '08-search-panel');

  // ── 7. Op2 — Reconciliação ────────────────────────────────────
  console.log('\n=== 7. Op2 — Reconciliação ===');
  await jsClick(page, '#op2-card');
  await page.waitForTimeout(300);
  console.log(`  recon-config visível: ${await page.isVisible('#recon-config')}`);
  await shot(page, '09-op2-config');

  await page.click('#btn-run-recon');
  await page.waitForTimeout(1000);
  console.log(`  recon-results-section visível: ${await page.isVisible('#recon-results-section')}`);
  const reconTotal = await page.$eval('#recon-s-total', el => el.textContent).catch(() => '—');
  console.log(`  recon-s-total: ${reconTotal}`);
  await shot(page, '10-op2-results');

  // ── 8. Recon filter cards ──────────────────────────────────────
  console.log('\n=== 8. Recon cards — delegation ===');
  const e1 = errors.length;
  await jsClick(page, '#recon-card-nok');
  await page.waitForTimeout(300);
  await jsClick(page, '#recon-card-ok');
  await page.waitForTimeout(300);
  await jsClick(page, '#recon-card-all');
  await page.waitForTimeout(300);
  console.log(`  Erros ao clicar recon cards: ${errors.length - e1 === 0 ? '✅ nenhum' : errors.length - e1}`);

  // ── 9. Recon table expand ──────────────────────────────────────
  console.log('\n=== 9. Recon table row expand ===');
  const firstRow = await page.$('#recon-table-body tr[data-expand]');
  if (firstRow) {
    const expandId = await firstRow.getAttribute('data-expand');
    await firstRow.click();
    await page.waitForTimeout(300);
    const expandVisible = await page.$eval(`#${expandId}`, el => el.style.display).catch(() => '—');
    console.log(`  expand row display: "${expandVisible}"  (esperado: table-row ou '')`);
    await shot(page, '11-row-expanded');
  } else {
    console.log('  ⚠️ nenhuma linha com data-expand encontrada');
  }

  // ── 10. Recon export modal ────────────────────────────────────
  console.log('\n=== 10. Recon export modal ===');
  await page.click('#btn-open-recon-export');
  await page.waitForTimeout(300);
  const reconModal = await page.$eval('#recon-export-modal', el => el.style.display);
  console.log(`  recon-export-modal display: "${reconModal}"  (esperado: flex)`);
  await shot(page, '12-recon-export-modal');

  // Clicar formato JSON
  await jsClick(page, '.recon-export-fmt-btn[data-format="json"]');
  await page.waitForTimeout(200);
  const previewText = await page.$eval('#recon-export-preview', el => el.textContent);
  console.log(`  preview texto: "${previewText.trim()}"`);

  // Fechar modal
  await page.click('#btn-close-recon-export-modal');
  await page.waitForTimeout(200);
  const reconModalClosed = await page.$eval('#recon-export-modal', el => el.style.display);
  console.log(`  recon-export-modal após fechar: "${reconModalClosed}"`);

  // ── 11. Op1 export modal ──────────────────────────────────────
  console.log('\n=== 11. Op1 export modal ===');
  await jsClick(page, '#op1-card');
  await page.waitForTimeout(300);
  await jsClick(page, '#btn-run');
  await page.waitForTimeout(1000);
  // Clicar botão exportar no dup-list
  const exportBtn = await page.$('[data-action="open-export"]');
  if (exportBtn) {
    await exportBtn.click();
    await page.waitForTimeout(300);
    const exportModal = await page.$eval('#export-modal', el => el.style.display);
    console.log(`  export-modal display: "${exportModal}"  (esperado: flex)`);
    await shot(page, '13-export-modal');

    // Testar formato CSV
    await jsClick(page, '.export-fmt-btn[data-format="csv"]');
    await page.waitForTimeout(200);
    const previewOp1 = await page.$eval('#export-preview', el => el.textContent);
    console.log(`  preview CSV: "${previewOp1.trim().substring(0,50)}"`);

    await page.click('#btn-close-export-modal');
    await page.waitForTimeout(200);
    const exportClosed = await page.$eval('#export-modal', el => el.style.display);
    console.log(`  export-modal após fechar: "${exportClosed}"`);
  } else {
    console.log('  ⚠️ botão data-action="open-export" não encontrado no dup-list');
  }

  // ── 12. Reset ─────────────────────────────────────────────────
  console.log('\n=== 12. Reset ===');
  await page.click('#btn-ctb-reset');
  await page.waitForTimeout(300);
  console.log(`  import-section após reset: ${await page.isVisible('#import-section')}`);
  console.log(`  content após reset: ${await page.isVisible('#content')}`);
  await shot(page, '14-after-reset');

  // ── 13. Sticky reset ──────────────────────────────────────────
  // (não testável facilmente sem scroll — deixar para verificação manual)

  // ── RESUMO FINAL ──────────────────────────────────────────────
  console.log('\n=== RESUMO FINAL ===');
  const relevantErrors = errors.filter(e =>
    !e.includes('SheetJS') && !e.includes('jsPDF') && !e.includes('Chart.js') &&
    !e.includes('cdnjs') && !e.includes('ERR_NAME_NOT_RESOLVED') && !e.includes('ERR_INTERNET')
  );
  if (relevantErrors.length === 0) {
    console.log('  ✅ Zero erros JS relevantes');
  } else {
    relevantErrors.forEach(e => console.log(`  ❌ ${e}`));
  }
  console.log(`  Total erros console (incl CDN): ${errors.length}`);
  console.log(`  Total logs console: ${logs.length}`);

  await browser.close();

  writeFileSync(`${SHOTS}/console-log.txt`, logs.join('\n'));
  console.log(`\nScreenshots em: ${SHOTS}/`);
  console.log(`Log completo em: ${SHOTS}/console-log.txt`);

  if (relevantErrors.length > 0) process.exit(1);
})();
