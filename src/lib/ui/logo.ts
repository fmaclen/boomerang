// The logo, the tab icon and the home-screen icon. The logo is "boomerang"
// with its two o's fused, an orange arc over them and a lime arc under, the
// lower arc the upper one turned half a turn about the point where the o's
// meet, so it mirrors it exactly. The icons are cut from the "oo". The
// outlines themselves are in outlines.ts.

import { ARC, ARC_16, OO } from './outlines';

const GROUND = '#080d0c';
const INK = '#f1f7eb';
const LIME = '#a1ff59';
const ORANGE = '#ff7a30';
/** The arcs' own hues deepened until they hold 3:1 on Chrome's light tab strip, #dee1e6. */
const LIME_DEEP = '#3e8f00';
const ORANGE_DEEP = '#dc4f00';

/** Where the o's meet, halfway up the x-height, in font units. */
const MID = { x: 1126.5, y: -264 };

/** Each arc's centre this far above and below the o's middle: on the word, and on the 16 px cut. */
const REACH = 473;
const REACH_16 = 532.06;

export const over = (reach = REACH) => `translate(${MID.x} ${MID.y - reach})`;
export const under = (reach = REACH) => `translate(${MID.x} ${MID.y + reach}) rotate(180)`;

/**
 * The word's box, as wide as its ink and as tall as its reach either way from
 * the o's middle, so centring the box centres the x-height. In the top bar
 * the capitals would be 22 px tall, so the box is 166.73 by 34.19 px.
 */
export const WORD_BOX = { viewBox: '61 -797 5199 1066', width: 166.73, height: 34.19 };

/** How far each arc flies on hover, in font units: 1.05 of its height. */
export const THROW = 224.58;

/** The scale from font units into the icons' 32-unit square: the 16 px cut, the crop, and the home-screen icon's 0.74 of the crop, clear of iOS's rounded corners. */
const K_16 = 0.025029;
const K_32 = 0.028612;
const K_HOME = +(K_32 * 0.74).toFixed(6);

const inks = (o: string, up: string, down: string) => `.o{fill:${o}}.u{fill:${up}}.d{fill:${down}}`;

/** The oo and its arcs in a 32-unit square, centred on the o's middle. */
function drawing(k: number, arc: string, reach: number): string {
  return (
    `<g transform="translate(16 16) scale(${k}) translate(${-MID.x} ${-MID.y})">` +
    `<path class="o" d="${OO}"/>` +
    `<path class="u" transform="${over(reach)}" d="${arc}"/>` +
    `<path class="d" transform="${under(reach)}" d="${arc}"/></g>`
  );
}

/** A tab icon: the page's colours, or, on a light colour scheme, the ground's ink and the deepened arcs. */
function tabIcon(k: number, arc: string, reach: number): string {
  const style = inks(INK, ORANGE, LIME) + `@media (prefers-color-scheme:light){${inks(GROUND, ORANGE_DEEP, LIME_DEEP)}}`;
  return svg(style, drawing(k, arc, reach));
}

const svg = (style: string, body: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"${attrs}><style>${style}</style>${body}</svg>`;

const uri = (s: string) => 'data:image/svg+xml,' + encodeURIComponent(s);

/** The tab icon at 16 px, its own cut with heavier arcs that hold at that size. */
export const TAB_16 = uri(tabIcon(K_16, ARC_16, REACH_16));
/** The tab icon at 32 px and up, the plain crop from the word. */
export const TAB_32 = uri(tabIcon(K_32, ARC, REACH));
/** The home-screen icon's drawing: the crop on the page's ground, filling the square; iOS rounds its corners. */
export const HOME = uri(svg(inks(INK, ORANGE, LIME), `<rect width="32" height="32" fill="${GROUND}"/>` + drawing(K_HOME, ARC, REACH), ' width="180" height="180"'));

/**
 * Puts the icons in the page's head. The 16 px cut carries no size, so a
 * browser takes it for the tab at any screen density; the crop says 32x32,
 * for places that ask for a larger icon.
 * iOS takes no SVG for the home screen, so the home-screen icon is drawn to a
 * 180 px PNG. All three are data URIs, so they cost no request.
 */
export function installIcons(): void {
  const link = (rel: string, href: string, sizes?: string) => {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    if (rel === 'icon') l.type = 'image/svg+xml';
    if (sizes) l.setAttribute('sizes', sizes);
    document.head.append(l);
  };
  link('icon', TAB_16);
  link('icon', TAB_32, '32x32');
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    c.getContext('2d')?.drawImage(im, 0, 0, 180, 180);
    link('apple-touch-icon', c.toDataURL('image/png'), '180x180');
  };
  im.src = HOME;
}
