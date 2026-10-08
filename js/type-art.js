// Original line-art heads for the six headache types. Drawn for this app (no outside source), so they are
// free to use in a public release. Colours come from the theme (CSS variables), so they follow dark mode.
// Side-view heads face right. Front-view styles show the face straight on, except TMJ and neck, which are
// always drawn in profile because that pain can't be shown from the front.
//
// Dedicated to the public domain (CC0) by the app's author.

const HEAD_D = "M70 232 C72 205 64 190 50 168 C34 142 34 100 52 68 C70 34 112 18 148 34 C176 46 190 76 190 104 C190 112 197 124 207 138 C210 142 206 148 198 149 C200 156 199 162 195 166 C198 172 197 180 192 186 C193 198 184 210 168 213 C154 215 146 216 142 222 L140 232 Z";

const FRONT_D = "M115 18 C166 18 192 56 192 108 C192 150 176 186 150 206 C138 215 128 220 115 220 C102 220 92 215 80 206 C54 186 38 150 38 108 C38 56 64 18 115 18 Z";
const HALF_D = "M115 18 C64 18 38 56 38 108 C38 150 54 186 80 206 C92 215 102 220 115 220 Z";

const FRONT_BASE = `<path class="head" d="${FRONT_D}"/>`;
const FRONT_FEATURES = `
  <path class="ear" d="M40 96 C26 96 24 128 40 134"/>
  <path class="ear" d="M190 96 C204 96 206 128 190 134"/>
  <circle class="eye" cx="84" cy="104" r="5"/>
  <circle class="eye" cx="146" cy="104" r="5"/>
  <path class="brow" d="M68 92 C76 85 90 85 98 92"/>
  <path class="brow" d="M132 92 C140 85 154 85 162 92"/>
  <path class="nose" d="M115 112 C112 128 107 138 114 142 C119 144 125 142 127 139"/>
  <path class="mouth" d="M92 172 C104 183 126 183 138 172"/>`;
const FRONT_HEAD = FRONT_BASE + FRONT_FEATURES;

const HEAD = `
  <path class="head" d="${HEAD_D}"/>
  <path class="ear" d="M96 112 C84 108 80 124 88 136 C93 143 100 142 101 133"/>
  <circle class="eye" cx="170" cy="100" r="4.5"/>
  <path class="brow" d="M160 90 C166 85 176 85 182 90"/>`;

// Pain marks. Shapes show *where*; colour is only reinforcement.
const PAIN = {
  // pain behind/around one eye, with radiating lines
  cluster: `
    <circle cx="170" cy="100" r="19"/>
    <path class="ray" d="M170 70v-14M192 78l10-10M198 100h14M192 122l10 10M148 78l-10-10"/>`,
  // pressure over the forehead, the cheek and beside the nose
  sinus: `
    <ellipse cx="162" cy="66" rx="24" ry="14"/>
    <ellipse cx="170" cy="134" rx="21" ry="14"/>
    <ellipse cx="190" cy="118" rx="8" ry="10"/>`,
  // a tight band all the way round the head
  tension: `
    <path class="band" d="M44 94 C60 56 112 40 160 56 C178 62 188 76 190 92" />
    <path class="band" d="M44 112 C60 74 112 58 160 74 C178 80 188 94 190 108" />`,
  // ache at the jaw joint just in front of the ear
  tmj: `
    <circle cx="120" cy="140" r="15"/>
    <path class="ray" d="M120 118v-9M141 128l7-6M143 150l9 3M99 152l-8 4"/>`,
  // pain on the one side of the head (the side we can see)
  oneSided: `
    <path d="M64 96 C66 62 100 40 138 46 C160 52 170 70 166 92 C150 80 132 84 120 98 C108 112 92 114 74 112 C68 108 65 104 64 96 Z"/>
    <path class="ray" d="M52 82l-10-8M50 104l-12 0"/>`,
  // pain from the neck and the back of the head
  neck: `
    <path d="M44 142 C52 126 70 126 78 142 C84 166 80 198 72 226 L56 226 C50 200 44 170 44 142 Z"/>
    <path class="ray" d="M38 150l-10 0M40 180l-12 4M44 208l-10 8"/>`,
};

// Front-view pain marks (viewer's left is the person's right). Same meaning as the side view.
const PAIN_FRONT = {
  cluster: `
    <circle cx="84" cy="104" r="20"/>
    <path class="ray" d="M84 74v-12M65 83l-9-9M60 104h-12M65 125l-9 9M103 83l9-9"/>`,
  sinus: `
    <ellipse cx="115" cy="62" rx="34" ry="14"/>
    <ellipse cx="80" cy="144" rx="21" ry="14"/>
    <ellipse cx="150" cy="144" rx="21" ry="14"/>`,
  tension: `
    <path class="band" d="M44 58 C74 42 156 42 186 58"/>
    <path class="band" d="M40 74 C72 58 158 58 190 74"/>`,
  oneSided: `
    <path d="${HALF_D}"/>
    <path class="ray" d="M24 70l-10-8M20 108h-12"/>`,
};

// These marks are meant to sit ON the head, so they are trimmed to its outline.
const CLIPPED = ['tension', 'oneSided'];

export const ART_KEYS_FRONT = Object.keys(PAIN_FRONT);

export const ART_KEYS = Object.keys(PAIN);

export const STYLES = {
  line: 'Side · Line drawing',
  solid: 'Side · Bold solid',
  soft: 'Side · Soft glow',
  frontOutline: 'Front · Outline',
  frontFlat: 'Front · Flat colour',
  frontHeat: 'Front · Heat spot',
};
const FRONT_STYLES = ['frontOutline', 'frontFlat', 'frontHeat'];

// Each style is only CSS (plus a blur for the glow styles), so the pain placements stay identical across styles.
const STYLE_CSS = {
  line: `
    .head{fill:var(--head-fill);stroke:var(--head-line);stroke-width:4;stroke-linejoin:round}
    .ear,.brow{fill:none;stroke:var(--head-line);stroke-width:3.5;stroke-linecap:round}
    .eye{fill:var(--head-line)}
    .pain{fill:var(--pain);stroke:var(--pain-line);stroke-width:3}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:5;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:12;stroke-linecap:round}`,
  solid: `
    .head{fill:var(--head-line);stroke:none}
    .ear,.brow{display:none}
    .eye{fill:var(--head-fill)}
    .pain{fill:var(--pain);stroke:var(--head-fill);stroke-width:5;paint-order:stroke;stroke-linejoin:round}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:9;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:16;stroke-linecap:butt}`,
  soft: `
    .head{fill:var(--head-fill);stroke:var(--head-line);stroke-width:2;stroke-linejoin:round;opacity:.95}
    .ear,.brow{fill:none;stroke:var(--head-line);stroke-width:2;stroke-linecap:round;opacity:.6}
    .eye{fill:var(--head-line);opacity:.8}
    .pain{fill:var(--pain);stroke:none;opacity:.8}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:7;stroke-linecap:round;stroke-dasharray:1 14}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:20;stroke-linecap:round}`,
  frontOutline: `
    .head{fill:var(--head-fill);stroke:var(--head-line);stroke-width:5;stroke-linejoin:round}
    .ear,.brow,.nose,.mouth{fill:none;stroke:var(--head-line);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .eye{fill:var(--head-line)}
    .pain{fill:var(--pain);stroke:var(--pain-line);stroke-width:3}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:6;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:12;stroke-linecap:round}`,
  frontFlat: `
    .head{fill:var(--head-fill);stroke:none}
    .ear,.brow,.nose,.mouth{fill:none;stroke:var(--head-line);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;opacity:.75}
    .eye{fill:var(--head-line)}
    .pain{fill:var(--pain);stroke:none}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:8;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:14;stroke-linecap:butt}`,
  frontHeat: `
    .head{fill:var(--head-fill);stroke:var(--head-line);stroke-width:2.5;stroke-linejoin:round}
    .ear,.brow,.nose,.mouth{fill:none;stroke:var(--head-line);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;opacity:.6}
    .eye{fill:var(--head-line);opacity:.85}
    .pain{fill:var(--pain);stroke:none;opacity:.85}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:10;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:24;stroke-linecap:round}`,
};

// Inline SVG <style> rules apply to the whole page, so scope every rule to this style's own class.
const SCOPED = {};
function scoped(st) {
  SCOPED[st] ??= STYLE_CSS[st].split('\n').map((line) => {
    const m = /^(\s*)([^{]+)\{(.*)\}\s*$/.exec(line);
    if (!m) return line;
    return m[1] + m[2].split(',').map((x) => `.art-${st} ${x.trim()}`).join(', ') + '{' + m[3] + '}';
  }).join('\n');
  return SCOPED[st];
}

export function typeArtMarkup(key, style = 'line') {
  if (!PAIN[key]) return '';
  const st = STYLE_CSS[style] ? style : 'line';
  const front = FRONT_STYLES.includes(st) && PAIN_FRONT[key];
  const headD = front ? FRONT_D : HEAD_D;
  const head = front ? FRONT_HEAD : HEAD;
  const pain = front ? PAIN_FRONT[key] : PAIN[key];
  const clip = CLIPPED.includes(key) ? ` clip-path="url(#clip-${st}-${key})"` : '';
  const glow = st === 'soft' ? 6 : st === 'frontHeat' ? 9 : 0;
  const blur = glow ? ` filter="url(#glow-${st}-${key})"` : '';
  const filter = glow ? `\n    <filter id="glow-${st}-${key}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${glow}"/></filter>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 240" class="head-art art-${st}" aria-hidden="true" focusable="false">
  <style>${scoped(st)}
  </style>
  <defs>
    <clipPath id="clip-${st}-${key}"><path d="${headD}"/></clipPath>${filter}
  </defs>${front ? FRONT_BASE : head}
  <g class="pain"${clip}${blur}>${pain}</g>${front ? FRONT_FEATURES : ''}
</svg>`;
}

/** The artwork as a live SVG element (browser only). The markup is our own fixed text, never user input. */
export function artElement(key, style) {
  const m = typeArtMarkup(key, style);
  return m ? new DOMParser().parseFromString(m, 'image/svg+xml').documentElement : null;
}
