// Drawing tools (AmiBroker "Draw", "Fibonacci" and "Gann" toolbars): one entry per tool.
//   pts: number of points the user places (0 = any number, finish with a double tap / Enter / Esc)
//   study: the drawing can be read by the AFL function Study(id, chartId)
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
export const FIB_EXT_LEVELS = [0.618, 1, 1.272, 1.618, 2.618, 4.236];
export const FIB_TIME_EXT = [0.382, 0.618, 1, 1.382, 1.618, 2, 2.618];
export const FIB_ZONES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
export const GANN_ANGLES = [[8, '1x8'], [4, '1x4'], [3, '1x3'], [2, '1x2'], [1, '1x1'], [1 / 2, '2x1'], [1 / 3, '3x1'], [1 / 4, '4x1'], [1 / 8, '8x1']];
export const STUDY_IDS = ['UP', 'DN', 'SU', 'RE', 'ST'];

export const GROUPS = ['Lines', 'Channels', 'Fibonacci', 'Gann', 'Shapes', 'Text'];

export const TYPES = [
  { id: 'trend', name: 'Trend line', group: 'Lines', pts: 2, icon: '╱', study: true },
  { id: 'ray', name: 'Ray', group: 'Lines', pts: 2, icon: '↗', study: true },
  { id: 'extended', name: 'Extended line', group: 'Lines', pts: 2, icon: '⟷', study: true },
  { id: 'horizontal', name: 'Horizontal line', group: 'Lines', pts: 1, icon: '─', study: true },
  { id: 'vertical', name: 'Vertical line', group: 'Lines', pts: 1, icon: '│' },
  { id: 'arrow', name: 'Arrow', group: 'Lines', pts: 2, icon: '➚', study: true },
  { id: 'zigzag', name: 'Zig-zag', group: 'Lines', pts: 0, icon: '〰' },
  { id: 'parallel', name: 'Parallel lines', group: 'Lines', pts: 3, icon: '▱', study: true },
  { id: 'cycle', name: 'Cycle lines', group: 'Lines', pts: 2, icon: '⦀' },
  { id: 'speed', name: 'Speed lines', group: 'Lines', pts: 2, icon: '⋰' },
  { id: 'pitchfork', name: "Andrews' pitchfork", group: 'Lines', pts: 3, icon: 'Ψ' },

  { id: 'raff', name: 'Raff regression channel', group: 'Channels', pts: 2, icon: '≋', study: true, channel: 'raff' },
  { id: 'stderr', name: 'Standard error channel', group: 'Channels', pts: 2, icon: '≈', study: true, channel: 'stderr' },
  { id: 'stddev', name: 'Standard deviation channel', group: 'Channels', pts: 2, icon: '≈', study: true, channel: 'stddev' },

  { id: 'fibRetr', name: 'Fibonacci retracement', group: 'Fibonacci', pts: 2, icon: 'ƒ%', study: true },
  { id: 'fibExt', name: 'Fibonacci extension', group: 'Fibonacci', pts: 3, icon: 'ƒ→', study: true },
  { id: 'fibTimeExt', name: 'Fibonacci time extension', group: 'Fibonacci', pts: 2, icon: 'ƒ⏱' },
  { id: 'fibZones', name: 'Fibonacci time zones', group: 'Fibonacci', pts: 2, icon: 'ƒ│' },
  { id: 'fibFan', name: 'Fibonacci fan', group: 'Fibonacci', pts: 2, icon: 'ƒ◣' },
  { id: 'fibArc', name: 'Fibonacci arc', group: 'Fibonacci', pts: 2, icon: 'ƒ◜' },

  { id: 'gannFan', name: 'Gann fan', group: 'Gann', pts: 2, icon: 'G◣' },
  { id: 'gannSquare', name: 'Gann square', group: 'Gann', pts: 2, icon: 'G▦' },

  { id: 'rect', name: 'Rectangle', group: 'Shapes', pts: 2, icon: '▭' },
  { id: 'ellipse', name: 'Ellipse', group: 'Shapes', pts: 2, icon: '◯' },
  { id: 'arc', name: 'Arc', group: 'Shapes', pts: 2, icon: '◠' },
  { id: 'triangle', name: 'Triangle', group: 'Shapes', pts: 3, icon: '△' },

  { id: 'text', name: 'Text box', group: 'Text', pts: 1, icon: 'T' },
];
export const typeOf = (id) => TYPES.find((t) => t.id === id) || null;

/** Settings every new drawing of a tool starts with. */
export function defaultsFor(id) {
  const base = { color: '#38bdf8', width: 1, dash: 'solid', extL: false, extR: false, studyId: '', chartId: 1, log: false };
  switch (id) {
    case 'ray': return { ...base, extR: true };
    case 'extended': return { ...base, extL: true, extR: true };
    case 'horizontal': return { ...base, extL: true, extR: true };
    case 'parallel': return { ...base, studyId2: '', fill: true };
    case 'raff': case 'stderr': case 'stddev': return { ...base, color: '#a78bfa', mult: 2, studyId: '', studyIdUp: '', studyIdDn: '', fill: true, showMid: true, showUp: true, showDn: true };
    case 'fibRetr': return { ...base, color: '#f59e0b', showExt: false, extFactor: 0, text: '%', levels: FIB_LEVELS.map((l, i) => ({ v: l, show: [0, 2, 3, 4, 6, 7, 8].includes(i), ext: l > 1, color: '', id: `F${i}` })) };
    case 'fibExt': return { ...base, color: '#f59e0b', extFactor: 8, levels: FIB_EXT_LEVELS.map((l, i) => ({ v: l, show: i < 5, color: '', id: '' })) };
    case 'fibTimeExt': return { ...base, color: '#f59e0b', levels: FIB_TIME_EXT.map((l) => ({ v: l, show: true, color: '' })) };
    case 'fibZones': return { ...base, color: '#f59e0b' };
    case 'fibFan': return { ...base, color: '#f59e0b', levels: [0.382, 0.5, 0.618].map((l) => ({ v: l, show: true, color: '' })) };
    case 'fibArc': return { ...base, color: '#f59e0b', levels: [0.382, 0.5, 0.618, 1].map((l) => ({ v: l, show: true, color: '' })) };
    case 'gannFan': return { ...base, color: '#34d399' };
    case 'gannSquare': return { ...base, color: '#34d399', divisions: 8 };
    case 'cycle': return { ...base, color: '#94a3b8', count: 12 };
    case 'speed': return { ...base, color: '#f472b6' };
    case 'pitchfork': return { ...base, color: '#fbbf24', fill: true, extR: true };
    case 'rect': case 'ellipse': case 'triangle': return { ...base, fill: true };
    case 'arc': return { ...base, fill: false };
    case 'text': return { ...base, color: '#e2e8f0', text: 'Text', size: 13, box: false };
    default: return base;
  }
}
