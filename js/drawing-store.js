// Saved drawings: per database and symbol, in this browser (localStorage). Formulas read them through Study(), the chart draws them.
import { ACTIVE_DB } from './config.js';

const defaultStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export class DrawingStore {
  constructor(storage = defaultStorage(), key = `drawings_v1${ACTIVE_DB === 'nse' ? '' : '__' + ACTIVE_DB}`) {
    this.storage = storage; this.key = key; this.listeners = new Set(); this.data = null;
  }
  _load() {
    if (this.data) return this.data;
    try { const j = JSON.parse((this.storage && this.storage.getItem(this.key)) || '{}'); this.data = j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { this.data = {}; }
    return this.data;
  }
  _save() { try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked: drawings stay for this visit */ } }
  _fire(symbol) { for (const fn of this.listeners) { try { fn(symbol); } catch (e) { /* ignore */ } } }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  list(symbol) { return this._load()[String(symbol || '').toUpperCase()] || []; }
  symbols() { const d = this._load(); return Object.keys(d).filter((s) => d[s].length); }
  get(symbol, id) { return this.list(symbol).find((d) => d.id === id) || null; }

  add(symbol, drawing) {
    const k = String(symbol || '').toUpperCase(), data = this._load();
    const d = { ...drawing, id: drawing.id || newId() };
    (data[k] = data[k] || []).push(d); this._save(); this._fire(k); return d;
  }
  update(symbol, id, patch) {
    const d = this.get(symbol, id); if (!d) return null;
    Object.assign(d, patch); this._save(); this._fire(String(symbol).toUpperCase()); return d;
  }
  remove(symbol, id) {
    const k = String(symbol || '').toUpperCase(), data = this._load(), l = data[k]; if (!l) return false;
    const n = l.length; data[k] = l.filter((d) => d.id !== id);
    if (!data[k].length) delete data[k];
    if (n === (data[k] || []).length) return false;
    this._save(); this._fire(k); return true;
  }
  clear(symbol) { const k = String(symbol || '').toUpperCase(), data = this._load(); if (!data[k]) return; delete data[k]; this._save(); this._fire(k); }
  /** Copy of a drawing for paste (new id, same place). */
  clone(d) { return JSON.parse(JSON.stringify({ ...d, id: undefined })); }
}

export const drawingStore = new DrawingStore();
