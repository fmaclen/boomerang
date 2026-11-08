<!--
  The public demo's bar, over the app: a key to self-host on the left and
  the latest release on the right, read from GitHub. While a test runs both
  give way to a note, floated over the middle, saying the readings are
  simulated. Laid out like the top bar under it and as wide.
-->
<script lang="ts">
  import { KEY_LABEL } from './classes';
  import { ui } from './state.svelte';

  const GUIDE = 'https://github.com/fmaclen/boomerang/blob/master/docs/self-hosting.md';
  const RELEASES = 'https://github.com/fmaclen/boomerang/releases';
  // `releases/latest` skips prereleases, so the bar always names the newest stable one.
  const RELEASE_API = 'https://api.github.com/repos/fmaclen/boomerang/releases/latest';

  // Until GitHub names a release (and whenever it can't), the key links to the releases page.
  let release = $state<{ tag: string; url: string }>();
  fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      if (typeof r?.tag_name === 'string' && typeof r?.html_url === 'string') release = { tag: r.tag_name, url: r.html_url };
    })
    .catch(() => {});

  const running = $derived(ui.screen === 'run' && ui.view === 'start');
  /**
   * The keys and the note hand over rather than cross, so the bar never
   * shows both: at Start the keys go, then the note comes, done in a second
   * as the app's camera settles; at New test the note goes, then the keys
   * come back, about as quick as the app's way home.
   */
  const FADE = '[transition:color_160ms_ease,opacity_var(--fade)_cubic-bezier(0.77,0,0.175,1)_var(--wait),visibility_var(--fade)_var(--wait)]';
  const KEY = `inline-flex h-8 items-center gap-2 whitespace-nowrap text-ink-2 fine:hover:text-ink ${FADE}`;
  const KEYS_GO = 'invisible opacity-0 [--fade:400ms] [--wait:100ms]';
  const KEYS_COME = '[--fade:300ms] [--wait:250ms]';
  const NOTE_COMES = '[--fade:500ms] [--wait:500ms]';
  const NOTE_GOES = 'invisible opacity-0 [--fade:250ms] [--wait:0ms]';
  /** Trims a label to its capitals, so it sits on the middle of its key the way the app's labels do. */
  const TRIM = '[text-box:trim-both_cap_alphabetic]';
</script>

<!-- Over the app's layer, whose full-screen History dim would otherwise take the keys' clicks. -->
<header class="relative z-1 flex h-(--bar) items-center border-b border-ink/8 bg-ground">
  <div class="relative mx-auto flex w-(--col) items-center justify-between wide:w-full wide:px-(--px)">
    <a class="{KEY} {running ? KEYS_GO : KEYS_COME}" href={GUIDE} aria-label="Self-host with Docker">
      <svg class="size-4 flex-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
        ><path d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.19h-2.12a.18.18 0 0 0-.18.18v1.9c0 .1.08.18.18.18m-2.95-5.43h2.12a.19.19 0 0 0 .18-.19V3.57a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m0 2.71h2.12a.19.19 0 0 0 .18-.18V6.29a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.89c0 .1.09.18.19.18m-2.93 0h2.12a.19.19 0 0 0 .18-.18V6.29a.18.18 0 0 0-.18-.18H8.1a.18.18 0 0 0-.18.18v1.89c0 .1.08.18.18.18m-2.96 0h2.11a.19.19 0 0 0 .19-.18V6.29a.18.18 0 0 0-.19-.18H5.14a.19.19 0 0 0-.19.18v1.89c0 .1.08.18.19.18m5.89 2.72h2.12a.19.19 0 0 0 .18-.19V9.01a.19.19 0 0 0-.18-.19h-2.12a.18.18 0 0 0-.19.18v1.9c0 .1.09.18.19.18m-2.93 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H8.1a.18.18 0 0 0-.18.19v1.89c0 .1.08.19.18.19m-2.96 0h2.11a.18.18 0 0 0 .19-.19V9.01a.18.18 0 0 0-.18-.19H5.14a.19.19 0 0 0-.19.19v1.89c0 .1.08.19.19.19m-2.92 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.19H2.22a.18.18 0 0 0-.19.19v1.89c0 .1.08.19.19.19m21.54-1.19c-.06-.05-.67-.51-1.95-.51-.34 0-.68.03-1.01.09a3.77 3.77 0 0 0-1.72-2.57l-.34-.2-.23.33a4.6 4.6 0 0 0-.6 1.43c-.24.93-.1 1.8.36 2.55-.56.31-1.45.38-1.63.39H.75a.75.75 0 0 0-.75.75 11.38 11.38 0 0 0 .7 4.06 6.03 6.03 0 0 0 2.4 3.12c1.18.73 3.1 1.14 5.28 1.14.98 0 1.96-.09 2.93-.27a12.1 12.1 0 0 0 3.82-1.39 10.5 10.5 0 0 0 2.6-2.13c1.25-1.42 2-3 2.55-4.4h.22c1.37 0 2.21-.55 2.68-1.01.31-.3.55-.65.71-1.05l.1-.29Z" /></svg
      >
      <span class="{TRIM} {KEY_LABEL}">Self-host</span>
    </a>
    <p class="absolute left-1/2 m-0 flex -translate-x-1/2 items-center gap-3 {FADE} {running ? NOTE_COMES : NOTE_GOES}" data-testid="demo-note">
      <span class="relative size-2 flex-none" aria-hidden="true">
        <span class="absolute inset-0 rounded-full bg-lime opacity-75 motion-safe:animate-ping"></span>
        <span class="absolute inset-0 rounded-full bg-lime shadow-[0_0_10px_rgba(161,255,89,0.8)]"></span>
      </span>
      <span class="whitespace-nowrap text-ink {TRIM} {KEY_LABEL}">Simulated demo</span>
    </p>
    <a class="{KEY} {running ? KEYS_GO : KEYS_COME}" href={release?.url ?? RELEASES} data-testid="release">
      {#if release}<span class="text-ink {TRIM} {KEY_LABEL}">{release.tag}</span>{:else}<span class="{TRIM} {KEY_LABEL}">Releases</span>{/if}
    </a>
  </div>
</header>
