// AI Formula Assistant: the user describes what they want in plain English, the AI writes the AFL.
//  - With an API key (Settings below): generates right here, runs the result against the chart on screen
//    and, if it fails, sends the error back to the AI to fix it (up to 2 times).
//  - Without a key: "Copy prompt" gives a ready-made prompt for any AI chat; paste its answer back.
// The key is kept only in this browser (localStorage) and is only ever sent to api.anthropic.com.
import { el, openModal, toast, BTN, BTN_PRIMARY, INPUT } from './ui.js';
import { aflEngine } from './afl-engine.js';
import { formulaStore } from './formula-store.js';
import { AFL_REFERENCE, AFL_EXAMPLE } from './afl-reference.js';
import { host } from './host.js';

const CFG_KEY = 'amibroker_ai_cfg_v1';
const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const MODES = {
  chart: ['Chart or indicator', 'Draw something on the chart (price, indicator, bands, arrows...).'],
  system: ['Buy / Sell system', 'Define Buy and Sell rules (for backtesting) and show the arrows on the chart.'],
  scan: ['Scanner (find stocks)', 'Set a Filter condition that selects the bars / stocks to list, with a few result columns.'],
  explore: ['Exploration (table)', 'Produce a table: Filter plus AddColumn for every value the user wants to see.'],
};

const EXAMPLES = [
  'Show 20 and 50 EMA on the price and mark a green arrow when the 20 crosses above the 50',
  'RSI with 14 period, color it red above 70 and green below 30',
  'Bollinger Bands with a squeeze highlight when the bands are very narrow',
  'Find stocks closing above their 20 day high on 2x average volume',
  'Buy when price closes above the 200 day average and RSI is above 50, sell when it closes below',
];

export function loadAIConfig() {
  try { return { apiKey: '', model: DEFAULT_MODEL, ...(JSON.parse(localStorage.getItem(CFG_KEY) || '{}')) }; }
  catch (e) { return { apiKey: '', model: DEFAULT_MODEL }; }
}
function saveAIConfig(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ } }

export function buildSystemPrompt(mode) {
  return `You write formulas in AmiBroker's AFL language for a web charting app. The person talking to you is a trader, not a programmer: they describe in plain English what they want to see or find.

RULES
- Reply with exactly ONE code block fenced as \`\`\`afl and then 2 to 4 short plain-English sentences saying what the formula shows and what each setting does. Nothing else.
- Use ONLY the functions, constants and syntax in the REFERENCE below. Never invent a function. If something cannot be done with them, do the closest thing and say so in the explanation.
- Every number the person might want to change must be a Param("name", default, min, max, step), so they can adjust it without editing code.
- Chart formulas must draw something. A formula that follows price starts with: Plot(Close, "Price", colorDefault, styleCandle);  Indicators that live in their own pane (RSI, MACD, volume, ...) must NOT plot Close.
- Buy / Sell systems: define Buy and Sell (and Short = Cover = 0; unless asked), AND draw them with PlotShapes so the signals are visible on the chart.
- Scanner / Exploration: set Filter = condition; and add AddColumn(...) for every useful value. A scanner does not need Plot.
- Every statement ends with a semicolon. Use // for comments. Put the formula between _SECTION_BEGIN("Short name"); and _SECTION_END();
- Give plots short names and distinct colors.

THIS REQUEST IS FOR: ${MODES[mode][0]}. ${MODES[mode][1]}

REFERENCE (everything that is supported)
${AFL_REFERENCE.trim()}

EXAMPLE OF THE EXPECTED STYLE
\`\`\`afl
${AFL_EXAMPLE}
\`\`\``;
}

export function extractCode(text) {
  const m = /```(?:afl|c|cpp|text)?[ \t]*\r?\n([\s\S]*?)```/i.exec(text || '');
  if (!m) return { code: String(text || '').trim(), note: '' };
  const note = (text.slice(m.index + m[0].length)).trim();
  return { code: m[1].trim() + '\n', note };
}

function nameFrom(code, request) {
  const m = /_SECTION_BEGIN\(\s*"([^"]{1,60})"/.exec(code);
  if (m) return m[1];
  return (request || 'AI formula').replace(/\s+/g, ' ').slice(0, 40);
}

async function callClaude(cfg, system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODEL, max_tokens: 4000, system, messages }),
  });
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = j.error && j.error.message ? j.error.message : JSON.stringify(j); } catch (e) { detail = await r.text().catch(() => ''); }
    if (r.status === 401) throw new Error('The API key was not accepted. Check it in Settings below.');
    throw new Error(`AI service error ${r.status}: ${String(detail).slice(0, 300)}`);
  }
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

/** onCode(code, name): called when the user chooses "Open in editor" */
export function openAIAssistant({ onCode = null } = {}) {
  const cfg = loadAIConfig();
  let mode = 'chart';
  let history = [];          // messages for the AI (grows when refining)
  let lastCode = '', lastNote = '', lastRequest = '';
  let busy = false;

  openModal('✨ AI Formula Assistant', (body, close) => {
    body.appendChild(el('div', 'text-[11px] text-slate-400', 'Describe what you want in your own words. The AI writes the formula, checks it on the chart you have open, and you can save or edit it.'));

    // type
    const modeSel = el('select', INPUT + ' w-full');
    Object.entries(MODES).forEach(([k, v]) => { const o = el('option', '', v[0]); o.value = k; modeSel.appendChild(o); });
    modeSel.onchange = () => { mode = modeSel.value; };
    body.appendChild(modeSel);

    const req = el('textarea', INPUT + ' w-full h-24');
    req.placeholder = 'e.g. Show 20 and 50 EMA and a green arrow when the 20 crosses above the 50';
    body.appendChild(req);

    const chips = el('div', 'flex flex-wrap gap-1');
    EXAMPLES.forEach((t) => {
      const c = el('button', 'px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300 text-left', t);
      c.type = 'button'; c.onclick = () => { req.value = t; };
      chips.appendChild(c);
    });
    body.appendChild(chips);

    const row = el('div', 'flex gap-2');
    const gen = el('button', BTN_PRIMARY + ' flex-1', '✨ Generate');
    gen.type = 'button';
    const copy = el('button', BTN + ' flex-1', 'Copy prompt');
    copy.type = 'button';
    row.appendChild(gen); row.appendChild(copy);
    body.appendChild(row);

    const status = el('div', 'text-[11px] text-slate-300 hidden');
    body.appendChild(status);
    const setStatus = (t, kind = 'info') => {
      status.classList.toggle('hidden', !t);
      status.className = 'text-[11px] ' + (kind === 'error' ? 'text-red-300' : kind === 'ok' ? 'text-emerald-300' : 'text-slate-300') + (t ? '' : ' hidden');
      status.textContent = t || '';
    };

    // result
    const out = el('div', 'space-y-2 hidden');
    const codeBox = el('textarea', INPUT + ' w-full h-56 font-mono text-[11px] leading-4');
    codeBox.spellcheck = false; codeBox.setAttribute('wrap', 'off'); codeBox.style.whiteSpace = 'pre';
    const noteBox = el('div', 'text-[11px] text-slate-300 whitespace-pre-wrap');
    const refine = el('div', 'flex gap-2');
    const refIn = el('input', INPUT + ' flex-1 min-w-0'); refIn.placeholder = 'Want a change? e.g. make the EMAs thicker, add RSI filter…';
    const refBtn = el('button', BTN, 'Change'); refBtn.type = 'button';
    refine.appendChild(refIn); refine.appendChild(refBtn);
    const acts = el('div', 'flex gap-2');
    const toEditor = el('button', BTN + ' flex-1', 'Open in editor'); toEditor.type = 'button';
    const toChart = el('button', BTN_PRIMARY + ' flex-1', 'Save & add to chart'); toChart.type = 'button';
    acts.appendChild(toEditor); acts.appendChild(toChart);
    out.appendChild(codeBox); out.appendChild(noteBox); out.appendChild(refine); out.appendChild(acts);
    body.appendChild(out);

    // paste mode
    const paste = el('details', 'rounded border border-slate-800 p-2');
    paste.appendChild(el('summary', 'text-[11px] text-slate-300 cursor-pointer', 'No API key? Use ChatGPT / Claude / Gemini instead'));
    paste.appendChild(el('div', 'text-[11px] text-slate-400 mt-2', '1) Tap "Copy prompt" above.  2) Paste it into any AI chat.  3) Paste the AI\'s reply here:'));
    const pasteBox = el('textarea', INPUT + ' w-full h-24 mt-2 font-mono text-[11px]');
    pasteBox.placeholder = 'Paste the AI reply here (with or without the explanation)';
    const pasteBtn = el('button', BTN + ' w-full mt-2', 'Use pasted formula'); pasteBtn.type = 'button';
    paste.appendChild(pasteBox); paste.appendChild(pasteBtn);
    body.appendChild(paste);

    // settings
    const set = el('details', 'rounded border border-slate-800 p-2');
    if (!cfg.apiKey) set.open = false;
    set.appendChild(el('summary', 'text-[11px] text-slate-300 cursor-pointer', cfg.apiKey ? 'Settings (API key saved)' : 'Settings: add an AI API key to generate directly here'));
    const keyIn = el('input', INPUT + ' w-full mt-2'); keyIn.type = 'password'; keyIn.placeholder = 'Anthropic API key (sk-ant-…)'; keyIn.value = cfg.apiKey; keyIn.autocomplete = 'off';
    const modelIn = el('input', INPUT + ' w-full mt-2'); modelIn.placeholder = 'Model'; modelIn.value = cfg.model || DEFAULT_MODEL;
    const saveCfg = el('button', BTN + ' w-full mt-2', 'Save settings'); saveCfg.type = 'button';
    saveCfg.onclick = () => { cfg.apiKey = keyIn.value.trim(); cfg.model = modelIn.value.trim() || DEFAULT_MODEL; saveAIConfig(cfg); toast('Settings saved on this device'); };
    set.appendChild(keyIn); set.appendChild(modelIn); set.appendChild(saveCfg);
    set.appendChild(el('div', 'text-[10px] text-slate-500 mt-2', 'The key stays in this browser and is sent only to api.anthropic.com. Anyone who can use this browser profile could read it, so use a key with a spending limit. You pay the AI provider directly; this app charges nothing.'));
    body.appendChild(set);

    // ---------------------------------------------------------------- logic
    const showResult = (code, note) => {
      lastCode = code; lastNote = note;
      codeBox.value = code; noteBox.textContent = note;
      out.classList.remove('hidden');
    };

    const check = (code) => {
      const bars = host.getBars();
      if (!bars || !bars.t || !bars.t.length) return null;
      return aflEngine.run(code, bars, { symbol: host.symbol() });
    };

    const generate = async (userText, isRefine) => {
      if (busy) return;
      if (!userText.trim()) { setStatus('Tell the AI what you want first.', 'error'); return; }
      if (!cfg.apiKey) {
        set.open = true; paste.open = true;
        setStatus('To generate here you need an API key (Settings below). Or tap "Copy prompt" and use any AI chat, then paste its reply.', 'error');
        return;
      }
      busy = true; gen.disabled = refBtn.disabled = true;
      try {
        const system = buildSystemPrompt(mode);
        if (!isRefine) { history = []; lastRequest = userText; }
        history.push({ role: 'user', content: isRefine ? `Please change the formula like this: ${userText}\nReturn the complete updated formula in the same format.` : userText });
        let code = '', note = '', reply = '';
        for (let attempt = 0; attempt <= 2; attempt++) {
          setStatus(attempt === 0 ? 'Asking the AI…' : `Fixing a problem automatically (${attempt}/2)…`);
          reply = await callClaude(cfg, system, history);
          ({ code, note } = extractCode(reply));
          const res = check(code);
          if (!res || !res.errors.length) {
            history.push({ role: 'assistant', content: reply });
            showResult(code, note);
            setStatus(res ? '✓ The formula runs correctly on the chart you have open.' : 'Done. (Open a chart to have it checked automatically.)', 'ok');
            return;
          }
          history.push({ role: 'assistant', content: reply });
          if (attempt < 2) history.push({ role: 'user', content: `That formula failed to run with: ${res.errors.join(' | ')}\nFix it using only the supported functions and return the complete corrected formula in the same format.` });
          else { showResult(code, note); setStatus('The AI could not fully fix it: ' + res.errors.join(' | ') + ' You can edit it in the editor.', 'error'); }
        }
      } catch (e) {
        setStatus(e.message || String(e), 'error');
      } finally { busy = false; gen.disabled = refBtn.disabled = false; }
    };

    gen.onclick = () => generate(req.value, false);
    refBtn.onclick = () => { const t = refIn.value; refIn.value = ''; generate(t, true); };
    copy.onclick = async () => {
      if (!req.value.trim()) { setStatus('Write what you want first, then copy the prompt.', 'error'); return; }
      const text = `${buildSystemPrompt(mode)}\n\nMY REQUEST:\n${req.value.trim()}`;
      try { await navigator.clipboard.writeText(text); setStatus('Prompt copied. Paste it into any AI chat, then paste the reply in the box below.', 'ok'); paste.open = true; }
      catch (e) { paste.open = true; pasteBox.value = text; pasteBox.select(); setStatus('Copy blocked by the browser: the prompt is in the box below, select it all and copy.', 'error'); }
    };
    pasteBtn.onclick = () => {
      if (!pasteBox.value.trim()) { setStatus('Paste the AI reply first.', 'error'); return; }
      const { code, note } = extractCode(pasteBox.value);
      lastRequest = req.value;
      showResult(code, note);
      const res = check(code);
      if (res && res.errors.length) setStatus('Pasted, but it does not run: ' + res.errors.join(' | ') + ' Ask the AI to fix this error, or edit it in the editor.', 'error');
      else setStatus(res ? '✓ The formula runs correctly on the chart you have open.' : 'Pasted.', 'ok');
    };

    toEditor.onclick = async () => {
      const code = codeBox.value, name = nameFrom(code, lastRequest);
      close.force();
      if (onCode) onCode(code, name);
      else { const { openFormulaEditor } = await import('./formula-editor.js'); openFormulaEditor({ code, name }); }
    };
    toChart.onclick = () => {
      const code = codeBox.value;
      const res = check(code);
      if (res && res.errors.length) { setStatus('Fix this first: ' + res.errors.join(' | '), 'error'); return; }
      try {
        const f = formulaStore.save({ name: nameFrom(code, lastRequest), code, description: 'Made with the AI assistant', kind: mode === 'chart' ? 'chart' : mode === 'system' ? 'system' : 'exploration' });
        if (mode === 'scan' || mode === 'explore') { toast(`Saved "${f.name}" in My formulas`); return; }
        host.addFormulaPane(f.id);
        toast(`Saved "${f.name}" and added it to the chart`);
        close.force();
      } catch (e) { setStatus(e.message, 'error'); }
    };
  }, { stack: true });
}
