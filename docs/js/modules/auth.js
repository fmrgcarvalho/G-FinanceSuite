/* ============================================================
   G-FinanceSuite — Autenticação por Token + Sessão IndexedDB
   BD separada: GFinanceAuth (não colide com GFinanceDB/filestore)
   ============================================================ */

import { USERS, SESSION_HOURS } from '../../config/auth.js';

const DB_NAME     = 'GFinanceAuth';
const DB_VER      = 1;
const STORE       = 'session';
const SESSION_KEY = 1;

function _open() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function _get(db) {
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(SESSION_KEY);
    req.onsuccess = e => res(e.target.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}

function _put(db, record) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

function _delete(db) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(SESSION_KEY);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

export async function initAuth() {
  await _open();
}

export async function isSessionValid() {
  try {
    const db  = await _open();
    const rec = await _get(db);
    if (!rec) return false;
    return new Date(rec.expiresAt) > new Date();
  } catch {
    return false;
  }
}

/** Retorna o nome do utilizador logado, ou null se sessão inválida. */
export async function getCurrentUser() {
  try {
    const db  = await _open();
    const rec = await _get(db);
    if (!rec || new Date(rec.expiresAt) <= new Date()) return null;
    return rec.name || null;
  } catch {
    return null;
  }
}

/** Valida token e cria sessão. Retorna o nome do utilizador ou null se falhar. */
export async function login(token) {
  const user = USERS.find(u => u.token === token);
  if (!user) return null;
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
  const db = await _open();
  await _put(db, { id: SESSION_KEY, token, name: user.name, expiresAt });
  return user.name;
}

export async function logout() {
  const db = await _open();
  await _delete(db);
}
