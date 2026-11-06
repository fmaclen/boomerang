<!--
  The bottom key, in one slot: the choice of Quick or Long in idle, which
  opens out into Stop during a run and lights into New test after it.

  Back to front: the track and the label on it, the key, the thumb, then
  the chosen label and the key's own. The key opens out over the track's
  label, which is printed on the track and leaves with it. Each label is
  trimmed to its capitals and centred on its own box, so the button's line
  box and Archivo's tall ascent never push it off the pill's middle.
-->
<script lang="ts">
  import { KEY_LABEL } from './classes';
  import { ui } from './state.svelte';

  const modes = [
    { mode: 'adaptive', label: 'Quick' },
    { mode: 'fixed', label: 'Long' },
  ] as const;

  /** A label gives a little under a press, with its key. */
  const PRESSED =
    'inline-block [transition:transform_160ms_var(--ease-out)] group-active:[transform:scale(0.97)] motion-reduce:group-active:[transform:none]';
</script>

<div
  class="dock group/dock relative mt-6 h-12 w-(--col) flex-none wide:[grid-area:dock]"
  id="dock"
  data-screen="idle"
  data-mode={ui.mode === 'fixed' ? '1' : '0'}
>
  <div
    class="track glass absolute inset-0 z-0 bg-[rgba(6,10,9,0.46)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6),inset_0_-1px_0_rgba(255,255,255,0.05)] before:opacity-55"
  ></div>
  <div
    class="glass absolute top-1 right-auto bottom-1 left-1 z-3 w-[calc(50%-4px)] bg-[rgba(241,247,235,0.1)] shadow-[0_6px_12px_-6px_rgba(0,0,0,0.8),inset_0_-8px_12px_-10px_rgba(0,0,0,0.6),inset_0_10px_14px_-12px_rgba(255,255,255,0.14)] [transition:translate_240ms_var(--ease-out),transform_160ms_var(--ease-out)] group-data-[mode='1']/dock:translate-x-full motion-reduce:[transition:none]"
    id="thumb"
  ></div>
  <div class="dkey glass absolute inset-0 z-2" id="dkey">
    <div class="absolute inset-0 rounded-[inherit] bg-[rgba(241,247,235,0.13)] opacity-0" id="lit"></div>
  </div>
  <div class="modes absolute inset-0 grid grid-cols-[1fr_1fr]" role="radiogroup" aria-label="Test length">
    {#each modes as m, i (m.mode)}
      <button
        class="group relative z-1 grid place-items-center rounded-full text-ink-3 transition-[color] duration-160 ease-[ease] aria-checked:z-4 aria-checked:text-ink fine:hover:aria-[checked=false]:text-ink-2"
        type="button"
        role="radio"
        aria-checked={ui.mode === m.mode}
        tabindex={ui.mode === m.mode ? 0 : -1}
        data-mode={i}
        data-testid="mode-{m.mode}"
        ><span class="{KEY_LABEL} {PRESSED} [text-box:trim-both_cap_alphabetic]">{m.label}</span></button
      >
    {/each}
  </div>
  <button class="action group absolute inset-0 z-4 grid place-items-center rounded-full" id="action" type="button" inert data-testid="stop"
    ><span
      class="act-stop {KEY_LABEL} col-1 row-1 inline-block text-ink-2 [transition:transform_160ms_var(--ease-out),color_160ms_ease] group-active:[transform:scale(0.97)] motion-reduce:group-active:[transform:none] fine:group-hover:text-ink"
      >Stop</span
    ><span class="act-new {KEY_LABEL} {PRESSED} col-1 row-1">New test</span></button
  >
</div>
