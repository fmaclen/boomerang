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

  onMount(() => {
    installIcons();
    latestRelease().then((found) => (release = found));
  });

  /** A secondary key, as the app draws Stop and Clear history: hollow, an even hairline round the label. */
  const KEY = 'glass hollow inline-flex h-10 items-center gap-2 px-6 text-ink-2 transition-colors fine:hover:text-ink';
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
  <!-- The bar is the app's own chrome: the note in its key labels, lit and dim like Quick and Long, and the links as its secondary keys. -->
  <header class="flex h-16 flex-none items-center justify-between gap-4 border-b border-ink/8 px-4 sm:px-6">
    <p class="m-0 flex min-w-0 items-center gap-3" data-testid="demo-note">
      <span class="size-2 flex-none rounded-full bg-lime shadow-[0_0_10px_rgba(161,255,89,0.8)]" aria-hidden="true"></span>
      <!-- On a phone it stacks on two lines, to leave the keys their room. -->
      <span class="flex-none text-ink max-sm:w-min max-sm:leading-[1.5] {TRIM} {KEY_LABEL}">Simulated demo</span>
      <span class="ml-2 hidden truncate text-ink-3 md:block {TRIM} {KEY_LABEL}">Not a measurement of your connection</span>
    </p>
    <nav class="flex flex-none items-center gap-2" aria-label="Boomerang">
      <a class={KEY} href={GUIDE}><span class="{TRIM} {KEY_LABEL}">Self-host</span></a>
      <!-- Until a release exists, a phone has no room for the releases link beside Self-host. -->
      <a
        class="{KEY} {release ? '' : 'max-sm:hidden'}"
        href={release?.url ?? RELEASES}
        data-testid="release"
        data-release={release ? 'shown' : 'hidden'}
      >
        {#if release}
          <span class="text-ink {TRIM} {KEY_LABEL}" data-testid="release-tag">{release.tag}</span>
        {:else}
          <span class="{TRIM} {KEY_LABEL}">Releases</span>
        {/if}
      </a>
    </nav>
  </header>
  <iframe class="block min-h-0 w-full flex-auto border-0 bg-ground" title="Boomerang demo" src="/demo/"></iframe>
</div>
