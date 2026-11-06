<!--
  A reopened run's details, in place of the stats row and the bottom key:
  when it ran, what it measured, then how and on what, in the History row's
  order and all in one style.

  One key-value style at one size, the table's. A phone sets them on an even
  grid of three columns, its rows further apart than the columns; a wide
  screen in one row across the top bar's width. Labels and values are
  trimmed to their capitals and baseline, so the gaps between them are the
  gaps the eye sees. A value too long for its column ends in an ellipsis;
  the clip reaches past the trim so descenders and ascenders show.
-->
<script lang="ts">
  import { LABEL, UNIT, VALUE } from './classes';
  import OsMark from './OsMark.svelte';
  import { ui } from './state.svelte';
</script>

<dl
  class="pointer-events-none invisible fixed m-0 grid grid-cols-3 content-start gap-x-3 gap-y-6 opacity-0 [--fs:16px] [--lab:12px] wide:grid-cols-[repeat(7,auto)] wide:justify-between wide:[--fs:21px] wide:[--lab:14px]"
  id="where"
  aria-live="polite"
  data-testid="history-details"
>
  {#each ui.details as d (d.label)}
    <div class="min-w-0">
      <dt class="{LABEL} whitespace-nowrap text-ink-3 [text-box:trim-both_cap_alphabetic]">{d.label}</dt>
      <dd class="{VALUE} mt-[calc(8px-0.35em)] mb-[-0.35em] overflow-hidden py-[0.35em] text-ellipsis [text-box:trim-both_cap_alphabetic]">
        {#if d.value !== undefined}<b class="[font-weight:inherit]">{d.value}</b><span class={UNIT}>{d.unit}</span>{:else}{#if d.os && d.mark}<OsMark
              os={d.os}
              mark={d.mark}
            />{/if}{d.text}{/if}
      </dd>
    </div>
  {/each}
</dl>
