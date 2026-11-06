import type { Device } from './types';

/**
 * The system, the kind of device and the browser a run was made on, read
 * from the browser itself: a small parse of the user agent, sharpened by the
 * client hints (navigator.userAgentData) where the browser offers them.
 * Names only, no versions. An iPad asks for desktop pages with a Mac's
 * string, so only its touch screen gives it away; an Android browser without
 * "Mobile" in its string is a tablet. Saved with each run in this browser
 * only: the public record never carries it (see record.ts).
 */
export function deviceOf(): Device {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[]; platform?: string; mobile?: boolean } };
  const ua = nav.userAgent || '';
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  let os = /iPhone|iPod/.test(ua)
    ? 'iPhone'
    : iPad
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'macOS'
            : /Windows/.test(ua)
              ? 'Windows'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  let browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|OPiOS/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS|Chromium/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
  let form: Device['form'] =
    iPad || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /iPhone|iPod|Android|Mobi/.test(ua) ? 'Mobile' : 'Desktop';

  // Client hints only come from Chromium browsers, where they name what the
  // string cannot (Brave's string is Chrome's) and say the system plainly.
  const hints = nav.userAgentData;
  if (hints && /Chrome\/|Chromium|Edg\/|OPR\//.test(ua)) {
    const names = (hints.brands ?? []).map((b) => b.brand);
    const brands: [string, string][] = [
      ['Microsoft Edge', 'Edge'],
      ['Opera', 'Opera'],
      ['Brave', 'Brave'],
      ['Google Chrome', 'Chrome'],
      ['HeadlessChrome', 'Chrome'],
      ['Chromium', 'Chrome'],
    ];
    const brand = brands.find(([b]) => names.includes(b));
    if (brand) browser = brand[1];
    const platforms: Record<string, string> = {
      macOS: 'macOS',
      Windows: 'Windows',
      Android: 'Android',
      'Chrome OS': 'ChromeOS',
      ChromeOS: 'ChromeOS',
      Linux: 'Linux',
    };
    const platform = hints.platform ? platforms[hints.platform] : undefined;
    if (platform) os = platform;
  }
  if (hints && typeof hints.mobile === 'boolean' && form !== 'Tablet') form = hints.mobile ? 'Mobile' : 'Desktop';
  return { os, form, browser };
}
