// Screens for intraday data: the time-frame box, "Custom time frame" and Tools > Intraday data.
import { el, openModal, toast, labeled, BTN, BTN_PRIMARY, BTN_DANGER, INPUT } from './ui.js';
import { loadConfig, saveConfig, defaultConfig, DEFAULT_FRAMES, cleanFrames, parseFrame, frameId, frameName, frameShort, isIntraday, frameMinutes, clearIntradayCache } from './intraday.js';

const DAILY = [['D', 'D'], ['W', 'W'], ['M', 'M'], ['Q', 'Q'], ['Y', 'Y']];

/** Fills the time-frame <select>: D W M Q Y, then the user's intraday frames, then the two edit entries. */
export function refreshTfSelect(sel, current = 'D', cfg = loadConfig()) {
  if (!sel) return;
  sel.innerHTML = '';
  const add = (parent, value, text, title) => { const o = document.createElement('option'); o.value = value; o.textContent = text; if (title) o.title = title; parent.appendChild(o); };
  DAILY.forEach(([v, t]) => add(sel, v, t));
  const g = document.createElement('optgroup'); g.label = 'Intraday';
  const ids = cfg.frames.map(frameId);
  if (isIntraday(current) && !ids.includes(current)) ids.push(current);        // a one-off custom frame stays selectable
  ids.sort((a, b) => frameMinutes(a) - frameMinutes(b)).forEach((id) => add(g, id, frameShort(id), frameName(id)));
  sel.appendChild(g);
  add(sel, '__custom', 'Custom…', 'Type any number of minutes or hours');
  add(sel, '__manage', 'Edit list…', 'Change the intraday frames in this list');
  sel.value = current;
}

/** Ask for one frame: a number and minutes / hours. onPick(frameId, keepInList). */
export function openCustomFrame(onPick, current = '') {
  openModal('Custom time frame', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Enter how long each bar should be. Bars start at the market open (09:15): 45 min gives 09:15, 10:00, 10:45 ... Any whole number of minutes from 1 to 1440 works.'));
    const row = el('div', 'flex space-x-2');
    const num = el('input', INPUT + ' flex-1'); num.type = 'text'; num.inputMode = 'decimal'; num.placeholder = 'e.g. 7 or 90 or 1.5';
    const unit = el('select', INPUT);
    [['m', 'minutes'], ['h', 'hours']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; unit.appendChild(o); });
    if (isIntraday(current)) { const n = frameMinutes(current); if (n % 60 === 0) { num.value = String(n / 60); unit.value = 'h'; } else num.value = String(n); }
    row.appendChild(num); row.appendChild(unit); b.appendChild(row);
    const keepBox = el('input'); keepBox.type = 'checkbox'; keepBox.checked = true;
    const keepRow = el('label', 'flex items-center space-x-2 text-xs text-slate-200'); keepRow.appendChild(keepBox); keepRow.appendChild(el('span', '', 'Keep it in my time-frame list'));
    b.appendChild(keepRow);
    const msg = el('div', 'text-[11px] text-slate-400 min-h-[1.2em]'); b.appendChild(msg);
    const preview = () => { const m = parseFrame(num.value, unit.value); msg.textContent = m ? `Bar length: ${frameName(frameId(m))}` : (num.value.trim() ? 'Not a valid length (1 to 1440 minutes).' : ''); msg.style.color = m || !num.value.trim() ? '' : '#f87171'; return m; };
    num.oninput = preview; unit.onchange = preview;
    const go = el('button', BTN_PRIMARY + ' w-full', 'Use this time frame'); go.type = 'button';
    go.onclick = () => { const m = preview(); if (!m) { toast('Enter a number of minutes or hours.'); return; } close.force(); onPick(frameId(m), keepBox.checked); };
    num.onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
    b.appendChild(go);
    setTimeout(() => num.focus(), 50);
  }, { stack: true });
}

/** Tools > Intraday data: server address, the list of frames, refresh, Yahoo range. onSave(cfg) */
export function openIntradaySettings(onSave = () => {}) {
  const cfg = loadConfig();
  openModal('Intraday data', (b, close) => {
    b.appendChild(el('div', 'text-[11px] text-slate-400', 'Intraday bars come from a small server (server/server.js in this project; free on Render or on your own computer). By default it reads Yahoo Finance: NSE prices about 15 minutes late; 1 min bars for the last 7 days, 5 to 30 min bars for 60 days, 1 hour bars for 2 years.'));
    const url = el('input', INPUT + ' w-full'); url.type = 'url'; url.value = cfg.url; url.placeholder = 'https://your-intraday-server.onrender.com';
    b.appendChild(labeled('Intraday server address', url));
    const test = el('button', BTN + ' w-full', 'Test connection'); test.type = 'button';
    const status = el('div', 'text-[11px] text-slate-400 break-words');
    test.onclick = async () => {
      const u = url.value.trim().replace(/\/+$/, ''); if (!u) { status.textContent = 'Enter the address first.'; return; }
      status.textContent = 'Testing...'; status.style.color = '';
      try {
        const r = await fetch(`${u}/api/health`), j = await r.json();
        status.textContent = j && j.ok ? `Connected. Data source: ${j.provider}. Frames it can send: ${(j.intervals || []).join(', ')}.` : 'The address answered, but it is not the intraday server.';
        status.style.color = j && j.ok ? '#4ade80' : '#f87171';
      } catch (e) {
        const notJson = /JSON|token/i.test(String(e.message || e));
        status.textContent = notJson ? `${u} answered, but it is not the intraday server (it is probably your website). Use the address of the separate intraday service, for example https://amibroker-intraday.onrender.com` : `Cannot reach it: ${e.message || e}`;
        status.style.color = '#f87171';
      }
    };
    b.appendChild(test); b.appendChild(status);

    // the list of frames
    b.appendChild(el('div', 'text-[11px] text-slate-400 mt-1', 'Time frames in the box above the chart (tap × to remove):'));
    let frames = [...cfg.frames];
    const chips = el('div', 'flex flex-wrap gap-2');
    const drawChips = () => {
      chips.innerHTML = '';
      frames.forEach((m) => {
        const c = el('span', 'inline-flex items-center rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs pl-2');
        c.appendChild(el('span', '', frameName(frameId(m))));
        const x = el('button', 'px-2 py-1 text-slate-400', '×'); x.type = 'button'; x.title = 'Remove';
        x.onclick = () => { frames = frames.filter((f) => f !== m); drawChips(); };
        c.appendChild(x); chips.appendChild(c);
      });
      if (!frames.length) chips.appendChild(el('span', 'text-[11px] text-slate-500', 'Empty: the defaults are used.'));
    };
    drawChips(); b.appendChild(chips);
    const addRow = el('div', 'flex space-x-2');
    const num = el('input', INPUT + ' flex-1'); num.type = 'text'; num.placeholder = 'Add: 10, 90, 2h, 1h30m ...';
    const addBtn = el('button', BTN, 'Add'); addBtn.type = 'button';
    const addIt = () => { const m = parseFrame(num.value); if (!m) { toast('Not a valid length (1 to 1440 minutes). Examples: 10, 2h, 1h30m'); return; } frames = cleanFrames([...frames, m]); num.value = ''; drawChips(); };
    addBtn.onclick = addIt; num.onkeydown = (e) => { if (e.key === 'Enter') addIt(); };
    addRow.appendChild(num); addRow.appendChild(addBtn); b.appendChild(addRow);
    const reset = el('button', BTN_DANGER + ' w-full', 'Back to 1, 5, 15, 30, 45 min and 1 hour'); reset.type = 'button';
    reset.onclick = () => { frames = [...DEFAULT_FRAMES]; drawChips(); };
    b.appendChild(reset);

    const refresh = el('input', INPUT + ' w-full'); refresh.type = 'number'; refresh.min = '0'; refresh.value = String(cfg.refreshSeconds);
    b.appendChild(labeled('Refresh the open intraday chart every (seconds, 0 = never)', refresh));
    const range = el('input', INPUT + ' w-full'); range.value = cfg.range || ''; range.placeholder = 'blank = the most Yahoo allows (for example 5d, 1mo)';
    b.appendChild(labeled('How much history to ask for (optional)', range));

    const row = el('div', 'flex space-x-2');
    const save = el('button', BTN_PRIMARY + ' flex-1', 'Save'); save.type = 'button';
    const dflt = el('button', BTN + ' flex-1', 'Defaults'); dflt.type = 'button';
    const cancel = el('button', BTN + ' flex-1', 'Cancel'); cancel.type = 'button';
    save.onclick = () => {
      const saved = saveConfig({ url: url.value, frames: cleanFrames(frames), refreshSeconds: Math.max(0, Math.round(Number(refresh.value) || 0)), range: range.value.trim() });
      clearIntradayCache(); close.force(); toast('Intraday settings saved.'); onSave(saved);
    };
    dflt.onclick = () => { const d = defaultConfig(); url.value = d.url; frames = [...d.frames]; refresh.value = String(d.refreshSeconds); range.value = ''; drawChips(); };
    cancel.onclick = () => close();
    row.appendChild(save); row.appendChild(dflt); row.appendChild(cancel); b.appendChild(row);
  }, { stack: true });
}
