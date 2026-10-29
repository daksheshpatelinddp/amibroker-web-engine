// Decoder for the compact "pack" blocks written by convert.py (one stock = one zlib-compressed block).
// Decoded data stays in typed arrays (no row objects), which is what backtests and scanners need:
// 1000 stocks x 26 years is ~170 MB as Float64 arrays, a few GB as row objects.

export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const dayToIso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);

// Inflated bytes -> { n, t: Int32Array (days since 1970-01-01), o, h, l, c, v, dq: Float64Array }   (dq / v = NaN when unknown)
// Reads pack format v1 (float64 volume/delivery) and v2 (int32 volume/delivery, -1 = unknown, bytes regrouped in 4 planes).
// Synchronous, so a Web Worker can call it with its own inflater.
export function parseBlock(raw) {
  if (raw[0] !== 0x41 || raw[1] !== 0x42) throw new Error('Not a pack block');
  const version = raw[2];
  if (version === 2) return parseV2(raw);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const mode = raw[3];
  const n = dv.getUint32(4, true);
  const scale = dv.getInt32(8, true);
  let off = 12;
  const i32 = () => { const a = new Int32Array(raw.buffer, raw.byteOffset + off, n); off += 4 * n; return a; };

  const t = new Int32Array(n);
  const dd = i32();
  for (let i = 0, s = 0; i < n; i++) { s += dd[i]; t[i] = s; }

  const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  if (mode === 1) {
    const cd = i32(), oc = i32(), hc = i32(), lc = i32();
    for (let i = 0, s = 0; i < n; i++) {
      s += cd[i];
      c[i] = s / scale; o[i] = (s + oc[i]) / scale; h[i] = (s + hc[i]) / scale; l[i] = (s + lc[i]) / scale;
    }
  } else {                                   // float64 prices (never expected for NSE data)
    const f64 = () => { const a = new Float64Array(raw.buffer, raw.byteOffset + off, n); off += 8 * n; return a; };
    c.set(f64()); o.set(f64()); h.set(f64()); l.set(f64());
  }
  off += (8 - (off % 8)) % 8;
  const v = new Float64Array(raw.buffer, raw.byteOffset + off, n); off += 8 * n;
  const dq = new Float64Array(raw.buffer, raw.byteOffset + off, n);
  return { n, t, o, h, l, c, v, dq };
}

// v2: after the 12-byte header come 7*n int32 values stored as 4 byte-planes (all byte 0s, all byte 1s, ...):
// date deltas | close deltas | open-close | high-close | low-close | volume | delivery
function parseV2(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = dv.getUint32(4, true);
  const scale = dv.getInt32(8, true);
  const words = 7 * n;
  const joined = new Uint8Array(4 * words);
  const base = 12;
  for (let k = 0; k < 4; k++) {
    const src = base + k * words;
    for (let i = 0, j = k; i < words; i++, j += 4) joined[j] = raw[src + i];
  }
  const a = new Int32Array(joined.buffer);            // joined.buffer is 4-byte aligned (fresh buffer)
  const t = new Int32Array(n);
  const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  const v = new Float64Array(n), dq = new Float64Array(n);
  for (let i = 0, sd = 0, sc = 0; i < n; i++) {
    sd += a[i]; t[i] = sd;
    sc += a[n + i];
    c[i] = sc / scale;
    o[i] = (sc + a[2 * n + i]) / scale; h[i] = (sc + a[3 * n + i]) / scale; l[i] = (sc + a[4 * n + i]) / scale;
    const vv = a[5 * n + i], dd = a[6 * n + i];
    v[i] = vv < 0 ? NaN : vv; dq[i] = dd < 0 ? NaN : dd;
  }
  return { n, t, o, h, l, c, v, dq };
}

export async function decodeBlock(bytes) { return parseBlock(await inflate(bytes)); }

// History + recent: where both cover a date, the recent block wins (it is rebuilt every day).
export function mergeBlocks(hist, rec) {
  if (!hist) return rec || null;
  if (!rec || rec.n === 0) return hist;
  const first = rec.t[0];
  let cut = hist.n;
  while (cut > 0 && hist.t[cut - 1] >= first) cut--;
  if (cut === 0) return rec;
  const n = cut + rec.n;
  const out = { n, t: new Int32Array(n) };
  for (const k of ['o', 'h', 'l', 'c', 'v', 'dq']) {
    out[k] = new Float64Array(n);
    out[k].set(hist[k].subarray(0, cut));
    out[k].set(rec[k], cut);
  }
  out.t.set(hist.t.subarray(0, cut));
  out.t.set(rec.t, cut);
  return out;
}

// Last `bars` bars of a block (a view, no copy)
export function tailBlock(b, bars) {
  if (!b || b.n <= bars) return b;
  const s = b.n - bars;
  return { n: bars, t: b.t.subarray(s), o: b.o.subarray(s), h: b.h.subarray(s), l: b.l.subarray(s),
           c: b.c.subarray(s), v: b.v.subarray(s), dq: b.dq.subarray(s) };
}

// Row objects for the chart code (which expects { date, open, high, low, close, volume, delivery })
export function blockToRows(b, symbol) {
  const rows = new Array(b.n);
  for (let i = 0; i < b.n; i++) {
    rows[i] = { symbol, date: dayToIso(b.t[i]), open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i],
                volume: b.v[i], delivery: b.dq[i] };
  }
  return rows;
}
