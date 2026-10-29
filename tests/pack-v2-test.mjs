// Checks that the browser decoder reads blocks written by the real Python encoder (convert.py): pack format v2 and the older v1.
// Fixture made by nse-data-engine/tests/make_pack_fixture.py.  Run: node tests/pack-v2-test.mjs
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseBlock, decodeBlock, dayToIso } from '../js/pack-codec.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/pack-v2.json', import.meta.url)));
let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

for (const [name, e] of Object.entries(fx)) {
  for (const [label, data] of [['written', e.block], ['v1', e.v1block]]) {
    const raw = new Uint8Array(inflateSync(b64(data)));
    const viaSync = parseBlock(raw);
    const viaAsync = await decodeBlock(b64(data));          // the browser's DecompressionStream path
    for (const [how, b] of [['parseBlock', viaSync], ['decodeBlock', viaAsync]]) {
      const tag = `${name}/${label}/${how}`;
      ok(b.n === e.dates.length, `${tag} n`);
      let wrong = 0;
      for (let i = 0; i < b.n; i++) {
        if (dayToIso(b.t[i]) !== e.dates[i]) wrong++;
        for (const k of ['o', 'h', 'l', 'c', 'v']) if (Math.abs(b[k][i] - e[k][i]) > 1e-9) wrong++;
        const q = e.dq[i];
        if (q === null ? !Number.isNaN(b.dq[i]) : b.dq[i] !== q) wrong++;
      }
      ok(wrong === 0, `${tag}: ${wrong} wrong values`);
    }
  }
  ok(raw0(e.block)[2] === e.version, `${name}: version byte`);
}
function raw0(s) { return new Uint8Array(inflateSync(b64(s))); }
ok(raw0(fx.typical_1500.block)[2] === 2, 'typical block is v2');
ok(raw0(fx.huge_volume_falls_back_to_v1.block)[2] === 1, 'huge volume falls back to v1');
console.log(bad ? `${bad} of ${checks} checks FAILED` : `pack-v2: all ${checks} checks passed`);
process.exit(bad ? 1 : 0);
