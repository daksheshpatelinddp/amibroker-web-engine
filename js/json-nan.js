// JSON cannot hold NaN, Infinity or -Infinity (they turn into null). Results that come back from a GitHub machine can contain them
// (an exploration column without a value, a profit factor with no losing trade), so they are written as { "__nf": "NaN" } and put back here.
// The runner (amibroker-analysis-runner/src/nf.mjs) writes exactly this form.
export function nfEncode(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : { __nf: Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity' };
  if (Array.isArray(v)) { const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = nfEncode(v[i]); return o; }
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) return nfEncode(Array.from(v));
    const o = {}; for (const k of Object.keys(v)) { const x = v[k]; if (x !== undefined && typeof x !== 'function') o[k] = nfEncode(x); } return o;
  }
  return v;
}
export function nfDecode(v) {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = nfDecode(v[i]); return v; }
  if (v && typeof v === 'object') {
    if (typeof v.__nf === 'string' && Object.keys(v).length === 1) return v.__nf === 'NaN' ? NaN : v.__nf === 'Infinity' ? Infinity : -Infinity;
    for (const k of Object.keys(v)) v[k] = nfDecode(v[k]);
  }
  return v;
}

// Big results are stored compressed: { gz: <base64 of gzip of the JSON>, raw: <bytes before compression> } (the runner: src/nf.mjs, gzPack).
// Gives back the plain object; anything that is not compressed is returned as it is.
export async function gzUnpack(x) {
  if (!x || typeof x.gz !== 'string') return x;
  const bin = atob(x.gz), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}
