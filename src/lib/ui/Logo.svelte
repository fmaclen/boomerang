<!--
  The logo, one inline SVG: the word, then each arc as two echoes and the arc
  itself. Thrown, each arc flies the way it points, leaving its echoes behind
  smaller and fainter, and flies home through them, the lime first and the
  orange 90 ms later (the keyframes are in app.css). Transforms and opacity
  only, so nothing round it moves.
-->
<script lang="ts">
  import { THROW, WORD_BOX, over, under } from './logo';
  import { ARC, WORD } from './outlines';

  let { throwing, onlanded }: { throwing: boolean; onlanded: () => void } = $props();

  const ARCS = [
    { at: over(), fill: 'fill-orange', delay: 90, last: true },
    { at: under(), fill: 'fill-lime', delay: 0, last: false },
  ];
  const PART = 'origin-center transform-fill';
</script>

<svg
  class="group/logo block h-7 w-auto overflow-visible wide:h-auto"
  viewBox={WORD_BOX.viewBox}
  width={WORD_BOX.width}
  height={WORD_BOX.height}
  aria-hidden="true"
  data-throw={throwing ? '' : undefined}
>
  <path class="fill-ink" d={WORD} />
  {#each ARCS as a (a.at)}
    <g transform={a.at} style:--d={THROW} style:--delay="{a.delay}ms">
      <g class="{PART} opacity-0 group-data-throw/logo:animate-echo-2"><path class={a.fill} d={ARC} /></g>
      <g class="{PART} opacity-0 group-data-throw/logo:animate-echo-1"><path class={a.fill} d={ARC} /></g>
      <g class="{PART} group-data-throw/logo:animate-lead" onanimationend={a.last ? onlanded : undefined}><path class={a.fill} d={ARC} /></g>
    </g>
  {/each}
</svg>
