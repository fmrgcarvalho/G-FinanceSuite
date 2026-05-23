/* ============================================================
   G-FinanceSuite — Módulo Paginação
   Renderização de controlos de paginação para Op1 e Op2.
   Depende de: AppState (currentPage), ui.js (show/hide)
   ============================================================ */

import { AppState } from '../state.js';

// ── IDs DOM necessários ────────────────────────────────────────
export const REQUIRED_IDS = [
  'pagination', 'pagination-top', 'pag-info', 'pag-info-top',
  'pag-btns', 'pag-btns-top',
  'pagination-recon-bottom', 'pagination-recon-top',
  'pag-info-recon-bottom', 'pag-info-recon-top',
  'pag-btns-recon-bottom', 'pag-btns-recon-top',
];

// ── Mostrar / esconder paginação ───────────────────────────────
export function setPagination(display, infoText, isRecon = false) {
  if (isRecon) {
    const bottom = document.getElementById('pagination-recon-bottom');
    const top    = document.getElementById('pagination-recon-top');
    if (bottom) bottom.style.display = display;
    if (top)    top.style.display    = display;
    if (infoText !== undefined) {
      const bi = document.getElementById('pag-info-recon-bottom');
      const ti = document.getElementById('pag-info-recon-top');
      if (bi) bi.textContent = infoText;
      if (ti) ti.textContent = infoText;
    }
  } else {
    const bottom = document.getElementById('pagination');
    const top    = document.getElementById('pagination-top');
    if (bottom) bottom.style.display = display;
    if (top)    top.style.display    = display;
    if (infoText !== undefined) {
      const bi = document.getElementById('pag-info');
      const ti = document.getElementById('pag-info-top');
      if (bi) bi.textContent = infoText;
      if (ti) ti.textContent = infoText;
    }
  }
}

// ── Renderizar botões de paginação ─────────────────────────────
export function renderPagination(totalPages, callback, isRecon = false) {
  const suffix     = isRecon ? '-recon-bottom' : '';
  const pagBtns    = document.getElementById(`pag-btns${suffix}`);
  const pagBtnsTop = document.getElementById(`pag-btns${isRecon ? '-recon-top' : '-top'}`);
  if (!pagBtns) return;

  pagBtns.innerHTML = '';
  if (pagBtnsTop) pagBtnsTop.innerHTML = '';
  if (totalPages <= 1) return;

  const makeBtn = (num, label) => {
    const btn = document.createElement('button');
    btn.textContent = label || num;
    btn.style.cssText = `padding:6px 10px;border:1px solid #ddd;` +
      `background:${AppState.currentPage === num ? '#8ec73d' : '#fff'};` +
      `color:${AppState.currentPage === num ? '#fff' : '#333'};` +
      `border-radius:4px;cursor:pointer;`;
    if (AppState.currentPage !== num) {
      btn.onclick = () => { AppState.currentPage = num; callback(); };
    }
    return btn;
  };

  const addBtn = (num, label) => {
    pagBtns.appendChild(makeBtn(num, label));
    if (pagBtnsTop) pagBtnsTop.appendChild(makeBtn(num, label));
  };

  const addDots = () => {
    pagBtns.appendChild(document.createTextNode('...'));
    if (pagBtnsTop) pagBtnsTop.appendChild(document.createTextNode('...'));
  };

  if (AppState.currentPage > 1) addBtn(AppState.currentPage - 1, '◀ Anterior');
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - AppState.currentPage) <= 1) addBtn(i);
    else if (i === 2 || i === totalPages - 1) addDots();
  }
  if (AppState.currentPage < totalPages) addBtn(AppState.currentPage + 1, 'Próxima ▶');
}
