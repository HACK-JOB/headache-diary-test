// Original line-art heads for the six headache types. Drawn for this app (no outside source), so they are
// free to use in a public release. Colours come from the theme (CSS variables), so they follow dark mode.
// Every head faces right, so "front of the face" is always on the right of the picture.
//
// Dedicated to the public domain (CC0) by the app's author.

const HEAD_D = "M70 232 C72 205 64 190 50 168 C34 142 34 100 52 68 C70 34 112 18 148 34 C176 46 190 76 190 104 C190 112 197 124 207 138 C210 142 206 148 198 149 C200 156 199 162 195 166 C198 172 197 180 192 186 C193 198 184 210 168 213 C154 215 146 216 142 222 L140 232 Z";

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

// These marks are meant to sit ON the head, so they are trimmed to its outline.
const CLIPPED = ['tension', 'oneSided'];

export const ART_KEYS = Object.keys(PAIN);

export function typeArtMarkup(key) {
  if (!PAIN[key]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 240" class="head-art" aria-hidden="true" focusable="false">
  <style>
    .head{fill:var(--head-fill);stroke:var(--head-line);stroke-width:4;stroke-linejoin:round}
    .ear,.brow{fill:none;stroke:var(--head-line);stroke-width:3.5;stroke-linecap:round}
    .eye{fill:var(--head-line)}
    .pain{fill:var(--pain);stroke:var(--pain-line);stroke-width:3}
    .pain .ray{fill:none;stroke:var(--pain);stroke-width:5;stroke-linecap:round}
    .pain .band{fill:none;stroke:var(--pain);stroke-width:12;stroke-linecap:round}
  </style>${HEAD}
  <clipPath id="clip-${key}"><path d="${HEAD_D}"/></clipPath>
  <g class="pain"${CLIPPED.includes(key) ? ` clip-path="url(#clip-${key})"` : ''}>${PAIN[key]}</g>
</svg>`;
}
