<!--
  The run's instruments: a chart per direction, which is also the run's
  progress, then the stats row. The stage draws the charts and fills the
  stats.

  The two charts are equal halves, since each direction runs equally long,
  each drawing left to right while its direction runs. On the phone,
  labels and figures are trimmed to their capitals and baseline, so each
  gap is the one the eye sees, ink to ink.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { formatBytes, formatMs, type Formatted } from '../engine';
  import { THROWS } from '../run/timing';
  import { clamp } from '../scene/math';
  import { Chart } from './chart';
  import { KEY_LABEL, UNIT } from './classes';
  import { onFrame } from './stage';
  import { ui } from './state.svelte';

  const DIR_RGB = [
    [161, 255, 89],
    [255, 122, 48],
  ];
  const zero = () => ({ value: '', unit: '', lit: false });
  let stats = $state([zero(), zero(), zero()]);
  let progress = $state(0);
  let dirOn = $state([false, false]);
  let canvases: HTMLCanvasElement[] = $state([]);

  onMount(() => {
    const charts = canvases.map((c) => new Chart(c));
    let run: unknown = null;
    const off = onFrame(({ t, e, data: d }) => {
      if (!d || ui.screen === 'idle' || (ui.screen === 'exit' && e >= 0.25)) return;
      if (d !== run) {
        run = d;
        stats = [zero(), zero(), zero()];
        for (const c of charts) c.reset();
      }
      // A failed run's charts stop where it failed, rather than stretching on.
      const tc = Math.min(t, d.failedAt);
      progress = Math.round((100 * d.dirs.reduce((sum, dir) => sum + clamp((Math.min(tc, dir.t1) - dir.t0) / dir.length(tc), 0, 1), 0)) / 2);
      // Every figure not measured yet is a greyed zero in its reading's own type and width.
      const landed = d.throws.length >= THROWS ? d.catchAt(THROWS - 1) : d.result ? -Infinity : Infinity;
      const ready = t >= landed && d.idleMs !== undefined && d.jitterMs !== undefined;
      const stat = (i: number, f: Formatted, lit: boolean) => Object.assign(stats[i], { value: f.value, unit: f.unit, lit });
      stat(0, formatMs(ready ? d.idleMs! : 0), ready);
      stat(1, formatMs(ready ? d.jitterMs! : 0), ready);
      stat(2, formatBytes(t >= d.P.dl ? d.bytes : 0), t >= d.P.dl);
      d.dirs.forEach((dir, i) => {
        dirOn[i] = t >= dir.t0;
        charts[i].draw(dir, tc, DIR_RGB[i]);
      });
    });
    const resize = () => charts.forEach((c) => c.reset());
    addEventListener('resize', resize);
    return () => {
      off();
      removeEventListener('resize', resize);
    };
  });

  const CHART = 'relative min-w-0 wide:mt-3 wide:w-full wide:self-center';
  /** Each chart's name is a label like every other, lit in its direction's colour as its phase begins. */
  const DIR = `${KEY_LABEL} narrow:[text-box:trim-both_cap_alphabetic]`;
  const CANVAS = 'mt-1 block h-11 w-full wide:mt-3 wide:h-30';
  const DT = `${KEY_LABEL} whitespace-nowrap text-ink-3 narrow:[text-box:trim-both_cap_alphabetic]`;
  /** Values condensed and bright, each only as wide as its digits. */
  const DD = `mt-0.5 h-[26px] leading-[26px] whitespace-nowrap narrow:mt-2 narrow:h-[1cap] narrow:font-stretch-62% narrow:text-[24px] narrow:leading-none narrow:font-extrabold narrow:[text-box:trim-both_cap_alphabetic] [&_b]:font-stretch-62% [&_b]:text-[24px] [&_b]:font-extrabold`;
  const STATS = [
    ['Ping', 'result-latency-idle'],
    ['Jitter', 'result-jitter'],
    ['Data used', 'result-bytes'],
  ];
</script>

<!-- The scene holds back its light behind the instruments while they show:
     round them all at once on a phone, round each on a wide screen. -->
<div class="relative mt-3 flex flex-none flex-col items-center wide:contents">
<div class="dim dim-run -inset-3 wide:hidden"></div>
<div
  class="grid w-(--col) flex-none grid-cols-[1fr_1fr] gap-x-4 wide:contents"
  id="charts"
  role="progressbar"
  aria-label="Test progress"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={progress}
>
  {#each ['Download', 'Upload'] as name, i (name)}
    <figure class="{CHART} {i ? 'wide:[grid-area:up]' : 'wide:[grid-area:down]'}" id={i ? 'chartU' : 'chartD'} data-on={dirOn[i] ? '' : undefined}>
      <figcaption class={DIR}>{name}</figcaption>
      <canvas class={CANVAS} bind:this={canvases[i]}></canvas>
      <div class="dim dim-run -inset-4 narrow:hidden"></div>
    </figure>
  {/each}
</div>
<!-- One rule for the row: three equal columns over the straight part of the
     key below it (inset by the key's round ends), each label and its value
     on its column's left edge. -->
<dl class="relative mt-6 box-border grid w-(--col) flex-none grid-cols-[repeat(3,1fr)] gap-x-4 px-6 wide:mt-5 wide:[grid-area:stats]" id="stats">
  {#each STATS as [label, id], i (id)}
    <div class="min-w-0">
      <dt class={DT}>{label}</dt>
      <dd class={DD} data-testid={id} data-lit={stats[i].lit ? '' : undefined}>
        <b>{stats[i].value}</b><span class={UNIT}>{stats[i].unit}</span>
      </dd>
    </div>
  {/each}
  <div class="dim dim-run -inset-3 narrow:hidden"></div>
</dl>
</div>
