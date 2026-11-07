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
  import { KEY_LABEL, UNIT } from './classes';
  import { ui } from './state.svelte';

  const CHART = 'min-w-0 wide:mt-3 wide:w-full wide:self-center';
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

<div
  class="mt-3 grid w-(--col) flex-none grid-cols-[1fr_1fr] gap-x-4 wide:contents"
  id="charts"
  role="progressbar"
  aria-label="Test progress"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={ui.progress}
>
  {#each ['Download', 'Upload'] as name, i (name)}
    <figure class="{CHART} {i ? 'wide:[grid-area:up]' : 'wide:[grid-area:down]'}" id={i ? 'chartU' : 'chartD'} data-on={ui.dirOn[i] ? '' : undefined}>
      <figcaption class={DIR}>{name}</figcaption>
      <canvas class={CANVAS}></canvas>
    </figure>
  {/each}
</div>
<!-- One rule for the row: three equal columns over the straight part of the
     key below it (inset by the key's round ends), each label and its value
     on its column's left edge. -->
<dl class="mt-6 box-border grid w-(--col) flex-none grid-cols-[repeat(3,1fr)] gap-x-4 px-6 wide:mt-5 wide:[grid-area:stats]" id="stats">
  {#each STATS as [label, id], i (id)}
    <div class="min-w-0">
      <dt class={DT}>{label}</dt>
      <dd class={DD} data-testid={id} data-lit={ui.stats[i]?.lit ? '' : undefined}>
        <b>{ui.stats[i]?.value}</b><span class={UNIT}>{ui.stats[i]?.unit}</span>
      </dd>
    </div>
  {/each}
</dl>
