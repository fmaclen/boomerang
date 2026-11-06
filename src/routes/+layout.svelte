<!--
  The page: the scene behind everything, the eye at the swarm's centre, the
  top bar, the instruments and the bottom key, and History over them. The
  components are markup; ui/director.ts moves them every frame and wires
  every press. The routes under it are empty: History follows the address.
  Class names that are not utilities (top, chart, stats, dock, res-ul and
  the like) are the director's handles on the markup, not styles. The eye
  and the interface stay hidden until the director's first frame (it waits
  for the fonts), so a load never shows them unplaced: no Start at
  /history, no keys out of position.
-->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import Details from '../lib/ui/Details.svelte';
  import Dock from '../lib/ui/Dock.svelte';
  import Eye from '../lib/ui/Eye.svelte';
  import HistoryLayer from '../lib/ui/HistoryLayer.svelte';
  import Instruments from '../lib/ui/Instruments.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import { Director } from '../lib/ui/director';
  import { installIcons } from '../lib/ui/logo';

  let { children }: { children: Snippet } = $props();
  let canvas: HTMLCanvasElement;

  let director: Director | undefined;

  onMount(() => {
    installIcons();
    director = new Director(canvas);
    return () => director?.destroy();
  });

  // History follows the address: /history opens it, and the back and forward
  // buttons move it, whichever way the address changed.
  $effect(() => {
    const path = page.url.pathname;
    const state = page.state;
    director?.history.route(path, state);
  });
</script>

<canvas class="fixed inset-0 block size-full" bind:this={canvas}></canvas>
<Eye />
<!-- The interface: one centred column on the phone; on a wide screen three,
     in one centred width however wide the window, with the scene full-bleed
     behind it. Only its keys take the pointer, so the scene under it does. -->
<main
  class="pointer-events-none invisible fixed in-data-drawn:visible inset-0 box-border flex flex-col items-center px-8.5 pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(16px+env(safe-area-inset-bottom))] wide:grid wide:grid-cols-[1fr_minmax(0,560px)_1fr] wide:grid-rows-[auto_1fr_auto_auto] wide:justify-items-center wide:gap-x-12 wide:px-[max(96px,calc(50vw-var(--ui-max)/2))] wide:pt-6 wide:pb-7 wide:[grid-template-areas:'top_top_top'_'down_stage_up'_'._stats_.'_'._dock_.'] [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
>
  <TopBar />
  <div class="mt-1 min-h-0 w-full flex-auto wide:mt-3 wide:h-full wide:[grid-area:stage]" id="stage"></div>
  <Instruments />
  <Dock />
</main>
<HistoryLayer />
<Details />
{@render children()}
