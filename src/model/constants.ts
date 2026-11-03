export const CELL = 32; // world px per grid cell
export const MAJOR = 8; // heavy grid line every N cells

export const AREA_COLORS = [
  "#4c8dd8", "#3fb27f", "#d8734c", "#a56fd0", "#d8b64c",
  "#4cc9d8", "#d84c7a", "#6ad84c", "#8b93a6", "#d85c5c",
];
export const LOCK_COLORS = [
  "#e0555f", "#f0a13a", "#f0dc3a", "#5ad07a", "#5aa9f0",
  "#a97af0", "#ef6fb5", "#5fd8cf", "#c9885a", "#9aa4b5",
];
export const STRUCT_COLORS = [
  "#b8c0cc", "#7c879b", "#c9885a", "#e0555f", "#f0a13a", "#f0dc3a",
  "#5ad07a", "#5fd8cf", "#5aa9f0", "#a97af0", "#ef6fb5", "#d84c7a",
];
export const PENCIL_COLORS = ["#e6ecf6", "#f0dc3a", "#f0a13a", "#e0555f", "#ef6fb5", "#a97af0", "#5aa9f0", "#5fd8cf", "#5ad07a"];
export const PENCIL_SIZE = { min: 1, max: 40, def: 3 }; // stroke width, world px (one cell = 32)
export const ERASER_SIZE = { min: 2, max: 96, def: 16 }; // eraser diameter, world px
export const NOTE_COLORS = ["#f0dc3a", "#f0a13a", "#ef6fb5", "#5ad07a", "#5fd8cf", "#5aa9f0", "#a97af0", "#e6ecf6"];
export const NOTE_BOX_W = 236; // expanded note width, in screen px at any zoom
export const STAMP_EMOJI = [
  "⭐", "💎", "❤️", "🗝️", "💀", "👾", "🔥", "💧",
  "⚡", "🌀", "🪜", "📦", "🧱", "⚙️", "🔒", "🚪",
  "💾", "🛏️", "🛒", "👑", "🏁", "❓", "❗", "🕳️",
  "❄️", "💥", "💨", "💦", "⛔", "🚫", "☢️", "⚠️",
  "❌", "⭕", "‼️", "⁉️", "🍔", "🎁", "💰", "🏆",
  "🩸", "💊", "🛡️", "💣", "⚔️", "😈", "🎲", "🪄",
  "🎵", "🪽", "✈️", "🛗", "🛖", "📖", "🎞️", "👤",
  "🎯", "🏞️", "➡️", "⬅️", "⬆️", "⬇️", "☯️", "🐍",
];

const graphemes = (str: string): string[] =>
  typeof Intl !== "undefined" && Intl.Segmenter
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str), (g) => g.segment)
    : Array.from(str);
const isEmoji = (g: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g);
/** The single emoji to keep from a text field's value: the most recently typed one, or null. */
export function pickEmoji(str: string): string | null {
  const gs = graphemes(str || "").filter(isEmoji);
  return gs.length ? gs[gs.length - 1] : null;
}

