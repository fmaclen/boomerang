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
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import { cameras } from '../lib/scene';
  import { fitReach } from '../lib/scene/ping';
  import DemoBar from '../lib/ui/DemoBar.svelte';
  import Dock from '../lib/ui/Dock.svelte';
  import Eye from '../lib/ui/Eye.svelte';
  import Instruments from '../lib/ui/Instruments.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import * as nav from '../lib/ui/nav';
  import { Stage, app } from '../lib/ui/stage';
  import { is, ui } from '../lib/ui/state.svelte';

  let { children }: { children: Snippet } = $props();
  const DEMO = import.meta.env.MODE === 'demo';
  const on = (b: boolean) => (b ? '' : undefined);

  let root: HTMLElement;
  let canvas: HTMLCanvasElement;

  /**
   * Where the run's screen leaves room for the swarm, and the bands its
   * figures and a run's details take, in the app's box: the cameras and the
   * swarm's size follow, as variables the eye, Start and the details place
   * themselves by, and as the stage's cameras for the scene.
   */
  function measure(): void {
    const app0 = root.getBoundingClientRect();
    // Each part where it sits at rest, without its rise.
    const at = (id: string) => {
      const el = document.getElementById(id)!;
      const r = el.getBoundingClientRect();
      const dy = parseFloat(getComputedStyle(el).translate.split(' ')[1] ?? '0') || 0;
      return new DOMRect(r.left - app0.left, r.top - app0.top - dy, r.width, r.height);
    };
    const wide = matchMedia('(min-width: 900px) and (min-height: 560px)').matches;
    const [stage, dock, top, charts, chartD, chartU, stats] = ['stage', 'dock', 'top', 'charts', 'chartD', 'chartU', 'stats'].map(at);
    const { S, run, idle } = cameras(innerWidth, stage, dock.top, wide);
    const band = wide ? top : charts;
    const vars: Record<string, string> = {
      '--s': `${S.toFixed(2)}px`,
      '--run-x': `${run.cx}px`,
      '--run-y': `${run.cy}px`,
      '--idle-x': `${idle.cx}px`,
      '--idle-y': `${idle.cy}px`,
      '--idle-z': `${idle.zoom}`,
      '--band-x': `${band.left}px`,
      '--band-w': `${band.width}px`,
      '--stats-top': `${stats.top}px`,
      '--dock-bottom': `${dock.bottom}px`,
    };
    for (const k in vars) root.style.setProperty(k, vars[k]);
    // Each ping throw loops out only as far as the window and the interface leave room for.
    const pad = (r: DOMRect, p: number) => [r.left - p, r.top - p, r.right + p, r.bottom + p];
    const union = (a: DOMRect, b: DOMRect) => new DOMRect(a.left, a.top, Math.max(a.right, b.right) - a.left, Math.max(a.bottom, b.bottom) - a.top);
    const parts = wide ? [pad(chartD, 16), pad(chartU, 16), pad(stats, 12)] : [pad(union(charts, stats), 12)];
    fitReach(run, S, [0, -app0.top, innerWidth, innerHeight - app0.top], [pad(top, 10), pad(dock, 12), ...parts]);
    app.stage?.place(S, { run, idle }, app0.top);
  }

  onMount(() => {
    const stage = (app.stage = new Stage(root, canvas));
    stage.onSaved = nav.saved;
    measure();
    nav.show(page.route.id, page.params.id);
    // A press sweeps the light once round the rim of the key it lands on.
    const kick = (ev: PointerEvent) => {
      const key = (ev.target as Element).closest?.('[data-kick]');
      const rim = key && (key.getAttribute('data-kick') ? document.getElementById(key.getAttribute('data-kick')!) : (key as HTMLElement));
      if (!rim || stage.reduced) return;
      rim.classList.remove('kick');
      void rim.offsetWidth;
      rim.classList.add('kick');
    };
    const kicked = (ev: AnimationEvent) => ev.animationName === 'rim-sweep' && (ev.target as HTMLElement).classList.remove('kick');
    addEventListener('resize', measure);
    document.addEventListener('pointerdown', kick);
    document.addEventListener('animationend', kicked);
    return () => {
      stage.destroy();
      removeEventListener('resize', measure);
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('animationend', kicked);
    };
  });

  // The page follows the address, whichever way it changed: a link, the
  // back and forward buttons, or a reload. Only the address: what showing it
  // reads of the page's state must not rerun it.
  $effect(() => {
    const route = page.route.id;
    const id = page.params.id;
    untrack(() => app.stage && nav.show(route, id));
  });

  // What leaves with a page (Start, the list, a run's details) goes on the
  // old curves, as a snapshot (see the view transitions in app.css); what
  // stays moves itself. A transition cut short by the next navigation is fine.
  onNavigate((navigation) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || nav.quiet) return;
    return new Promise((done) => {
      const vt = document.startViewTransition(async () => {
        done();
        await navigation.complete.catch(() => {});
      });
      vt.finished.catch(() => {});
      vt.ready.catch(() => {});
      vt.updateCallbackDone.catch(() => {});
    });
  });
</script>

<svelte:window onkeydown={(ev) => ev.key === 'Escape' && nav.escape()} />

<canvas class="pointer-events-none fixed inset-0 -z-2 block size-full" bind:this={canvas}></canvas>
{#if DEMO}<DemoBar />{/if}
<div
  class="relative z-0 min-h-[calc(100dvh-var(--bar,0px))]"
  id="app"
  bind:this={root}
  style:--pace={ui.pace}
  data-screen={ui.screen}
  data-lit={on(is.lit)}
  data-formed={on(is.formed)}
  data-open={on(is.open)}
  data-reopened={on(is.reopened)}
  data-back={on(is.back)}
  data-list={on(ui.view === 'list')}
>
  <!-- The shade History casts over the whole scene; each part of the interface casts its own (.dim), so the keys and figures always read. -->
  <div class="fixed inset-0 -z-1 bg-ground" id="histDim"></div>
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
