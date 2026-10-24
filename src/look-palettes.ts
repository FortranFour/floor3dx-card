// Named palettes of `look: theme: custom`: the 33 presets, usable as `look.theme` names in the card
// and as swatches in the rooms card. Each is a complete CustomTheme; `group` and `label` are for pickers.
import type { CustomTheme } from './look';

export interface LookPalette extends CustomTheme { key: string; label: string; group: string; stage: string; edges: string }

export const PALETTES: LookPalette[] = [
  { key: 'midnight-teal', label: 'Midnight teal', group: 'One hue', ...{ dark: '#0b1f24', light: '#2f6f7a', walls: '#3a8a94', floors: '#1f4a52', edges: '#7fe9d8', stage: '#061418', hue: 0.1 } },
  { key: 'ultraviolet', label: 'Ultraviolet', group: 'One hue', ...{ dark: '#1a0f2e', light: '#5e3f8f', walls: '#714fa8', floors: '#3f2a66', edges: '#d8a6ff', stage: '#0d0718', hue: 0.1 } },
  { key: 'copper-slate', label: 'Copper slate', group: 'One hue', ...{ dark: '#1f2326', light: '#6b7378', walls: '#7d868c', floors: '#4f575c', edges: '#e39a5c', stage: '#121517', hue: 0.1 } },
  { key: 'rose-gold', label: 'Rose gold', group: 'One hue', ...{ dark: '#2a1a1e', light: '#a0707a', walls: '#b58a8e', floors: '#7d5a60', edges: '#ffc9b3', stage: '#170d10', hue: 0.2 } },
  { key: 'moss', label: 'Moss', group: 'One hue', ...{ dark: '#16211a', light: '#5f7f5a', walls: '#7a9a6a', floors: '#44603f', edges: '#cde9a6', stage: '#0d140f', hue: 0.2 } },
  { key: 'sunset', label: 'Sunset', group: 'One hue', ...{ dark: '#2b1a2e', light: '#c76b5a', walls: '#d9836b', floors: '#9b4d4a', edges: '#ffd27a', stage: '#1a0f20', hue: 0.15 } },
  { key: 'noir', label: 'Noir', group: 'One hue', ...{ dark: '#141414', light: '#5a5a5a', walls: '#6a6a6a', floors: '#3c3c3c', edges: '#f2f2f2', stage: '#080808', hue: 0 } },
  { key: 'crt', label: 'CRT', group: 'One hue', ...{ dark: '#031a0a', light: '#0f6b2a', walls: '#138a35', floors: '#0a4a1c', edges: '#5dff8a', stage: '#010d05', hue: 0 } },
  { key: 'ocean', label: 'Ocean', group: 'One hue', ...{ dark: '#0a2340', light: '#2f6fb0', walls: '#3b82c9', floors: '#1e4f85', edges: '#ffffff', stage: '#06162b', hue: 0.05 } },
  { key: 'architect', label: 'Architect', group: 'One hue', ...{ dark: '#8a8073', light: '#d9d2c7', walls: '#e4ded4', floors: '#c4bbae', edges: '#2b2622', stage: '#ede7dd', hue: 0.1 } },
  { key: 'mint-cream', label: 'Mint cream', group: 'One hue', ...{ dark: '#86a59b', light: '#e3f0ea', walls: '#ecf5f0', floors: '#cfe2d9', edges: '#2f5e52', stage: '#eef6f2', hue: 0.25 } },
  { key: 'arctic', label: 'Arctic', group: 'One hue', ...{ dark: '#8c9bb0', light: '#e9eff6', walls: '#f0f4f9', floors: '#d6dfea', edges: '#1e3a5f', stage: '#f2f6fb', hue: 0.05 } },
  { key: 'infrared', label: 'Infrared', group: 'Duotone', ...{ dark: '#2a0a2e', light: '#ff7a59', walls: '#ff9a7a', floors: '#c04a5a', edges: '#ffe3d1', stage: '#140512', hue: 0 } },
  { key: 'riso', label: 'Riso', group: 'Duotone', ...{ dark: '#0f2a5c', light: '#ff8fb1', walls: '#ffa3c0', floors: '#d86a92', edges: '#ffffff', stage: '#081a3d', hue: 0 } },
  { key: 'navy-tangerine', label: 'Navy tangerine', group: 'Contrast lines', ...{ dark: '#0d1b33', light: '#2b4470', walls: '#345082', floors: '#1e3358', edges: '#ff8c3a', stage: '#070f1f', hue: 0.05 } },
  { key: 'cyberpunk', label: 'Cyberpunk', group: 'Contrast lines', ...{ dark: '#120a2a', light: '#2a1f5e', walls: '#33277a', floors: '#1c1545', edges: '#ff2fa8', stage: '#0a0618', hue: 0 } },
  { key: 'sodium', label: 'Sodium', group: 'Metals', ...{ dark: '#2a1a05', light: '#d99a2b', walls: '#e6ad3f', floors: '#a3701c', edges: '#fff1c2', stage: '#140d02', hue: 0 } },
  { key: 'gold-leaf', label: 'Gold leaf', group: 'Metals', ...{ dark: '#3a2a08', light: '#c9a227', walls: '#d8b23a', floors: '#9a7a1a', edges: '#fff2b0', stage: '#0a0805', hue: 0 } },
  { key: 'x-ray', label: 'X-ray', group: 'Inverted', ...{ dark: '#d8e8f0', light: '#1f3a4a', walls: '#25465a', floors: '#10242e', edges: '#bfe9ff', stage: '#06141c', hue: 0 } },
  { key: 'hologram', label: 'Hologram', group: 'Inverted', ...{ dark: '#0b3a4a', light: '#0b3a4a', walls: '#0e4456', floors: '#083040', edges: '#7ff3ff', stage: '#03141b', hue: 0 } },
  { key: 'ivory-on-black', label: 'Ivory on black', group: 'Pale on black', ...{ dark: '#6e6a60', light: '#f0ebe0', walls: '#f4f0e6', floors: '#d8d2c4', edges: '#ffffff', stage: '#000000', hue: 0.1 } },
  { key: 'ice', label: 'Ice', group: 'Pale on black', ...{ dark: '#4a6a80', light: '#dff3ff', walls: '#eaf7ff', floors: '#bcdcea', edges: '#ffffff', stage: '#02070c', hue: 0 } },
  { key: 'ink-on-paper', label: 'Ink on paper', group: 'Light stage', ...{ dark: '#1a1a1a', light: '#3a3a3a', walls: '#454545', floors: '#2a2a2a', edges: '#f5f0e6', stage: '#efe9dc', hue: 0 } },
  { key: 'true-colour', label: 'True colour', group: 'One hue', ...{ dark: '#1a1c24', light: '#6a6f80', walls: '#7c8294', floors: '#4e5462', edges: '#dfe6ff', stage: '#0f1116', hue: 0.6 } },
  // three tones: walls, floors and furniture each in their own hue
  { key: 'harbour', label: 'Harbour', group: 'Three tones', ...{ dark: '#141a22', walls: '#3b7a8c', floors: '#5a4a7a', light: '#c98a3c', edges: '#e8f0ff', stage: '#0b1016', hue: 0.1 } },
  { key: 'autumn', label: 'Autumn', group: 'Three tones', ...{ dark: '#1d1711', walls: '#8c5a3c', floors: '#4a5a2c', light: '#d8b24a', edges: '#ffd9a0', stage: '#120e0a', hue: 0.1 } },
  { key: 'coral-reef', label: 'Coral reef', group: 'Three tones', ...{ dark: '#10202a', walls: '#2a6f8f', floors: '#d87a5a', light: '#e9d9a0', edges: '#aef0ff', stage: '#081419', hue: 0.1 } },
  { key: 'berry', label: 'Berry', group: 'Three tones', ...{ dark: '#160e18', walls: '#6a2f5a', floors: '#2f3f6a', light: '#d8a05a', edges: '#ffb6d9', stage: '#0d0810', hue: 0.1 } },
  { key: 'forest-floor', label: 'Forest floor', group: 'Three tones', ...{ dark: '#141a12', walls: '#4a6a3c', floors: '#7a5a3c', light: '#c9b48a', edges: '#d9f0b0', stage: '#0c110b', hue: 0.1 } },
  { key: 'steel-brass', label: 'Steel brass', group: 'Three tones', ...{ dark: '#1a1d22', walls: '#5e6b7a', floors: '#3a3f48', light: '#b8923e', edges: '#dfe6ee', stage: '#0f1115', hue: 0.05 } },
  { key: 'mondrian', label: 'Mondrian', group: 'Three tones', ...{ dark: '#6a6a6a', walls: '#e8e4da', floors: '#c8313a', light: '#2b4fa8', edges: '#111111', stage: '#f2efe8', hue: 0 } },
  { key: 'lagoon-sand', label: 'Lagoon sand', group: 'Three tones', ...{ dark: '#7a8f8a', walls: '#ecdfc4', floors: '#3f9e9a', light: '#d16a4a', edges: '#1f3f3f', stage: '#f0ebe0', hue: 0.1 } },
  { key: 'candy', label: 'Candy', group: 'Three tones', ...{ dark: '#b89ab0', walls: '#fbe7ee', floors: '#d8ecf7', light: '#fff0b8', edges: '#6a4a6a', stage: '#fff7fa', hue: 0.15 } },
];

export const PALETTE_KEYS = PALETTES.map((p) => p.key);

export function paletteOf(key: any): LookPalette | undefined {
  const k = String(key || '').toLowerCase();
  return PALETTES.find((p) => p.key === k);
}
