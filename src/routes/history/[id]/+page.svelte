<!--
  One run: its result on the run's screen, and its details, in place of the
  stats row and the bottom key: when it ran, what it measured, then how and
  on what, in the History row's order and all in one style. A run that has
  just finished has this address too, and keeps its own stats and key.

  One key-value style at one size, the table's. A phone sets them on an even
  grid of three columns, its rows further apart than the columns; a wide
  screen in one row across the top bar's width. Values are trimmed to their
  capitals and baseline, so the gaps between them are the gaps the eye sees.
  A value too long for its column ends in an ellipsis; the clip reaches past
  the trim so descenders and ascenders show.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { KEY_LABEL, UNIT, VALUE } from '../../../lib/ui/classes';
  import OsMark from '../../../lib/ui/OsMark.svelte';
  import { app } from '../../../lib/ui/stage';
  import { ui } from '../../../lib/ui/state.svelte';

  onMount(() => app.stage?.placeWhere());
</script>

<svelte:head><title>{ui.reopened ? `${ui.details[0]?.text ?? 'A test'} · Boomerang` : 'Boomerang'}</title></svelte:head>

<dl
  class="absolute m-0 grid grid-cols-3 content-start gap-x-3 gap-y-6 [--fs:16px] [--lab:12px] wide:grid-cols-[repeat(7,auto)] wide:justify-between wide:[--fs:21px] wide:[--lab:14px]"
  id="where"
  aria-live="polite"
  data-testid="history-details"
>
  {#each ui.details as d (d.label)}
    <div class="min-w-0">
      <dt class="{KEY_LABEL} whitespace-nowrap text-ink-3 [text-box:trim-both_cap_alphabetic]">{d.label}</dt>
      <dd class="{VALUE} mt-[calc(8px-0.35em)] mb-[-0.35em] overflow-hidden py-[0.35em] text-ellipsis [text-box:trim-both_cap_alphabetic]">
        {#if d.value !== undefined}<b class="[font-weight:inherit]">{d.value}</b><span class={UNIT}>{d.unit}</span>{:else}{#if d.os && d.mark}<OsMark
              os={d.os}
              mark={d.mark}
            />{/if}{d.text}{/if}
      </dd>
    </div>
  {/each}
</dl>
{#if ui.missing}
  <!-- An address for a run History doesn't have: said where Start would sit. -->
  <div class="absolute inset-x-0 top-(--idle-y) grid -translate-y-1/2 justify-items-center gap-y-2.5 text-center" data-testid="history-missing">
    <p class="{KEY_LABEL} text-ink-3">Not in History</p>
    <a class="{VALUE} underline decoration-ink-3 underline-offset-4" href={resolve('/history')}>See every test</a>
  </div>
{/if}
