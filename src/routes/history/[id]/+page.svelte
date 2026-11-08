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
  import { tick, untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatBytes, formatMs, getRun, type Result } from '../../../lib/engine';
  import { RunData } from '../../../lib/run/data';
  import { makeSwarms } from '../../../lib/scene/swarm';
  import { KEY_LABEL, UNIT, VALUE } from '../../../lib/ui/classes';
  import OsMark from '../../../lib/ui/OsMark.svelte';
  import { deviceWords, modeName, whenOf } from '../../../lib/ui/rows';
  import { app } from '../../../lib/ui/stage';
  import { ui } from '../../../lib/ui/state.svelte';

  interface Detail {
    label: string;
    /** A figure, its digits and unit apart; or a word; or a device with its system's mark. */
    value?: string;
    unit?: string;
    text?: string;
    os?: string;
    mark?: string;
  }

  let details = $state<Detail[]>([]);
  let where: HTMLElement;
  /** The load still wanted: a newer address supersedes an older one still on its way. */
  let wanted = '';

  $effect(() => {
    const id = page.params.id ?? '';
    untrack(() => void load(id));
  });

  /** A run's address: its run, rebuilt and shown at rest, or a plain "not here". The run that has just finished here is already on screen. */
  async function load(id: string): Promise<void> {
    if (id === app.stage?.liveId) return;
    wanted = id;
    // Whatever run was showing goes at once, so its figures never stand for this one.
    if (ui.screen !== 'idle') app.stage?.toIdle();
    details = [];
    ui.view = 'loading';
    const r = await getRun(id).catch(() => null);
    if (wanted !== id) return;
    if (!r || !app.stage) {
      ui.view = 'missing';
      return;
    }
    details = describe(r);
    app.stage.showReplay(RunData.replay(r, makeSwarms(app.stage.seed)));
    ui.view = 'past';
    // On a phone the charts come down to sit over the details, the stats row's distance above them.
    await tick();
    const wide = matchMedia('(min-width: 900px) and (min-height: 560px)').matches;
    document.documentElement.style.setProperty('--where-dy', wide ? '0px' : `calc(var(--dock-bottom) - ${where.offsetHeight}px - var(--stats-top))`);
  }

  /** In the History row's order: when, what it measured, then how and on what it ran. */
  function describe(r: Result): Detail[] {
    const ping = formatMs(r.latency.idleMs);
    const jitter = formatMs(r.latency.jitterMs);
    const bytes = formatBytes(r.download.bytes + r.upload.bytes);
    const device = deviceWords(r.device);
    return [
      { label: 'When', text: whenOf(r.startedAt, Date.now()) },
      { label: 'Ping', value: ping.value, unit: ping.unit },
      { label: 'Jitter', value: jitter.value, unit: jitter.unit },
      { label: 'Data used', value: bytes.value, unit: bytes.unit },
      { label: 'Mode', text: modeName(r.mode) },
      { label: 'Device', text: device.text, os: device.os, mark: device.mark },
      { label: 'Browser', text: r.device?.browser || 'Unknown' },
    ];
  }
</script>

<svelte:head><title>{details.length ? `${details[0].text} · Boomerang` : 'Boomerang'}</title></svelte:head>

<dl
  class="absolute m-0 grid grid-cols-3 content-start gap-x-3 gap-y-6 [--fs:16px] [--lab:12px] wide:grid-cols-[repeat(7,auto)] wide:justify-between wide:[--fs:21px] wide:[--lab:14px]"
  id="where"
  bind:this={where}
  aria-live="polite"
  data-testid="history-details"
>
  {#each details as d (d.label)}
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
{#if ui.view === 'missing'}
  <!-- An address for a run History doesn't have: said where Start would sit. -->
  <div class="absolute inset-x-0 top-(--idle-y) grid -translate-y-1/2 justify-items-center gap-y-2.5 text-center" data-testid="history-missing">
    <p class="{KEY_LABEL} text-ink-3">Not in History</p>
    <a class="{VALUE} underline decoration-ink-3 underline-offset-4" href={resolve('/history')}>See every test</a>
  </div>
{/if}
