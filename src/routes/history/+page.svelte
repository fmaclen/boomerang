<!--
  History: every saved run, newest first, as one table over the dimmed
  scene, the page scrolling as it grows. A phone shows the same table
  smaller and scrolls it sideways. Under it, Load more and Clear history,
  which asks first.

  The list starts under the top bar, in its width. On a wide screen the
  table and its actions sit centred in the window while they fit; Load more
  pins their top there (`.pinned`, see history.ts) so the list grows
  downwards. On a phone the actions sit at the foot of the window, where the
  bottom key sits on the start screen, and the rows run above them. The
  section sets the type's sizes (--fs, --lab), so the empty state's line
  takes the table's.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatMs, formatRate, historyMode } from '../../lib/engine';
  import { KEY_LABEL, UNIT, VALUE } from '../../lib/ui/classes';
  import OsMark from '../../lib/ui/OsMark.svelte';
  import { deviceName, deviceWords, modeName, whenOf } from '../../lib/ui/rows';
  import { app } from '../../lib/ui/stage';
  import { ui } from '../../lib/ui/state.svelte';

  /** A column head, in the keys' lettering like every label. */
  const HEAD = `${KEY_LABEL} whitespace-nowrap`;
  /**
   * When, the first column, stays pinned at the left as the table scrolls
   * sideways, inset (--inset) so its heads and values start where a key's
   * label does on a wide screen, and on the page's 34px edge on a phone.
   * Whatever scrolls under it passes behind the page's own ground.
   */
  const WHEN =
    "sticky left-0 z-1 pl-(--inset) in-[.slid]:bg-ground in-[.slid]:after:pointer-events-none in-[.slid]:after:absolute in-[.slid]:after:inset-y-0 in-[.slid]:after:left-full in-[.slid]:after:w-(--gap) in-[.slid]:after:bg-ground in-[.slid]:after:content-['']";
  /** The last column ends the same inset in from the table's right edge, so each line's text sits evenly inside its hairlines and its wash. */
  const LAST = 'pr-(--inset)';
  /** The list's keys: Stop's height on a phone, where they stack. */
  const CK =
    'grid h-8 place-items-center px-4.5 narrow:h-12 [transition:opacity_200ms_var(--ease-out),visibility_0s,transform_160ms_var(--ease-out),background-color_160ms_ease,color_160ms_ease,--lift_200ms_ease]';
  const CK_LABEL = `${KEY_LABEL} [text-box:trim-both_cap_alphabetic]`;
  /** Clear history and the question that takes its place: whichever is not showing fades out of the way. */
  const ASKED =
    'group-[.asking]/clear:pointer-events-none group-[.asking]/clear:invisible group-[.asking]/clear:opacity-0 group-[.asking]/clear:[transition:opacity_200ms_var(--ease-out),visibility_0s_200ms,transform_160ms_var(--ease-out),background-color_160ms_ease,color_160ms_ease,--lift_200ms_ease]';
  const UNASKED =
    'group-[:not(.asking)]/clear:pointer-events-none group-[:not(.asking)]/clear:invisible group-[:not(.asking)]/clear:opacity-0 group-[:not(.asking)]/clear:[transition:opacity_200ms_var(--ease-out),visibility_0s_200ms,transform_160ms_var(--ease-out),background-color_160ms_ease,color_160ms_ease,--lift_200ms_ease]';

  const rows = $derived(
    ui.runs.map((r) => {
      const down = formatRate(r.download.mbps);
      const up = formatRate(r.upload.mbps);
      const ping = formatMs(r.latency.idleMs);
      const when = whenOf(r.startedAt, ui.now);
      const mode = modeName(r.mode);
      const said = [when, mode, deviceName(r.device)].filter(Boolean).join(', ');
      return {
        id: r.id,
        mode: r.mode,
        iso: new Date(r.startedAt).toISOString(),
        when,
        down,
        up,
        ping,
        modeName: mode,
        device: deviceWords(r.device),
        label: `${said}: download ${down.text}, upload ${up.text}, ping ${ping.text}`,
      };
    }),
  );

  // A phone's table fades out at its right edge only where it runs on past
  // it, and what scrolls sideways under When passes behind ground. Rows the
  // page scrolls up pass behind the heads, over ground, on a wide screen.
  let scroller: HTMLElement;
  let fade = $state({ r: 0, edge: 0, down: false, slid: false });
  const edges = () => {
    const s = scroller;
    fade = {
      r: Math.min(32, Math.max(0, s.scrollWidth - s.clientWidth - s.scrollLeft)),
      edge: s.scrollLeft + s.clientWidth,
      down: scrollY > 0,
      slid: s.scrollLeft > 0,
    };
  };
  $effect(() => {
    void rows.length;
    edges();
  });
  const history = () => app.stage?.history;
</script>

<svelte:head><title>History · Boomerang</title></svelte:head>
<svelte:window onresize={edges} onscroll={edges} />

<section
  class="relative z-1 flex min-h-[calc(100dvh-var(--bar,0px)-var(--head))] flex-col pt-5 pb-[calc(16px+env(safe-area-inset-bottom))] [--fs:16px] [--lab:12px] narrow:[--side:calc((100vw-var(--col))/2)] wide:justify-center wide:px-(--px) wide:pt-10 wide:pb-7 wide:[--fs:21px] wide:[--lab:14px] [&.pinned]:justify-start"
  class:down={fade.down}
  class:slid={fade.slid}
  id="hist"
  aria-label="History"
>
  <div class="relative flex-initial narrow:overflow-x-auto narrow:[scrollbar-width:none] narrow:[&::-webkit-scrollbar]:hidden" id="histScroll" bind:this={scroller} onscroll={edges}>
    <!-- One table on every screen: a row of heads and one line per run, in
         the order people scan for: when, the results, then how it ran. Each
         column is as wide as its widest value. A wide screen spreads the
         columns across the top bar's width, its text inset like a key's
         label at both ends; a phone runs the table edge to edge, smaller,
         with its text on the page's column at both ends. -->
    <div
      class="grid w-max min-w-full grid-cols-[repeat(6,max-content)] justify-between gap-x-(--gap) [--gap:24px] [--inset:18px] [--pad:12px] [mask:linear-gradient(to_right,#000_calc(var(--edge,100%)-var(--fade-r,0px)),transparent_var(--edge,100%))] narrow:[--gap:16px] narrow:[--inset:var(--side)] narrow:[--pad:10px]"
      style:--fade-r="{fade.r}px"
      style:--edge="{fade.edge}px"
    >
      <!-- On a wide screen the heads stay put under the top bar as the page scrolls the rows under them, over the page's ground once it does. -->
      <div
        class="relative z-2 col-span-full grid wide:sticky wide:top-(--head) grid-cols-subgrid items-baseline pb-4 wide:pb-2.5 in-[.down]:bg-ground in-[.down]:after:pointer-events-none in-[.down]:after:absolute in-[.down]:after:inset-x-0 in-[.down]:after:top-full in-[.down]:after:h-3 in-[.down]:after:bg-[linear-gradient(var(--color-ground)_50%,transparent)] in-[.down]:after:content-['']"
        id="histHead"
        aria-hidden="true"
        hidden={!ui.runs.length}
      >
        <span class="{HEAD} {WHEN} text-ink-3">When</span><span class="{HEAD} text-lime">Download</span><span class="{HEAD} text-orange"
          >Upload</span
        ><span class="{HEAD} text-ink-3">Ping</span><span class="{HEAD} text-ink-3">Mode</span><span class="{HEAD} {LAST} text-ink-3">Device</span>
      </div>
      <ol class="col-span-full grid grid-cols-subgrid border-b border-[rgba(241,247,235,0.1)] empty:border-b-0" id="histList" data-testid="history">
        {#each rows as r (r.id)}
          <!-- A run is a line of the table with a hairline over it; under the cursor it lights a little, so it reads as one thing to open. -->
          <li
            class="relative col-span-full grid grid-cols-subgrid border-t border-[rgba(241,247,235,0.1)] fine:transition-[background-color] fine:duration-120 fine:ease-[ease] fine:hover:bg-[rgba(241,247,235,0.05)]"
            data-testid="history-item"
            data-mode={r.mode}
            data-id={r.id}
          >
            <a
              class="col-span-full grid grid-cols-subgrid items-baseline py-(--pad) text-left transition-opacity duration-160 ease-[ease] focus-visible:rounded-sm focus-visible:-outline-offset-2 active:opacity-70"
              href={resolve('/history/[id]', { id: r.id })}
              aria-label={r.label}
            >
              <span class="{VALUE} {WHEN}" aria-hidden="true"><time data-testid="history-time" datetime={r.iso}>{r.when}</time></span>
              <span class={VALUE} aria-hidden="true"><b class="[font-weight:inherit] text-lime">{r.down.value}</b><span class={UNIT}>{r.down.unit}</span></span>
              <span class={VALUE} aria-hidden="true"><b class="[font-weight:inherit] text-orange">{r.up.value}</b><span class={UNIT}>{r.up.unit}</span></span>
              <span class={VALUE} aria-hidden="true"><b class="[font-weight:inherit]">{r.ping.value}</b><span class={UNIT}>{r.ping.unit}</span></span>
              <span class={VALUE} aria-hidden="true">{r.modeName}</span>
              <span class="{VALUE} {LAST}" aria-hidden="true">{#if r.device.mark}<OsMark os={r.device.os} mark={r.device.mark} />{/if}{r.device.text}</span>
            </a>
          </li>
        {/each}
      </ol>
    </div>
  </div>
  <!-- Under the table, its two actions on one row: Load more on the table's
       left edge, and Clear history on its right. A phone stacks them at the
       foot of the layer, each the column's full width, like Stop. Clearing
       asks first, in place: Cancel, and Clear all in soft red, since it
       destroys data. Clear all is the only way to delete. A tap darkens it
       like any glass key; under the cursor it keeps its red. -->
  <div
    class="flex flex-none flex-wrap items-start gap-x-3 pt-4 pb-1 narrow:mt-auto narrow:flex-col narrow:items-stretch narrow:gap-y-3 narrow:px-(--side) narrow:pb-0"
    id="histFoot"
    hidden={!ui.runs.length}
  >
    <button class="glass {CK} text-ink-2 fine:hover:text-ink" type="button" hidden={!ui.more} data-testid="history-more" onclick={() => history()?.loadMore()}
      ><span class={CK_LABEL}>Load more</span></button
    >
    <div class="group/clear ml-auto grid justify-items-end *:col-1 *:row-1 narrow:ml-0 narrow:justify-items-stretch" class:asking={ui.ask}>
      <button
        class="glass hollow {CK} text-ink-2 fine:hover:text-ink {ASKED}"
        id="histClear"
        type="button"
        inert={ui.ask}
        data-testid="history-clear"
        data-kick=""
        onclick={() => {
          ui.ask = true;
          document.getElementById('histNo')?.focus({ preventScroll: true });
        }}><span class={CK_LABEL}>Clear history</span></button
      >
      <div class="flex gap-x-2 narrow:grid narrow:grid-cols-[1fr_1fr]" role="group" aria-label="Clear history?" inert={!ui.ask}>
        <button
          class="glass {CK} text-ink-2 fine:hover:text-ink {UNASKED}"
          id="histNo"
          type="button"
          data-kick=""
          onclick={() => {
            ui.ask = false;
            document.getElementById('histClear')?.focus({ preventScroll: true });
          }}><span class={CK_LABEL}>Cancel</span></button
        >
        <button
          class="glass {CK} bg-[rgba(255,92,92,0.14)] text-red active:bg-(--glass-down) fine:hover:bg-[rgba(255,92,92,0.2)] fine:hover:text-[#ff8f8f] {UNASKED}"
          type="button"
          data-testid="history-clear-confirm"
          data-kick=""
          onclick={() => history()?.clearAll()}><span class={CK_LABEL}>Clear all</span></button
        >
      </div>
    </div>
    {#if ui.clearFailed}
      <p class="{KEY_LABEL} basis-full pt-3 text-red narrow:text-center" role="status" data-testid="history-clear-failed">History couldn't be cleared</p>
    {/if}
  </div>
  {#if ui.loaded && !ui.runs.length}
    <!-- No runs yet: said plainly where Start sits in idle, in a key's lettering over a row's value.
         Centred with transform, not translate: its rise animates translate, which would replace it. -->
    <div class="absolute inset-x-0 top-[calc(var(--idle-y)-var(--head))] grid justify-items-center gap-y-2.5 text-center [transform:translateY(-50%)]" id="histEmpty">
      <p class="{KEY_LABEL} whitespace-nowrap text-ink-3">No tests yet</p>
      <p class={VALUE}>Finished tests are kept {historyMode() === 'browser' ? 'in this browser' : 'on this server'}</p>
    </div>
  {/if}
</section>
