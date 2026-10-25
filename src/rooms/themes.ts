// The rooms card's themes: the seven built-in looks and the preset palettes, each with the
// two colours the overlay needs (the stage it sits on, the edge colour it contrasts with). The
// presets are the card's named palettes (look-palettes.ts), so the picture is the floor3dx look at those colours.
import { STAGE, EDGE } from '../look';
import { PALETTES, LookPalette } from '../look-palettes';

export interface RoomsTheme {
  key: string;
  label: string;
  group: string;
  look: any | null; // the embedded card's `look` block; null = the model as it is
  stage: string; // background (#rrggbb)
  edges: string; // line / accent colour (#rrggbb)
  light: boolean; // light stage: the overlay uses dark text on a pale panel
  accent?: string; // the overlay's accent when not the edge colour (#rrggbb)
  panel?: string; // the panel colour when not the stage (#rrggbb)
}

const hex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const hexNum = (n: number) => '#' + n.toString(16).padStart(6, '0');
const luma = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

const builtin = (key: string, label: string): RoomsTheme => ({
  key,
  label,
  group: 'Looks',
  look: { theme: key, edge_skip: 'seams, floors' },
  stage: hex((STAGE as any)[key].night),
  edges: hexNum((EDGE as any)[key]),
  light: luma(hex((STAGE as any)[key].night)) > 0.5,
});

const palette = (p: LookPalette): RoomsTheme => ({
  key: p.key,
  label: p.label,
  group: p.group,
  look: { theme: p.key, edge_skip: 'seams, floors' }, // the card resolves the palette name itself (2.4)
  stage: p.stage,
  edges: p.edges,
  light: luma(p.stage) > 0.5,
  accent: p.accent,
  panel: p.panel,
});

export const THEMES: RoomsTheme[] = [
  { key: 'off', label: 'Model as it is', group: 'Looks', look: null, stage: '#848c8f', edges: '#ffffff', light: false },
  builtin('neon', 'Neon'),
  builtin('blueprint', 'Blueprint'),
  builtin('day', 'Day'),
  builtin('paper', 'Paper'),
  builtin('ember', 'Ember'),
  builtin('pastel', 'Pastel'),
  ...PALETTES.map(palette),
];

export function themeOf(key: any): RoomsTheme {
  const k = String(key || 'neon').toLowerCase();
  return THEMES.find((t) => t.key === k) || THEMES[1];
}

/** `#rrggbb` → `r, g, b` for rgba() in CSS. */
export function rgb(h: string): string {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
