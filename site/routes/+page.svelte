<!--
  The landing page at boomerang.fernando.is: the app itself, running a
  simulated link (the demo build under /demo/), filling the window under one
  thin bar. The bar says the run is simulated, and links to self-hosting and
  the latest release, read from GitHub in the browser. Prerendered; the only
  script work is the favicon and that release.
-->
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { installIcons } from '../../src/lib/ui/logo';
  import { KEY_LABEL } from '../../src/lib/ui/classes';

  const SITE = 'https://boomerang.fernando.is';
  const GUIDE = 'https://github.com/fmaclen/boomerang/blob/master/docs/self-hosting.md';
  const RELEASES = 'https://github.com/fmaclen/boomerang/releases';
  // `releases/latest` skips prereleases, so the page always names the newest stable one.
  const RELEASE_API = 'https://api.github.com/repos/fmaclen/boomerang/releases/latest';

  const TITLE = 'Boomerang: a speed test for your own network';
  const DESCRIPTION =
    'A self-hosted speed test. Run it on a box at home and it measures the link to the phone or laptop you open it on: your Wi-Fi, your LAN or your tailnet.';

  type Release = { tag: string; url: string };
  // Until GitHub names a release (and whenever it can't), the key links to the releases page.
  let release = $state<Release>();

  async function latestRelease(): Promise<Release | undefined> {
    try {
      const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) return;
      const { tag_name, html_url } = await response.json();
      if (typeof tag_name !== 'string' || typeof html_url !== 'string') return;
      return { tag: tag_name, url: html_url };
    } catch {
      return;
    }
  }

  // The note stays quiet until the demo runs a test. The frame is on this
  // origin, so the page reads the demo's bottom key, whose data-screen is
  // `run` from the press of Start until New test.
  let running = $state(false);
  let frame: HTMLIFrameElement;
  function watch(): void {
    const doc = frame.contentDocument;
    if (!doc?.URL.includes('/demo')) return;
    const read = () => (running = doc.getElementById('dock')?.dataset.screen === 'run');
    new MutationObserver(read).observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
    read();
  }

  onMount(() => {
    installIcons();
    latestRelease().then((found) => (release = found));
    // The frame may have loaded before this script did.
    frame.addEventListener('load', watch);
    watch();
  });

  /** A compact secondary key: hollow, an even hairline round the label, as the app draws Clear history. */
  const KEY = 'glass hollow inline-flex h-8 items-center gap-2 px-4.5 text-ink-2 transition-colors fine:hover:text-ink';
  /** Trims a label to its capitals, so it sits on the middle of its key the way the app's labels do. */
  const TRIM = '[text-box:trim-both_cap_alphabetic]';
</script>

<svelte:head>
  <title>{TITLE}</title>
  <meta name="description" content={DESCRIPTION} />
  <meta name="theme-color" content="#080d0c" />
  <link rel="canonical" href="{SITE}/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Boomerang" />
  <meta property="og:url" content="{SITE}/" />
  <meta property="og:title" content={TITLE} />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:image" content="{SITE}/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Boomerang's start screen: a lime Start button over a swarm of boomerangs" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="flex h-dvh flex-col">
  <!-- The bar is the app's own chrome, laid out like its top bar: Self-host on the left, the note in the
       middle in a key's lettering, muted until a test runs, and the latest release on the right. -->
  <header class="grid h-14 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-ink/8 px-4 sm:gap-4 sm:px-6">
    <!-- On a phone, Self-host is the Docker icon alone in a round key, so the note keeps its room. -->
    <a class="{KEY} justify-self-start max-sm:w-8 max-sm:justify-center max-sm:px-0" href={GUIDE} aria-label="Self-host with Docker">
      <svg class="size-4 flex-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
        ><path d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.18.18 0 0 0-.18.18v1.9c0 .1.08.18.18.18m-2.95-5.43h2.12a.19.19 0 0 0 .18-.19V3.57a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m0 2.71h2.12a.19.19 0 0 0 .18-.18V6.29a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.89c0 .1.09.18.19.18m-2.93 0h2.12a.19.19 0 0 0 .18-.18V6.29a.18.18 0 0 0-.18-.18H8.1a.18.18 0 0 0-.18.18v1.89c0 .1.08.18.18.18m-2.96 0h2.11a.19.19 0 0 0 .19-.18V6.29a.18.18 0 0 0-.19-.18H5.14a.19.19 0 0 0-.19.18v1.89c0 .1.08.18.19.18m5.89 2.72h2.12a.19.19 0 0 0 .18-.19V9.01a.19.19 0 0 0-.18-.19h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m-2.93 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H8.1a.18.18 0 0 0-.18.19v1.89c0 .1.08.19.18.19m-2.96 0h2.11a.18.18 0 0 0 .19-.19V9.01a.18.18 0 0 0-.18-.19H5.14a.19.19 0 0 0-.19.19v1.89c0 .1.08.19.19.19m-2.92 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H2.22a.18.18 0 0 0-.19.19v1.89c0 .1.08.19.19.19m21.54-1.19c-.06-.05-.67-.51-1.95-.51-.34 0-.68.03-1.01.09a3.77 3.77 0 0 0-1.72-2.57l-.34-.2-.23.33a4.6 4.6 0 0 0-.6 1.43c-.24.93-.1 1.8.36 2.55-.56.31-1.45.38-1.63.39H.75a.75.75 0 0 0-.75.75 11.38 11.38 0 0 0 .7 4.06 6.03 6.03 0 0 0 2.4 3.12c1.18.73 3.1 1.14 5.28 1.14.98 0 1.96-.09 2.93-.27a12.1 12.1 0 0 0 3.82-1.39 10.5 10.5 0 0 0 2.6-2.13c1.25-1.42 2-3 2.55-4.4h.22c1.37 0 2.21-.55 2.68-1.01.31-.3.55-.65.71-1.05l.1-.29Z" /></svg
      >
      <span class="hidden sm:inline {TRIM} {KEY_LABEL}">Self-host</span>
    </a>
    <p class="m-0 flex items-center gap-3" data-testid="demo-note" data-running={running}>
      <!-- While a test runs, the dot lights and a ring pulses out of it. -->
      <span class="relative size-2 flex-none" aria-hidden="true">
        {#if running}
          <span class="absolute inset-0 rounded-full bg-lime opacity-75 motion-safe:animate-ping"></span>
        {/if}
        <span
          class="absolute inset-0 rounded-full transition-[background-color,box-shadow] duration-500 {running
            ? 'bg-lime shadow-[0_0_10px_rgba(161,255,89,0.8)]'
            : 'bg-ink-3 shadow-none'}"
        ></span>
      </span>
      <span class="whitespace-nowrap transition-colors duration-500 {running ? 'text-ink' : 'text-ink-3'} {TRIM} {KEY_LABEL}">Simulated demo</span>
    </p>
    <!-- Until there is a release, a phone shows a tag icon in a round key here, matching Self-host's. -->
    <a
      class="{KEY} justify-self-end {release ? '' : 'max-sm:w-8 max-sm:justify-center max-sm:px-0'}"
      href={release?.url ?? RELEASES}
      aria-label={release ? undefined : 'Releases'}
      data-testid="release"
      data-release={release ? 'shown' : 'hidden'}
    >
      {#if release}
        <span class="text-ink {TRIM} {KEY_LABEL}" data-testid="release-tag">{release.tag}</span>
      {:else}
        <svg class="size-4 flex-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] sm:hidden" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
          ><path
            d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
          /></svg
        >
        <span class="hidden sm:inline {TRIM} {KEY_LABEL}">Releases</span>
      {/if}
    </a>
  </header>
  <iframe class="block min-h-0 w-full flex-auto border-0 bg-ground" title="Boomerang demo" src="/demo/" bind:this={frame}></iframe>
</div>
