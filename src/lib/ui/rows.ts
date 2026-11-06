// How History writes a saved run: when it happened, what it ran on.

import type { Device } from '../engine';

const DAY = 864e5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Minutes or hours today, Yesterday, days this week, and the date beyond a week (with the year once it is not this one). Calendar days, not 24-hour spans. */
export function whenOf(at: number, now: number): string {
  const s = (now - at) / 1000;
  const a = new Date(at);
  const b = new Date(now);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  const days = Math.round(
    (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / DAY,
  );
  if (days <= 0) return `${Math.floor(s / 3600)} hr ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return `${MONTHS[a.getMonth()]} ${a.getDate()}${a.getFullYear() !== b.getFullYear() ? `, ${a.getFullYear()}` : ''}`;
}

/**
 * Each system's mark, a filled shape like every glyph on the page. iPhone,
 * iPad and macOS share Apple's; a system with no mark is named instead.
 */
const OS_MARK: Record<string, string> = {
  Apple:
    '<path d="M12 7.3c1 0 2.1-.7 3.3-.7 1.4 0 2.6.7 3.3 1.8-1.3.8-2.1 2.1-2.1 3.6 0 1.6 1 2.9 2.4 3.4-.5 1.6-1.7 3.6-2.9 4.6-.7.6-1.2.8-1.9.8-1 0-1.3-.5-2.1-.5s-1.1.5-2.1.5c-.7 0-1.3-.4-1.9-1-1.6-1.8-2.8-4.5-2.8-7.2 0-3.6 1.8-6 4.1-6 1.2 0 1.9.7 2.7.7zM12.1 5.6c-.1-1.6 1.2-3 2.8-3.2.1 1.6-1.2 3-2.8 3.2z"/>',
  Windows: '<path d="M4 4h7.2v7.2H4zM12.8 4H20v7.2h-7.2zM4 12.8h7.2V20H4zM12.8 12.8H20V20h-7.2z"/>',
  Android:
    '<path fill-rule="evenodd" d="M3.8 18.5a8.2 8.2 0 0 1 16.4 0zM9 13.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM15 13.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/><path d="M8.63 10.87 6.93 7.97a.85.85 0 0 0-1.46.86l1.7 2.9zM15.37 10.87l1.7-2.9a.85.85 0 0 1 1.46.86l-1.7 2.9z"/>',
  Linux:
    '<path fill-rule="evenodd" d="M12 2.4c-2.5 0-4 1.9-4 4.4v1.4c0 1.1-.6 1.9-1.4 3-1 1.4-2 3.2-2 5.4 0 2.6 2.4 4.4 7.4 4.4s7.4-1.8 7.4-4.4c0-2.2-1-4-2-5.4-.8-1.1-1.4-1.9-1.4-3V6.8c0-2.5-1.5-4.4-4-4.4zM12 11.3c-2 0-3.5 1.9-3.5 4.3s1.5 4.1 3.5 4.1 3.5-1.7 3.5-4.1-1.5-4.3-3.5-4.3zM10.6 5.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zM13.4 5.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zM10.8 8.3h2.4L12 9.8z"/><path d="M4.6 20.4c0-.9 1.3-1.6 3-1.6s3 .7 3 1.6-1.3 1.6-3 1.6-3-.7-3-1.6zM13.4 20.4c0-.9 1.3-1.6 3-1.6s3 .7 3 1.6-1.3 1.6-3 1.6-3-.7-3-1.6z"/>',
  ChromeOS:
    '<path d="M12 7.2L12 6.55L19.16 6.55A9 9 0 0 0 4.41 7.16L7.2 11.99A4.8 4.8 0 0 1 12 7.2ZM7.84 14.4L7.28 14.73L3.7 8.52A9 9 0 0 0 11.6 20.99L14.39 16.16A4.8 4.8 0 0 1 7.84 14.4ZM16.16 14.4L16.72 14.73L13.14 20.93A9 9 0 0 0 19.99 7.85L14.41 7.85A4.8 4.8 0 0 1 16.16 14.4ZM15.4 12A3.4 3.4 0 1 0 8.6 12A3.4 3.4 0 1 0 15.4 12Z"/>',
};

export const osMark = (os: string): string | undefined => OS_MARK[/^(iPhone|iPad|macOS)$/.test(os) ? 'Apple' : os];

/** What a run was made on, as a mark and a word: the kind of device after the system's mark, or the system named when it has none. */
export function deviceWords(d: Device | undefined): { os: string; mark: string | undefined; text: string } {
  if (!d) return { os: '', mark: undefined, text: '' };
  const mark = osMark(d.os);
  return { os: d.os, mark, text: mark || !d.os ? d.form : `${d.os} ${d.form}` };
}

/** The same, said in words for a screen reader. */
export function deviceName(d: Device | undefined): string {
  if (!d) return '';
  return /^(iPhone|iPad)$/.test(d.os) ? d.os : [d.os, d.form.toLowerCase()].filter(Boolean).join(' ');
}

export const modeName = (mode: string) => (mode === 'fixed' ? 'Long' : 'Quick');
