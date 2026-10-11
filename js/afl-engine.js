// AFL (AmiBroker Formula Language) interpreter.
//   tokenize -> parse -> run. No DOM. Arrays are Float64Array (NaN = Null), scalars are numbers.
//   aflEngine.run(code, bars, { symbol, params }) returns plots, shapes, Buy/Sell/Filter/columns, errors...
import * as L from './afl-lib.js';
import { isArr, newArr, toArr } from './afl-lib.js';

export class AFLError extends Error {
  constructor(msg, line) { super(line ? `Line ${line}: ${msg}` : msg); this.line = line || 0; this.plain = msg; }
}

// ======================================================================= lexer
const TWO = ['++', '--', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '==', '!=', '<=', '>=', '&&', '||'];
const ONE = '+-*/%^<>=!&|?:,;(){}[]';

export function tokenize(src) {
  const toks = []; let i = 0, line = 1; const n = src.length;
  const num = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y;
  const idr = /[A-Za-z_][A-Za-z0-9_]*/y;
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === ' ' || ch === '﻿') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (ch === '#') { while (i < n && src[i] !== '\n') i++; continue; } // #include / #pragma are ignored
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      num.lastIndex = i; const m = num.exec(src);
      toks.push({ t: 'num', v: parseFloat(m[0]), line }); i += m[0].length; continue;
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      idr.lastIndex = i; const m = idr.exec(src);
      toks.push({ t: 'id', v: m[0], line }); i += m[0].length; continue;
    }
    if (ch === '"' || ch === "'") {
      let s = '', j = i + 1, closed = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\' && j + 1 < n) { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; continue; }
        if (c === ch) { closed = true; break; }
        if (c === '\n') line++;
        s += c; j++;
      }
      if (!closed) throw new AFLError('Unterminated string', line);
      toks.push({ t: 'str', v: s, line }); i = j + 1; continue;
    }
    const two = src.substr(i, 2);
    if (TWO.includes(two)) { toks.push({ t: 'op', v: two, line }); i += 2; continue; }
    if (ONE.includes(ch)) { toks.push({ t: 'op', v: ch, line }); i++; continue; }
    throw new AFLError(`Unexpected character '${ch}'`, line);
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

// ======================================================================= parser
const ASSIGN = ['=', '+=', '-=', '*=', '/=', '%=', '|=', '&='];

class Parser {
  constructor(toks) { this.toks = toks; this.p = 0; }
  peek(o = 0) { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  isKw(v) { const t = this.peek(); return t.t === 'id' && t.v.toLowerCase() === v; }
  err(msg, tok = this.peek()) { return new AFLError(msg, tok.line); }
  expectOp(v) {
    if (!this.isOp(v)) { const t = this.peek(); throw this.err(`Expected '${v}' but found ${t.t === 'eof' ? 'end of formula' : `'${t.v}'`}`); }
    return this.next();
  }
  semi() {
    if (this.isOp(';')) { this.next(); return; }
    if (this.isOp('}') || this.peek().t === 'eof') return;
    const t = this.peek(); throw this.err(`Missing ';' before '${t.v}'`, this.toks[Math.max(0, this.p - 1)]);
  }

  program() { const out = []; while (this.peek().t !== 'eof') out.push(this.statement()); return out; }

  block() {
    this.expectOp('{'); const body = [];
    while (!this.isOp('}')) { if (this.peek().t === 'eof') throw this.err("Missing '}'"); body.push(this.statement()); }
    this.next(); return { type: 'block', body };
  }

  statement() {
    const t = this.peek();
    if (this.isOp('{')) return this.block();
    if (this.isOp(';')) { this.next(); return { type: 'noop' }; }
    if (t.t === 'id') {
      const kw = t.v.toLowerCase();
      if (kw === 'if') {
        this.next(); this.expectOp('('); const cond = this.expr(); this.expectOp(')');
        const then = this.statement(); let els = null;
        if (this.isKw('else')) { this.next(); els = this.statement(); }
        return { type: 'if', cond, then, els, line: t.line };
      }
      if (kw === 'while') {
        this.next(); this.expectOp('('); const cond = this.expr(); this.expectOp(')');
        return { type: 'while', cond, body: this.statement(), line: t.line };
      }
      if (kw === 'do') {
        this.next(); const body = this.statement();
        if (!this.isKw('while')) throw this.err("Expected 'while' after do-block");
        this.next(); this.expectOp('('); const cond = this.expr(); this.expectOp(')'); this.semi();
        return { type: 'dowhile', cond, body, line: t.line };
      }
      if (kw === 'for') {
        this.next(); this.expectOp('(');
        const list = (end) => { const xs = []; if (!this.isOp(end)) { xs.push(this.expr()); while (this.isOp(',')) { this.next(); xs.push(this.expr()); } } return xs; };
        const init = list(';'); this.expectOp(';');
        const cond = this.isOp(';') ? null : this.expr(); this.expectOp(';');
        const step = list(')'); this.expectOp(')');
        return { type: 'for', init, cond, step, body: this.statement(), line: t.line };
      }
      if (kw === 'break') { this.next(); this.semi(); return { type: 'break' }; }
      if (kw === 'continue') { this.next(); this.semi(); return { type: 'continue' }; }
      if (kw === 'return') {
        this.next(); const e = (this.isOp(';') || this.isOp('}')) ? null : this.expr(); this.semi();
        return { type: 'return', e, line: t.line };
      }
      if (kw === 'function' || kw === 'procedure') {
        this.next(); const nameTok = this.next();
        if (nameTok.t !== 'id') throw this.err('Function name expected', nameTok);
        this.expectOp('('); const params = [];
        while (!this.isOp(')')) {
          const pt = this.next(); if (pt.t !== 'id') throw this.err('Parameter name expected', pt);
          params.push(pt.v.toLowerCase()); if (this.isOp(',')) this.next();
        }
        this.next();
        return { type: 'funcdef', name: nameTok.v.toLowerCase(), params, body: this.block(), line: t.line };
      }
      if (kw === 'global' || kw === 'static') { while (!this.isOp(';') && this.peek().t !== 'eof') this.next(); this.semi(); return { type: 'noop' }; }
    }
    const e = this.expr(); this.semi();
    return { type: 'expr', e, line: t.line };
  }

  expr() { return this.assign(); }
  assign() {
    const left = this.ternary();
    const t = this.peek();
    if (t.t === 'op' && ASSIGN.includes(t.v)) {
      if (left.type !== 'id' && left.type !== 'idx') throw this.err('Left side of assignment must be a variable', t);
      this.next();
      return { type: 'assign', op: t.v, target: left, value: this.assign(), line: t.line };
    }
    return left;
  }
  ternary() {
    const c = this.or();
    if (this.isOp('?')) {
      const t = this.next(); const a = this.assign(); this.expectOp(':'); const b = this.assign();
      return { type: 'tern', c, a, b, line: t.line };
    }
    return c;
  }
  bin(sub, ops, kws = []) {
    let left = sub.call(this);
    for (;;) {
      const t = this.peek();
      const hit = (t.t === 'op' && ops.includes(t.v)) || (t.t === 'id' && kws.includes(t.v.toLowerCase()));
      if (!hit) return left;
      this.next();
      const op = t.t === 'id' ? t.v.toLowerCase() : (t.v === '&&' ? 'and' : t.v === '||' ? 'or' : t.v);
      left = { type: 'bin', op, l: left, r: sub.call(this), line: t.line };
    }
  }
  or() { return this.bin(this.and, ['|', '||'], ['or']); }
  and() { return this.bin(this.eq, ['&', '&&'], ['and']); }
  eq() { return this.bin(this.rel, ['==', '!=']); }
  rel() { return this.bin(this.add, ['<', '>', '<=', '>=']); }
  add() { return this.bin(this.mul, ['+', '-']); }
  mul() { return this.bin(this.unary, ['*', '/', '%']); }
  unary() {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) { this.next(); return { type: 'un', op: t.v, e: this.unary(), line: t.line }; }
    if (t.t === 'id' && t.v.toLowerCase() === 'not') { this.next(); return { type: 'un', op: '!', e: this.unary(), line: t.line }; }
    return this.pow();
  }
  pow() {
    const base = this.postfix();
    if (this.isOp('^')) { const t = this.next(); return { type: 'bin', op: '^', l: base, r: this.unary(), line: t.line }; }
    return base;
  }
  postfix() {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '[') {
        this.next(); const i = this.expr(); this.expectOp(']');
        e = { type: 'idx', base: e, index: i, line: t.line };
      } else if (t.t === 'op' && t.v === '(' && e.type === 'id') {
        this.next(); const args = [];
        while (!this.isOp(')')) {
          if (this.peek().t === 'eof') throw this.err("Missing ')'");
          args.push(this.assign()); if (this.isOp(',')) this.next(); else if (!this.isOp(')')) throw this.err(`Expected ',' or ')' but found '${this.peek().v}'`);
        }
        this.next(); e = { type: 'call', name: e.name, args, line: t.line };
      } else if (t.t === 'op' && (t.v === '++' || t.v === '--') && (e.type === 'id' || e.type === 'idx')) {
        this.next(); e = { type: 'postinc', target: e, d: t.v === '++' ? 1 : -1, line: t.line };
      } else return e;
    }
  }
  primary() {
    const t = this.next();
    if (t.t === 'num') return { type: 'num', v: t.v };
    if (t.t === 'str') return { type: 'str', v: t.v };
    if (t.t === 'id') return { type: 'id', name: t.v.toLowerCase(), raw: t.v, line: t.line };
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')'); return e; }
    throw this.err(t.t === 'eof' ? 'Unexpected end of formula' : `Unexpected '${t.v}'`, t);
  }
}

export function parse(code) { return new Parser(tokenize(code)).program(); }

// ======================================================================= colors / constants
// AmiBroker palette indexes (0..55) -> hex. Values >= 256 are RGB(r,g,b) = r + g*256 + b*65536.
const PALETTE = {
  0: '#000000', 1: '#993300', 2: '#333300', 3: '#003300', 4: '#003366', 5: '#000080', 6: '#333399', 7: '#333333',
  8: '#800000', 9: '#ff6600', 10: '#808000', 11: '#008000', 12: '#008080', 13: '#0000ff', 14: '#666699', 15: '#808080',
  32: '#ff0000', 33: '#ff9900', 34: '#99cc00', 35: '#339966', 36: '#33cccc', 37: '#3366ff', 38: '#800080', 39: '#969696',
  40: '#ff00ff', 41: '#ffcc00', 42: '#ffff00', 43: '#00ff00', 44: '#00ffff', 45: '#00ccff', 46: '#993366', 47: '#c0c0c0',
  48: '#ff99cc', 49: '#ffcc99', 50: '#ffff99', 51: '#ccffcc', 52: '#ccffff', 53: '#99ccff', 54: '#cc99ff', 55: '#ffffff',
};
const COLOR_NAMES = {
  Black: 0, Brown: 1, DarkOliveGreen: 2, DarkGreen: 3, DarkTeal: 4, DarkBlue: 5, Indigo: 6, DarkGrey: 7, DarkRed: 8, Orange: 9,
  DarkYellow: 10, Green: 11, Teal: 12, Blue: 13, BlueGrey: 14, Grey40: 15, Red: 32, LightOrange: 33, Lime: 34, SeaGreen: 35,
  Aqua: 36, LightBlue: 37, Violet: 38, Grey50: 39, Pink: 40, Gold: 41, Yellow: 42, BrightGreen: 43, Turquoise: 44, SkyblueDup: 45,
  Skyblue: 45, Plum: 46, LightGrey: 47, Rose: 48, Tan: 49, LightYellow: 50, PaleGreen: 51, PaleTurquoise: 52, PaleBlue: 53,
  Lavender: 54, White: 55, Default: -1, Custom1: 0x000000,
};
export function colorToHex(c) {
  if (typeof c !== 'number' || Number.isNaN(c)) return null;
  if (c < 0) return null;                              // colorDefault: the chart picks
  if (c < 256) { return c === 0 ? '#e2e8f0' : (PALETTE[c] || '#94a3b8'); } // black is unreadable on the dark chart, so it is drawn light
  const v = Math.floor(c);
  const h = (x) => x.toString(16).padStart(2, '0');
  return `#${h(v & 255)}${h((v >> 8) & 255)}${h((v >> 16) & 255)}`;
}
export function hexToColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
  if (!m) return -1;
  return parseInt(m[1], 16) + parseInt(m[2], 16) * 256 + parseInt(m[3], 16) * 65536;
}

export const STYLE = {
  Line: 1, Histogram: 2, Thick: 4, Dots: 8, NoLine: 16, Dashed: 32, Candle: 64, Bar: 128, NoDraw: 256, Staircase: 512,
  SwingDots: 1024, NoRescale: 2048, NoLabel: 4096, LeftAxisScale: 8192, OwnScale: 16384, Area: 32768, ClipMinMax: 65536,
  Gradient: 131072, Cloud: 262144, Default: 1,
};
export const SHAPE = {
  None: 0, UpArrow: 1, DownArrow: 2, HollowUpArrow: 3, HollowDownArrow: 4, SmallUpTriangle: 5, SmallDownTriangle: 6,
  HollowSmallUpTriangle: 7, HollowSmallDownTriangle: 8, UpTriangle: 9, DownTriangle: 10, HollowUpTriangle: 11,
  HollowDownTriangle: 12, Circle: 13, HollowCircle: 14, SmallCircle: 15, Square: 16, HollowSquare: 17, SmallSquare: 18,
  Star: 19, HollowStar: 20, Cross: 21,
};
const DOWN_SHAPES = new Set([2, 4, 6, 8, 10, 12]);

// ======================================================================= helpers
const truthy = (x) => x !== 0 && !Number.isNaN(x);
const NUM = {
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
  '/': (a, b) => { const r = a / b; return Number.isFinite(r) ? r : NaN; },
  '%': (a, b) => a % b, '^': (a, b) => Math.pow(a, b),
  '<': (a, b) => (a < b ? 1 : 0), '>': (a, b) => (a > b ? 1 : 0), '<=': (a, b) => (a <= b ? 1 : 0), '>=': (a, b) => (a >= b ? 1 : 0),
  '==': (a, b) => (a === b ? 1 : 0), '!=': (a, b) => (a !== b && !(Number.isNaN(a) && Number.isNaN(b)) ? 1 : 0),
  // & and | are bitwise (styleLine | styleThick), AND / OR / && / || are logical
  '&': (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? 0 : (Math.trunc(a) & Math.trunc(b))),
  '|': (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? 0 : (Math.trunc(a) | Math.trunc(b))),
  and: (a, b) => (truthy(a) && truthy(b) ? 1 : 0), or: (a, b) => (truthy(a) || truthy(b) ? 1 : 0),
};
const fmtNum = (x, decimals) => (Number.isNaN(x) ? '-' : Number(x).toFixed(Math.max(0, Math.min(8, decimals))));
const decimalsOf = (fmt) => { const f = Number(fmt); return Number.isFinite(f) ? Math.round((f % 1) * 10 + 1e-9) : 2; };

function toStr(v) {
  if (typeof v === 'string') return v;
  if (isArr(v)) return fmtNum(v[v.length - 1], 2);
  return Number.isNaN(v) ? '-' : String(Math.round(v * 1e6) / 1e6);
}

function strFormat(fmt, args) {
  let k = 0;
  return String(fmt).replace(/%(-?\d*)(?:\.(\d+))?([dfgsiex%])/g, (m, w, p, c) => {
    if (c === '%') return '%';
    const a = args[k++];
    const val = isArr(a) ? a[a.length - 1] : a;
    if (c === 's') return String(typeof val === 'string' ? val : toStr(val));
    const x = Number(val);
    if (c === 'd' || c === 'i') return Number.isNaN(x) ? '-' : String(Math.round(x));
    if (c === 'f') return fmtNum(x, p === undefined ? 6 : Number(p));
    if (c === 'e') return x.toExponential(p === undefined ? 6 : Number(p));
    return Number.isNaN(x) ? '-' : String(p === undefined ? Math.round(x * 1e6) / 1e6 : Number(x.toPrecision(Number(p) || 1)));
  });
}

// ======================================================================= interpreter
const MAX_STEPS = 30_000_000;
const SPECIAL = ['buy', 'sell', 'short', 'cover', 'filter', 'title', 'buyprice', 'sellprice', 'shortprice', 'coverprice',
  'positionsize', 'positionscore', 'graphxspace', 'maxgraphsize'];

class Interp {
  constructor(bars, opts, res) {
    this.bars = bars; this.opts = opts || {}; this.res = res;
    this.n = bars.t.length;
    this.globals = new Map();
    this.funcs = new Map();
    this.steps = 0;
    this.owned = new WeakSet();
    this.retVal = 0;
    this.depth = 0;
    this.line = 0;
    this.buildConsts();
    this.lib = buildFunctions(this);
  }

  buildConsts() {
    const b = this.bars, n = this.n, c = new Map();
    const arr = (a) => Float64Array.from(a);
    const O = arr(b.o), H = arr(b.h), Lo = arr(b.l), C = arr(b.c), V = arr(b.v);
    this.O = O; this.H = H; this.Lw = Lo; this.C = C; this.V = V;
    const put = (names, v) => names.forEach((x) => c.set(x, v));
    put(['open', 'o'], O); put(['high', 'h'], H); put(['low', 'l'], Lo); put(['close', 'c'], C); put(['volume', 'v'], V);
    put(['oi'], newArr(n, 0));
    c.set('avg', Float64Array.from(H, (x, i) => (x + Lo[i]) / 2));
    c.set('delivery', arr(b.dq || newArr(n))); c.set('delpct', arr(b.delpct || newArr(n)));
    c.set('barcount', n); c.set('true', 1); c.set('false', 0); c.set('null', NaN); c.set('pi', Math.PI);
    for (const [k, v] of Object.entries(COLOR_NAMES)) c.set('color' + k.toLowerCase(), v);
    for (const [k, v] of Object.entries(STYLE)) c.set('style' + k.toLowerCase(), v);
    for (const [k, v] of Object.entries(SHAPE)) c.set('shape' + k.toLowerCase(), v);
    for (let d = 0; d <= 9; d++) c.set('shapedigit' + d, 100 + d);
    this.consts = c;
  }

  tick() { if (++this.steps > MAX_STEPS) throw new AFLError('Execution limit exceeded (infinite loop?)', this.line); }
  fail(msg, line) { throw new AFLError(msg, line || this.line); }

  // ---- values
  A(v) { return toArr(v, this.n); }
  scalar(v) { return isArr(v) ? v[v.length - 1] : (typeof v === 'number' ? v : NaN); }
  cond(v) { return isArr(v) ? truthy(v[v.length - 1]) : (typeof v === 'string' ? v.length > 0 : truthy(v)); }

  binary(op, a, b, line) {
    if (typeof a === 'string' || typeof b === 'string') {
      if (op === '+') return toStr(a) + toStr(b);
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
      this.fail(`Operator '${op}' cannot be used with text`, line);
    }
    const f = NUM[op], aa = isArr(a), ba = isArr(b);
    if (!aa && !ba) return f(a, b);
    const n = this.n, out = new Float64Array(n);
    if (aa && ba) for (let i = 0; i < n; i++) out[i] = f(a[i], b[i]);
    else if (aa) for (let i = 0; i < n; i++) out[i] = f(a[i], b);
    else for (let i = 0; i < n; i++) out[i] = f(a, b[i]);
    return out;
  }

  // ---- variables
  lookup(name, raw, line) {
    if (this.scope.has(name)) return this.scope.get(name);
    if (this.consts.has(name)) return this.consts.get(name);
    this.fail(`Variable '${raw}' used without having been initialized`, line);
  }

  setIndexed(target, value, line) {
    const name = target.base.name;
    if (target.base.type !== 'id') this.fail('Invalid assignment target', line);
    const idx = this.scalar(this.ev(target.index));
    let arr = this.scope.has(name) ? this.scope.get(name) : null;
    if (arr === null) arr = newArr(this.n);
    if (!isArr(arr)) arr = newArr(this.n, typeof arr === 'number' ? arr : NaN);
    if (!this.owned.has(arr)) { arr = Float64Array.from(arr); this.owned.add(arr); } // copy on first write: Close etc. stay intact
    const i = Math.trunc(idx);
    if (!(i >= 0 && i < this.n)) this.fail(`Array index ${idx} is out of range 0..${this.n - 1}`, line);
    arr[i] = this.scalar(value);
    this.scope.set(name, arr);
  }

  assignTo(target, value, line) {
    if (target.type === 'id') {
      // an array we edit element-by-element must never be shared with a second variable
      if (isArr(value) && this.owned.has(value)) value = Float64Array.from(value);
      this.scope.set(target.name, value); return;
    }
    this.setIndexed(target, value, line);
  }

  // ---- expressions
  ev(e) {
    switch (e.type) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'id': return this.lookup(e.name, e.raw, e.line);
      case 'idx': {
        const base = this.ev(e.base), i = this.ev(e.index);
        if (typeof base === 'string') return base[Math.trunc(i)] || '';
        const k = Math.trunc(this.scalar(i));
        if (!isArr(base)) return base;
        return k >= 0 && k < base.length ? base[k] : NaN;
      }
      case 'call': return this.call(e);
      case 'un': {
        const v = this.ev(e.e);
        if (typeof v === 'string') this.fail('Text cannot be used here', e.line);
        if (e.op === '+') return v;
        if (e.op === '-') return isArr(v) ? v.map((x) => -x) : -v;
        return isArr(v) ? v.map((x) => (truthy(x) ? 0 : 1)) : (truthy(v) ? 0 : 1);
      }
      case 'bin': {
        // AND / OR are element-wise (not short-circuit), like in AmiBroker
        return this.binary(e.op, this.ev(e.l), this.ev(e.r), e.line);
      }
      case 'tern': {
        const c = this.ev(e.c);
        if (isArr(c)) return this.lib.iif([c, this.ev(e.a), this.ev(e.b)]);
        return truthy(c) ? this.ev(e.a) : this.ev(e.b);
      }
      case 'assign': {
        let v = this.ev(e.value);
        if (e.op !== '=') {
          const cur = e.target.type === 'id' ? this.lookup(e.target.name, e.target.raw, e.line) : this.ev(e.target);
          v = this.binary(e.op.slice(0, -1), cur, v, e.line);
        }
        this.assignTo(e.target, v, e.line);
        return v;
      }
      case 'postinc': {
        const old = this.ev(e.target);
        this.assignTo(e.target, this.binary('+', old, e.d, e.line), e.line);
        return old;
      }
      default: this.fail('Unsupported expression', e.line);
    }
  }

  call(e) {
    this.line = e.line;
    const args = e.args.map((a) => this.ev(a));
    const uf = this.funcs.get(e.name);
    if (uf) return this.callUser(uf, args, e.line);
    const f = this.lib[e.name];
    if (!f) this.fail(`Function '${e.name}' is not supported`, e.line);
    return f(args, e);
  }

  callUser(def, args, line) {
    if (++this.depth > 200) this.fail('Function calls nested too deeply', line);
    const saved = this.scope, local = new Map();
    def.params.forEach((p, i) => {
      let v = i < args.length ? args[i] : NaN;
      if (isArr(v) && this.owned.has(v)) v = Float64Array.from(v);
      local.set(p, v);
    });
    this.scope = local; this.retVal = 0;
    this.tick();
    try { this.execList(def.body.body); } finally { this.scope = saved; this.depth--; }
    const r = this.retVal; this.retVal = 0; return r;
  }

  // ---- statements. return codes: 0 normal, 1 break, 2 continue, 3 return
  execList(list) { for (const s of list) { const r = this.exec(s); if (r) return r; } return 0; }
  exec(s) {
    switch (s.type) {
      case 'expr': this.line = s.line; this.ev(s.e); return 0;
      case 'block': return this.execList(s.body);
      case 'noop': case 'funcdef': return 0;
      case 'if': this.line = s.line;
        if (this.cond(this.ev(s.cond))) return this.exec(s.then);
        return s.els ? this.exec(s.els) : 0;
      case 'for': {
        this.line = s.line; s.init.forEach((x) => this.ev(x));
        while (!s.cond || this.cond(this.ev(s.cond))) {
          this.tick();
          const r = this.exec(s.body);
          if (r === 1) break; if (r === 3) return 3;
          s.step.forEach((x) => this.ev(x));
        }
        return 0;
      }
      case 'while': this.line = s.line;
        while (this.cond(this.ev(s.cond))) { this.tick(); const r = this.exec(s.body); if (r === 1) break; if (r === 3) return 3; }
        return 0;
      case 'dowhile': this.line = s.line;
        do { this.tick(); const r = this.exec(s.body); if (r === 1) break; if (r === 3) return 3; } while (this.cond(this.ev(s.cond)));
        return 0;
      case 'break': return 1;
      case 'continue': return 2;
      case 'return': this.retVal = s.e ? this.ev(s.e) : 0; return 3;
      default: this.fail('Unsupported statement', s.line);
    }
  }

  runProgram(ast) {
    this.scope = this.globals;
    for (const s of ast) if (s.type === 'funcdef') this.funcs.set(s.name, s);
    this.execList(ast.filter((s) => s.type !== 'funcdef'));
  }
}

// ======================================================================= built-in functions
function buildFunctions(E) {
  const F = {};
  const n = () => E.n;
  const A = (v) => E.A(v);
  const S = (v, d = NaN) => (v === undefined ? d : E.scalar(v));
  const bars = E.bars;
  const col = (name) => E.consts.get(name);

  // --- generic: moving type functions (array, periods)
  const arrPer = (fn) => (a) => fn(A(a[0]), S(a[1]));
  Object.assign(F, {
    ma: arrPer(L.ma), ema: arrPer(L.ema), wma: arrPer(L.wma), dema: arrPer(L.dema), tema: arrPer(L.tema),
    wilders: arrPer(L.wilders), sum: arrPer(L.sum), hhv: arrPer(L.hhv), llv: arrPer(L.llv),
    hhvbars: arrPer(L.hhvBars), llvbars: arrPer(L.llvBars), roc: arrPer(L.roc), stdev: arrPer(L.stdev),
    linregslope: arrPer(L.linRegSlope), linregintercept: arrPer(L.linRegIntercept), tsf: arrPer(L.tsf),
    rsia: arrPer(L.rsiA),
  });
  F.highest = (a) => (a.length < 2 ? L.cumExtreme(A(a[0]), true) : L.hhv(A(a[0]), S(a[1])));
  F.lowest = (a) => (a.length < 2 ? L.cumExtreme(A(a[0]), false) : L.llv(A(a[0]), S(a[1])));
  F.cum = (a) => L.cum(A(a[0]));
  F.ref = (a) => L.ref(A(a[0]), S(a[1]));
  F.correlation = (a) => L.correlation(A(a[0]), A(a[1]), S(a[2]));

  // --- indicators on price
  F.rsi = (a) => L.rsiA(E.C, S(a[0], 14));
  F.macd = (a) => { const c = E.C, f = S(a[0], 12), s = S(a[1], 26); const x = L.ema(c, f), y = L.ema(c, s); return x.map((v, i) => v - y[i]); };
  F.signal = (a) => { const f = S(a[0], 12), s = S(a[1], 26), g = S(a[2], 9); const x = L.ema(E.C, f), y = L.ema(E.C, s); return L.ema(x.map((v, i) => v - y[i]), g); };
  F.atr = (a) => L.atr(E.H, E.Lw, E.C, S(a[0], 14));
  F.adx = (a) => L.adx(E.H, E.Lw, E.C, S(a[0], 14));
  F.pdi = (a) => L.pdi(E.H, E.Lw, E.C, S(a[0], 14));
  F.mdi = (a) => L.mdi(E.H, E.Lw, E.C, S(a[0], 14));
  F.cci = (a) => L.cci(E.H, E.Lw, E.C, S(a[0], 20));
  F.stochk = (a) => L.stochK(E.H, E.Lw, E.C, S(a[0], 14), S(a[1], 3));
  F.stochd = (a) => L.ma(L.stochK(E.H, E.Lw, E.C, S(a[0], 14), S(a[1], 3)), S(a[2], 3));
  F.mfi = (a) => L.mfi(E.H, E.Lw, E.C, E.V, S(a[0], 14));
  F.obv = () => L.obv(E.C, E.V);
  F.sar = (a) => L.psar(E.H, E.Lw, S(a[0], 0.02), S(a[1], 0.2));
  F.psar = F.sar;
  F.bbandtop = (a) => { const x = A(a[0]), p = S(a[1], 20), w = S(a[2], 2); const m = L.ma(x, p), d = L.stdev(x, p); return m.map((v, i) => v + w * d[i]); };
  F.bbandbot = (a) => { const x = A(a[0]), p = S(a[1], 20), w = S(a[2], 2); const m = L.ma(x, p), d = L.stdev(x, p); return m.map((v, i) => v - w * d[i]); };
  F.truerange = () => L.trueRange(E.H, E.Lw, E.C);

  // --- logic / series
  F.cross = (a) => L.cross(A(a[0]), A(a[1]));
  F.flip = (a) => L.flip(A(a[0]), A(a[1]));
  F.barssince = (a) => L.barsSince(A(a[0]));
  F.valuewhen = (a) => L.valueWhen(A(a[0]), A(a[1]), S(a[2], 1));
  F.highestsince = (a) => L.sinceExtreme(A(a[0]), A(a[1]), S(a[2], 1), true);
  F.lowestsince = (a) => L.sinceExtreme(A(a[0]), A(a[1]), S(a[2], 1), false);
  F.iif = (a) => {
    const c = a[0], x = a[1], y = a[2];
    if (!isArr(c)) return truthy(c) ? x : y;
    const out = new Float64Array(n()), xa = isArr(x), ya = isArr(y);
    for (let i = 0; i < out.length; i++) out[i] = truthy(c[i]) ? (xa ? x[i] : x) : (ya ? y[i] : y);
    return out;
  };
  const map1 = (f) => (a) => (isArr(a[0]) ? a[0].map(f) : f(a[0]));
  Object.assign(F, {
    abs: map1(Math.abs), sqrt: map1((x) => (x < 0 ? NaN : Math.sqrt(x))), log: map1((x) => (x > 0 ? Math.log(x) : NaN)),
    log10: map1((x) => (x > 0 ? Math.log10(x) : NaN)), exp: map1(Math.exp), int: map1(Math.trunc), floor: map1(Math.floor),
    ceil: map1(Math.ceil), sign: map1(Math.sign), sin: map1(Math.sin), cos: map1(Math.cos), tan: map1(Math.tan), atan: map1(Math.atan),
    nz: map1((x) => (Number.isNaN(x) ? 0 : x)), isnull: map1((x) => (Number.isNaN(x) ? 1 : 0)),
  });
  F.round = (a) => { const d = Math.pow(10, S(a[1], 0)); return map1((x) => Math.round(x * d) / d)([a[0]]); };
  F.max = (a) => E.binary2(a[0], a[1], (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : Math.max(x, y)));
  F.min = (a) => E.binary2(a[0], a[1], (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : Math.min(x, y)));
  F.mod = (a) => E.binary2(a[0], a[1], (x, y) => x % y);
  F.lastvalue = (a) => S(a[0]);
  F.selectedvalue = F.lastvalue;
  F.beginvalue = (a) => (isArr(a[0]) ? a[0][0] : a[0]);
  F.endvalue = F.lastvalue;
  F.barindex = () => Float64Array.from({ length: n() }, (_, i) => i);

  // --- date / symbol
  const dateParts = () => bars.t.map((t) => { const p = String(t).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; });
  F.datenum = () => Float64Array.from(dateParts(), (p) => (p.y - 1900) * 10000 + p.m * 100 + p.d);
  F.day = () => Float64Array.from(dateParts(), (p) => p.d);
  F.month = () => Float64Array.from(dateParts(), (p) => p.m);
  F.year = () => Float64Array.from(dateParts(), (p) => p.y);
  F.dayofweek = () => Float64Array.from(dateParts(), (p) => new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay());
  F.name = () => String(E.opts.symbol || '');
  F.fullname = F.name;
  F.interval = () => 86400;
  F.version = () => 6;

  // --- text
  F.numtostr = (a) => fmtNum(S(a[0]), decimalsOf(a[1] === undefined ? 1.2 : a[1]));
  F.writeval = F.numtostr;
  F.strformat = (a) => strFormat(a[0], a.slice(1));
  F.strlen = (a) => String(a[0]).length;
  F.encodecolor = () => '';
  F._n = (a) => a[0];
  F._section_begin = (a) => String(a[0] || '');
  F._section_end = () => 0;

  // --- no-op setup calls
  for (const nm of ['setoption', 'settradedelays', 'setchartoptions', 'setbarsrequired', 'setformulaname', 'setpositionsize',
    'applystop', 'addtocomposite', 'requesttimedrefresh', 'addsummaryrows', 'staticvarset']) F[nm] = () => 0;

  // --- parameters
  const paramVal = (name, def) => {
    const v = E.opts.params && E.opts.params[name];
    return v === undefined || v === null || v === '' ? def : v;
  };
  F.param = (a) => {
    const name = String(a[0]), def = S(a[1], 0), min = S(a[2], 0), max = S(a[3], 100), step = S(a[4], 1);
    E.res.params.push({ name, type: 'number', def, min, max, step });
    const v = Number(paramVal(name, def));
    return Number.isFinite(v) ? v : def;
  };
  F.paramtoggle = (a) => {
    const name = String(a[0]), items = String(a[1] === undefined ? 'No|Yes' : a[1]).split('|'), def = S(a[2], 0);
    E.res.params.push({ name, type: 'list', items, def });
    const v = Number(paramVal(name, def));
    return Number.isFinite(v) ? v : def;
  };
  F.paramlist = (a) => {
    const name = String(a[0]), items = String(a[1]).split('|'); let def = a[2];
    if (typeof def !== 'string') def = items[Math.max(0, Math.min(items.length - 1, S(def, 0)))];
    E.res.params.push({ name, type: 'text', items, def });
    const v = String(paramVal(name, def));
    return items.includes(v) ? v : def;
  };
  F.paramcolor = (a) => {
    const name = String(a[0]), def = S(a[1], 55);
    E.res.params.push({ name, type: 'color', def });
    const v = Number(paramVal(name, def));
    return Number.isFinite(v) ? v : def;
  };
  F.paramstyle = (a) => {
    const name = String(a[0]), def = S(a[1], 1);
    E.res.params.push({ name, type: 'number', def, min: 0, max: 100000, step: 1 });
    const v = Number(paramVal(name, def)); return Number.isFinite(v) ? v : def;
  };
  F.colorrgb = (a) => S(a[0], 0) + S(a[1], 0) * 256 + S(a[2], 0) * 65536;
  F.rgb = F.colorrgb;
  F.colorblend = (a) => S(a[0], 0);

  // --- plotting
  const copy = (v) => (isArr(v) ? Float64Array.from(v) : v);
  const kindOf = (style) => ((style & STYLE.Histogram) ? 'hist' : (style & STYLE.Candle) ? 'candle' : (style & STYLE.Bar) ? 'bar'
    : (style & STYLE.Area) ? 'area' : 'line');
  const flags = (style) => ({
    thick: !!(style & STYLE.Thick), dashed: !!(style & STYLE.Dashed), dots: !!(style & STYLE.Dots),
    noLine: !!(style & STYLE.NoLine) || !!(style & STYLE.NoDraw), step: !!(style & STYLE.Staircase),
    ownScale: !!(style & STYLE.OwnScale), noLabel: !!(style & STYLE.NoLabel), left: !!(style & STYLE.LeftAxisScale),
  });
  F.plot = (a) => {
    const style = S(a[3], 1);
    const kind = kindOf(style);
    const p = { kind, name: a[1] === undefined ? '' : String(a[1]), data: copy(A(a[0])), color: copy(a[2] === undefined ? -1 : a[2]), ...flags(style) };
    if (kind === 'candle' || kind === 'bar') p.ohlc = { o: E.O, h: E.H, l: E.Lw, c: p.data };
    E.res.plots.push(p); return 0;
  };
  F.plotohlc = (a) => {
    const style = S(a[6], STYLE.Candle);
    const kind = (style & STYLE.Bar) ? 'bar' : 'candle';
    E.res.plots.push({
      kind, name: a[4] === undefined ? '' : String(a[4]), color: copy(a[5] === undefined ? -1 : a[5]),
      data: copy(A(a[3])), ohlc: { o: copy(A(a[0])), h: copy(A(a[1])), l: copy(A(a[2])), c: copy(A(a[3])) }, ...flags(style),
    });
    return 0;
  };
  F.plotshapes = (a) => {
    const shapes = copy(A(a[0]));
    let pos = 'auto';
    if (a[3] !== undefined && isArr(a[3])) { if (a[3] === E.Lw) pos = 'below'; else if (a[3] === E.H) pos = 'above'; }
    E.res.shapes.push({ shapes, color: copy(a[1] === undefined ? -1 : a[1]), position: pos, offset: S(a[4], 0) });
    return 0;
  };
  F.plotgrid = (a) => { E.res.grids.push({ level: S(a[0], 0), color: a[1] === undefined ? 15 : a[1] }); return 0; };

  // --- analysis columns
  F.addcolumn = (a) => {
    E.res.columns.push({ name: a[1] === undefined ? 'Column' : String(a[1]), data: copy(A(a[0])), format: S(a[2], 1.2), text: false });
    return 0;
  };
  F.addtextcolumn = (a) => {
    E.res.columns.push({ name: a[1] === undefined ? 'Text' : String(a[1]), data: String(a[0]), format: 0, text: true });
    return 0;
  };
  return F;
}

Interp.prototype.binary2 = function (a, b, f) {
  const aa = isArr(a), ba = isArr(b);
  if (!aa && !ba) return f(a, b);
  const out = new Float64Array(this.n);
  for (let i = 0; i < this.n; i++) out[i] = f(aa ? a[i] : a, ba ? b[i] : b);
  return out;
};

// ======================================================================= public API
export class AFLEngine {
  /** All function and constant names the interpreter knows (used by the help text and tests). */
  functionNames() {
    const dummy = new Interp({ t: ['2000-01-01'], o: [1], h: [1], l: [1], c: [1], v: [1] }, {}, { params: [], plots: [], shapes: [], grids: [], columns: [] });
    return Object.keys(dummy.lib).filter((k) => !k.endsWith('_'));
  }

  /**
   * code: formula text. bars: { t,o,h,l,c,v,dq,delpct } arrays from barsToArrays().
   * opts: { symbol, params }.
   */
  run(code, bars, opts = {}) {
    const res = {
      plots: [], shapes: [], grids: [], columns: [], params: [], errors: [], title: '',
      buy: null, sell: null, short: null, cover: null, filter: null, vars: {}, usesSignals: false,
    };
    if (!bars || !bars.t || bars.t.length === 0) { res.errors.push('No data loaded'); return res; }
    let ast;
    try { ast = parse(String(code || '')); }
    catch (e) { res.errors.push(e.message); res.errorLine = e.line || 0; return res; }

    const it = new Interp(bars, opts, res);
    try { it.runProgram(ast); }
    catch (e) {
      if (e instanceof AFLError) { res.errors.push(e.message); res.errorLine = e.line || 0; }
      else { res.errors.push(`Internal error: ${e && e.message ? e.message : e}`); res.errorLine = it.line; }
    }
    const g = it.globals, n = it.n;
    const sig = (k) => (g.has(k) ? toArr(g.get(k), n) : null);
    res.buy = sig('buy'); res.sell = sig('sell'); res.short = sig('short'); res.cover = sig('cover');
    res.filter = g.has('filter') ? toArr(g.get('filter'), n) : null;
    res.usesSignals = !!(res.buy || res.sell || res.short || res.cover);
    for (const k of ['buyprice', 'sellprice', 'shortprice', 'coverprice', 'positionsize', 'positionscore']) if (g.has(k)) res.vars[k] = g.get(k);
    if (g.has('title')) res.title = expandTitle(String(g.get('title')), bars, opts);
    for (const [k, v] of g) if (!SPECIAL.includes(k)) res.vars[k] = v;
    return res;
  }
}

function expandTitle(s, bars, opts) {
  const i = bars.t.length - 1, f = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
  return s.replace(/\{\{NAME\}\}/gi, opts.symbol || '').replace(/\{\{INTERVAL\}\}/gi, 'Daily')
    .replace(/\{\{DATE\}\}/gi, bars.t[i])
    .replace(/\{\{OHLCX\}\}|\{\{OHLC\}\}/gi, `O ${f(bars.o[i])} H ${f(bars.h[i])} L ${f(bars.l[i])} C ${f(bars.c[i])}`)
    .replace(/\{\{VALUES\}\}/gi, '');
}

export function shapeKind(code) {
  if (code >= 100 && code <= 109) return { text: String(code - 100), position: 'auto' };
  const down = DOWN_SHAPES.has(code);
  let shape = 'arrowUp';
  if (down) shape = 'arrowDown';
  if (code === SHAPE.Circle || code === SHAPE.HollowCircle || code === SHAPE.SmallCircle || code === SHAPE.Star || code === SHAPE.HollowStar || code === SHAPE.Cross) shape = 'circle';
  if (code === SHAPE.Square || code === SHAPE.HollowSquare || code === SHAPE.SmallSquare) shape = 'square';
  return { shape, down };
}

export const aflEngine = new AFLEngine();
