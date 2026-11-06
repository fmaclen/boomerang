<!--
  The top bar: the GitHub key on the left, the logo in the middle (it goes
  home), and the History key on the right.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import Logo from './Logo.svelte';

  const KEY = 'glass row-1 grid size-10 place-items-center text-ink-2 fine:hover:text-ink';
  const ICON = 'relative block size-4.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]';

  // A resting cursor throws the logo's arcs, once per entry; a throw always
  // finishes before another can start. A touch never throws it, and nor does
  // reduced motion.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let throwing = $state(false);
  const hover = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && !still.matches) throwing = true;
  };
</script>

<header class="top grid h-10 w-(--col) flex-none grid-cols-[40px_1fr_40px] items-center wide:w-full wide:[grid-area:top]">
  <!-- In the landing page's demo the app sits in a frame, and GitHub opens in the page around it. -->
  <a
    class="{KEY} col-1"
    id="gh"
    href="https://github.com/fmaclen/boomerang"
    target={import.meta.env.MODE === 'demo' ? '_top' : undefined}
    aria-label="Boomerang on GitHub"
  >
    <svg class={ICON} viewBox="0 0 16 16" aria-hidden="true"
      ><path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      /></svg
    >
  </a>
  <!-- The logo's box is centred, and its box centres the x-height. It is a
       link home, so the browser's own ways to open it elsewhere work. -->
  <a
    class="col-2 row-1 block justify-self-center rounded-lg"
    id="logo"
    href={resolve('/')}
    aria-label="Boomerang"
    onpointerenter={hover}><Logo {throwing} onlanded={() => (throwing = false)} /></a
  >
  <!-- The History key is a link to /history, like the logo is home. While
       History is open it is lit a shade brighter, the way New test is, and is
       the current page. While it can't open (a run, New test's way home) it is
       a disabled link: no href, so nothing follows, focuses or opens it, and
       role and aria-disabled so it is still heard as a link, dimmed. -->
  <a
    class="{KEY} col-3 [transition:transform_160ms_var(--ease-out),background-color_160ms_ease,color_200ms_ease] after:pointer-events-none after:absolute after:inset-0 after:-z-1 after:rounded-[inherit] after:bg-[rgba(241,247,235,0.13)] after:opacity-0 after:[transition:opacity_240ms_var(--ease-out)] after:content-[''] aria-disabled:pointer-events-none aria-disabled:text-ink-3 [&.on]:text-ink [&.on]:after:opacity-100"
    id="menu"
    href="/history"
    aria-label="History"
    data-testid="history-toggle"
  >
    <!-- Heroicons' solid clock, its box cropped to the disc, so it is a disc
         the size of the GitHub mark's beside it. -->
    <svg class={ICON} viewBox="2.25 2.25 19.5 19.5" aria-hidden="true" fill="currentColor"
      ><path
        fill-rule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z"
        clip-rule="evenodd"
      /></svg
    >
  </a>
</header>
