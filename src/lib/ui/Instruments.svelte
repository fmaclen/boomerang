<!--
  The run's instruments: a chart per direction, which is also the run's
  progress, then the stats row. The director draws the charts and writes
  the stats.

  The two charts are equal halves, since each direction runs equally long,
  each drawing left to right while its direction runs. On the phone,
  labels and figures are trimmed to their capitals and baseline, so each
  gap is the one the eye sees, ink to ink.
-->
<script lang="ts">
  import { LABEL } from './classes';

  const CHART = 'chart min-w-0 wide:mt-3 wide:w-full wide:self-center';
  /** Each chart's name is a label like the stats'. */
  const DIR = `${LABEL} text-ink-3 narrow:leading-none narrow:[text-box:trim-both_cap_alphabetic]`;
  const CANVAS = 'mt-1 block h-11 w-full wide:mt-3 wide:h-30';
  const DT = `${LABEL} text-ink-3 narrow:[text-box:trim-both_cap_alphabetic]`;
  /** Values condensed and bright, each only as wide as its digits; the director writes them. */
  const DD = `mt-0.5 h-[26px] leading-[26px] whitespace-nowrap narrow:mt-2 narrow:h-[1cap] narrow:font-stretch-62% narrow:text-[24px] narrow:leading-none narrow:font-extrabold narrow:[text-box:trim-both_cap_alphabetic] [&_b]:font-stretch-62% [&_b]:text-[24px] [&_b]:font-extrabold [&_b]:text-ink`;
</script>

<div
  class="charts mt-3 grid w-(--col) flex-none grid-cols-[1fr_1fr] gap-x-4 wide:contents"
  id="charts"
  role="progressbar"
  aria-label="Test progress"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="0"
>
  <figure class="{CHART} wide:[grid-area:down]">
    <figcaption class={DIR}>Download</figcaption>
    <canvas class={CANVAS}></canvas>
  </figure>
  <figure class="{CHART} wide:[grid-area:up]">
    <figcaption class={DIR}>Upload</figcaption>
    <canvas class={CANVAS}></canvas>
  </figure>
</div>
<!-- One rule for the row: three equal columns over the straight part of the
     key below it (inset by the key's round ends), each label and its value
     on its column's left edge. -->
<dl class="stats mt-6 box-border grid w-(--col) flex-none grid-cols-[repeat(3,1fr)] gap-x-4 px-6 wide:mt-5 wide:[grid-area:stats]">
  <div class="min-w-0"><dt class={DT}>Ping</dt><dd class={DD} data-testid="result-latency-idle"></dd></div>
  <div class="min-w-0"><dt class={DT}>Jitter</dt><dd class={DD} data-testid="result-jitter"></dd></div>
  <div class="min-w-0"><dt class={DT}>Data used</dt><dd class={DD} data-testid="result-bytes"></dd></div>
</dl>
