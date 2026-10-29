// Turns "I want these blocks" (a list of { off, len }) into as few byte ranges as possible:
// neighbouring blocks are joined when the gap between them is small (the few extra bytes cost less than another request),
// and a joined range is cut at maxLen so several ranges can download in parallel.
export function planRanges(items, gap = 65536, maxLen = 2097152) {
  const sorted = items.slice().sort((a, b) => a.off - b.off);
  const out = [];
  let cur = null;
  for (const it of sorted) {
    const end = it.off + it.len;
    if (cur && it.off - cur.end <= gap && end - cur.start <= maxLen) { if (end > cur.end) cur.end = end; cur.items.push(it); }
    else { cur = { start: it.off, end, items: [it] }; out.push(cur); }
  }
  return out;
}
