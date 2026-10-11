// FormulaStore: the user's saved formulas (browser storage) + the built-in library.
// Built-in ids start with "b:" and are read-only. User ids start with "u:".
import { BUILTIN_FORMULAS } from './builtin-formulas.js';

const KEY = 'amibroker_formulas_v1';
let counter = 0;
const newId = () => `u:${Date.now().toString(36)}${(counter++).toString(36)}`;

class FormulaStore {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.user = [];
    this.builtin = BUILTIN_FORMULAS.map((f) => ({ ...f, id: `b:${f.key}`, builtin: true }));
    this.load();
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.formulas)) {
        this.user = data.formulas.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.code === 'string');
      }
    } catch (e) { this.user = []; }
  }

  persist() {
    try { if (this.storage) this.storage.setItem(KEY, JSON.stringify({ v: 1, formulas: this.user })); return true; }
    catch (e) { return false; }
  }

  all() { return [...this.builtin, ...this.user]; }
  get(id) { return this.all().find((f) => f.id === id) || null; }
  isBuiltin(id) { return String(id).startsWith('b:'); }
  categories() { return [...new Set(this.builtin.map((f) => f.category))]; }

  uniqueName(name) {
    const used = new Set(this.user.map((f) => f.name.toLowerCase()));
    let base = String(name || 'Untitled').trim().slice(0, 60) || 'Untitled', out = base, k = 2;
    while (used.has(out.toLowerCase())) out = `${base} (${k++})`;
    return out;
  }

  /** Save. With an existing user id the formula is updated, otherwise a new one is created. Returns the saved formula. */
  save({ id, name, code, description = '', kind = 'chart', weight }) {
    const now = Date.now();
    name = String(name || '').trim().slice(0, 60);
    if (!name) throw new Error('Give the formula a name');
    const existing = id && !this.isBuiltin(id) ? this.user.find((f) => f.id === id) : null;
    if (existing) {
      const clash = this.user.find((f) => f.id !== existing.id && f.name.toLowerCase() === name.toLowerCase());
      if (clash) throw new Error(`A formula named "${name}" already exists`);
      Object.assign(existing, { name, code, description, kind, weight: weight ?? existing.weight, updated: now });
      this.persist();
      return existing;
    }
    const f = { id: newId(), name: this.uniqueName(name), code, description, kind, weight, created: now, updated: now };
    this.user.push(f);
    this.persist();
    return f;
  }

  remove(id) {
    const i = this.user.findIndex((f) => f.id === id);
    if (i < 0) return false;
    this.user.splice(i, 1); this.persist(); return true;
  }

  duplicate(id) {
    const f = this.get(id); if (!f) return null;
    return this.save({ name: `${f.name} copy`, code: f.code, description: f.description || '', kind: f.kind || 'chart', weight: f.weight });
  }

  exportAll() { return JSON.stringify({ app: 'amibroker-web', v: 1, formulas: this.user }, null, 2); }

  /** Imports a JSON backup (from exportAll). Returns how many formulas were added. */
  importJSON(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.formulas;
    if (!Array.isArray(list)) throw new Error('Not a formula backup file');
    let added = 0;
    for (const f of list) {
      if (!f || typeof f.code !== 'string') continue;
      this.save({ name: f.name || 'Imported', code: f.code, description: f.description || '', kind: f.kind || 'chart', weight: f.weight });
      added++;
    }
    return added;
  }
}

export const formulaStore = new FormulaStore();
export { FormulaStore };
