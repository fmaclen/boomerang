<!--
  Every page: the scene as a fixed background (the only thing the pointer
  passes through), the shade the interface casts over it, the top bar, and
  the run's screen, which home and a run's own page share so a run keeps
  its motion when its address changes. Each route renders its own content
  into it: Start at home, the list at /history, a run's details at
  /history/[id]. The data attributes are the state the stylesheet's
  choreography keys on (see app.css).
-->
<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import '../app.css';
  import DemoBar from '../lib/ui/DemoBar.svelte';
  import Dock from '../lib/ui/Dock.svelte';
  import Eye from '../lib/ui/Eye.svelte';
  import Instruments from '../lib/ui/Instruments.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import { Stage, app } from '../lib/ui/stage';
  import { ui } from '../lib/ui/state.svelte';

  let { children }: { children: Snippet } = $props();
  const DEMO = import.meta.env.MODE === 'demo';
  const on = (b: boolean) => (b ? '' : undefined);

  let root: HTMLElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    app.stage = new Stage(root, canvas);
    return () => app.stage?.destroy();
  });

  // The page follows the address, whichever way it changed: a link, the
  // back and forward buttons, or a reload. Only the address: what the stage
  // reads of the page's state must not rerun it.
  $effect(() => {
    const id = page.route.id;
    const run = page.params.id;
    untrack(() => app.stage?.history.route(id, run));
  });

  // What leaves with a page (Start, the list, a run's details) goes on the
  // old curves, as a snapshot (see the view transitions in app.css); what
  // stays moves itself.
  onNavigate((nav) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || app.quiet) return;
    return new Promise((done) => {
      document.startViewTransition(async () => {
        done();
        await nav.complete;
      });
    });
  });

  const keydown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !ui.open) return;
    if (ui.ask) ui.ask = false;
    else void goto(ui.list ? resolve('/') : resolve('/history'));
  };
</script>

<svelte:window onkeydown={keydown} />

<canvas class="pointer-events-none fixed inset-0 -z-2 block size-full" bind:this={canvas}></canvas>
{#if DEMO}<DemoBar />{/if}
<div
  class="relative z-0 min-h-[calc(100dvh-var(--bar,0px))]"
  id="app"
  bind:this={root}
  style:--pace={ui.pace}
  data-screen={ui.screen}
  data-lit={on(ui.lit)}
  data-formed={on(ui.formed)}
  data-landed={on(ui.landed)}
  data-open={on(ui.open)}
  data-reopened={on(ui.reopened)}
  data-back={on(ui.back)}
  data-list={on(ui.list)}
  data-closing={on(ui.closing)}
>
  <!-- The shade History casts over the whole scene, and the interface over the scene behind it, so the keys and figures always read. -->
  <div class="fixed inset-0 -z-1 bg-ground" id="histDim"></div>
  {#each ['dimTop', 'dimDock', 'dimA', 'dimB', 'dimC'] as id (id)}<div class="dim" {id}></div>{/each}
  <TopBar />
  <main>
    <!-- The run's screen: one centred column on the phone; on a wide screen
         three, in one centred width however wide the window, with the scene
         full-bleed behind it. -->
    <div
      class="box-border flex h-[max(calc(100dvh-var(--bar,0px)-var(--head)),440px)] flex-col items-center px-8.5 pb-[calc(16px+env(safe-area-inset-bottom))] wide:grid wide:grid-cols-[1fr_minmax(0,560px)_1fr] wide:grid-rows-[1fr_auto_auto] wide:justify-items-center wide:gap-x-12 wide:px-(--px) wide:pb-7 wide:[grid-template-areas:'down_stage_up'_'._stats_.'_'._dock_.']"
      id="screen"
    >
      <div class="mt-1 min-h-0 w-full flex-auto wide:mt-3 wide:h-full wide:[grid-area:stage]" id="stage"></div>
      <Instruments />
      <Dock />
    </div>
    <Eye />
    {@render children()}
  </main>
</div>
