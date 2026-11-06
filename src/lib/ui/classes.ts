// Utility classes that several parts of the page share, so each style is
// written once. Colours stay out of them: each element adds its own, since two
// colour utilities on one element would fight. Tailwind finds classes by
// reading the source, so a variant has to be written out in full, never glued
// onto one of these with a template string.

/** A key's label, pressed into the glass: a dark lip under each letter, a faint light one over it. */
export const KEY_LABEL =
  'font-stretch-125% font-bold text-[11px] tracking-[0.08em] uppercase leading-none text-shadow-[0_1px_1px_rgba(0,0,0,0.7),0_-1px_0_rgba(255,255,255,0.1)]';

/** A small capital label over a figure. History's labels follow its own size (--lab); the rest are 12px. */
export const LABEL =
  'font-stretch-100% text-[length:var(--lab,12px)] font-semibold leading-[14px] tracking-[0.07em] uppercase';

/**
 * Every unit beside a figure, on every screen, in one style and its own
 * case: ms, Mbps, Gbps, MB, GB (MBps would be another unit). The director
 * writes it into the figures it fills, too.
 */
export const UNIT =
  'ml-1 font-stretch-100% text-[length:var(--lab,12px)] font-semibold leading-[14px] tracking-[0.02em] text-ink-3';

/** History's and a reopened run's values read as data: the figures' condensed face at regular weight, at their own size (--fs). */
export const VALUE =
  'whitespace-nowrap font-stretch-62% font-normal text-[length:var(--fs,16px)] leading-[1.25] tracking-[0.01em] [word-spacing:0.08em] text-ink';
