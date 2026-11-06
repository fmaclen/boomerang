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

  // The note shows, in place of the keys, only while the demo runs a test. The
  // frame is on this origin, so the page reads the demo's bottom key, whose
  // data-screen turns `run` at the press of Start. It turns back only partway
  // through the way home, so the bar leaves at the press that starts it: Stop
  // or New test (#action), or the logo.
  let running = $state(false);
  let frame: HTMLIFrameElement;
  function watch(): void {
    const doc = frame.contentDocument;
    if (!doc?.URL.includes('/demo')) return;
    let leaving = false;
    const read = () => {
      const run = doc.getElementById('dock')?.dataset.screen === 'run';
      if (!run) leaving = false;
      running = run && !leaving;
    };
    new MutationObserver(read).observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
    doc.addEventListener('click', (event) => {
      if (running && (event.target as Element).closest('#action, #logo')) running = !(leaving = true);
    });
    read();
  }

  onMount(() => {
    installIcons();
    latestRelease().then((found) => (release = found));
    // The frame may have loaded before this script did.
    frame.addEventListener('load', watch);
    watch();
  });

  /** A ghost key: the lettering alone, no glass round it, so its edge is the edge of the app's key below. */
  const KEY =
    'inline-flex h-8 items-center gap-2 whitespace-nowrap text-ink-2 fine:hover:text-ink [transition:color_160ms_ease,opacity_var(--fade)_cubic-bezier(0.77,0,0.175,1)_var(--wait),visibility_var(--fade)_var(--wait)]';
  const NOTE = '[transition:opacity_var(--fade)_cubic-bezier(0.77,0,0.175,1)_var(--wait),visibility_var(--fade)_var(--wait)]';
  /**
   * The keys and the note hand over rather than cross, so the bar never
   * shows both: at Start the keys go, then the note comes, done in a second
   * as the app's camera settles; at New test the note goes, then the keys
   * come back, about as quick as the app's way home.
   */
  const KEYS_GO = 'invisible opacity-0 [--fade:400ms] [--wait:100ms]';
  const NOTE_COMES = '[--fade:500ms] [--wait:500ms]';
  const NOTE_GOES = 'invisible opacity-0 [--fade:250ms] [--wait:0ms]';
  const KEYS_COME = '[--fade:300ms] [--wait:250ms]';
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
  <!-- The bar is the app's own chrome, laid out like its top bar right under it and as wide: Self-host
       starting where the GitHub key does and the latest release ending where the History key does.
       While a test runs both give way to the note, floated over the middle, saying the readings are
       simulated. -->
  <header class="flex h-14 flex-none items-center border-b border-ink/8">
    <div
      class="relative mx-auto flex w-(--col) items-center justify-between wide:w-full wide:px-[max(96px,calc(50vw-var(--ui-max)/2))]"
    >
      <a class="{KEY} {running ? KEYS_GO : KEYS_COME}" href={GUIDE} aria-label="Self-host with Docker">
        <svg class="size-4 flex-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
          ><path d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.18.18 0 0 0-.18.18v1.9c0 .1.08.18.18.18m-2.95-5.43h2.12a.19.19 0 0 0 .18-.19V3.57a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m0 2.71h2.12a.19.19 0 0 0 .18-.18V6.29a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.89c0 .1.09.18.19.18m-2.93 0h2.12a.19.19 0 0 0 .18-.18V6.29a.18.18 0 0 0-.18-.18H8.1a.18.18 0 0 0-.18.18v1.89c0 .1.08.18.18.18m-2.96 0h2.11a.19.19 0 0 0 .19-.18V6.29a.18.18 0 0 0-.19-.18H5.14a.19.19 0 0 0-.19.18v1.89c0 .1.08.18.19.18m5.89 2.72h2.12a.19.19 0 0 0 .18-.19V9.01a.19.19 0 0 0-.18-.19h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m-2.93 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H8.1a.18.18 0 0 0-.18.19v1.89c0 .1.08.19.18.19m-2.96 0h2.11a.18.18 0 0 0 .19-.19V9.01a.18.18 0 0 0-.18-.19H5.14a.19.19 0 0 0-.19.19v1.89c0 .1.08.19.19.19m-2.92 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H2.22a.18.18 0 0 0-.19.19v1.89c0 .1.08.19.19.19m21.54-1.19c-.06-.05-.67-.51-1.95-.51-.34 0-.68.03-1.01.09a3.77 3.77 0 0 0-1.72-2.57l-.34-.2-.23.33a4.6 4.6 0 0 0-.6 1.43c-.24.93-.1 1.8.36 2.55-.56.31-1.45.38-1.63.39H.75a.75.75 0 0 0-.75.75 11.38 11.38 0 0 0 .7 4.06 6.03 6.03 0 0 0 2.4 3.12c1.18.73 3.1 1.14 5.28 1.14.98 0 1.96-.09 2.93-.27a12.1 12.1 0 0 0 3.82-1.39 10.5 10.5 0 0 0 2.6-2.13c1.25-1.42 2-3 2.55-4.4h.22c1.37 0 2.21-.55 2.68-1.01.31-.3.55-.65.71-1.05l.1-.29Z" /></svg
        >
        <span class="{TRIM} {KEY_LABEL}">Self-host</span>
      </a>
      <p class="absolute left-1/2 m-0 flex -translate-x-1/2 items-center gap-3 {NOTE} {running ? NOTE_COMES : NOTE_GOES}" data-testid="demo-note" data-running={running}>
        <span class="relative size-2 flex-none" aria-hidden="true">
          <span class="absolute inset-0 rounded-full bg-lime opacity-75 motion-safe:animate-ping"></span>
          <span class="absolute inset-0 rounded-full bg-lime shadow-[0_0_10px_rgba(161,255,89,0.8)]"></span>
        </span>
        <span class="whitespace-nowrap text-ink {TRIM} {KEY_LABEL}">Simulated demo</span>
      </p>
      <a class="{KEY} {running ? KEYS_GO : KEYS_COME}" href={release?.url ?? RELEASES} data-testid="release" data-release={release ? 'shown' : 'hidden'}>
        {#if release}
          <span class="text-ink {TRIM} {KEY_LABEL}" data-testid="release-tag">{release.tag}</span>
        {:else}
          <span class="{TRIM} {KEY_LABEL}">Releases</span>
        {/if}
      </a>
    </div>
  </header>
  <iframe class="block min-h-0 w-full flex-auto border-0 bg-ground" title="Boomerang demo" src="/demo/" bind:this={frame}></iframe>
</div>
