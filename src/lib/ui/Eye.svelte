<!--
  The eye, at the swarm's centre: the live number during a run, which comes
  to rest as the result's upload line, with download rising in above it. It
  writes its own words: on each reading, each catch and each milestone a
  line rolls, the number pops and glows (see write). Everything in it is
  sized in the swarm's size (--s), so where the number comes to rest is a
  fixed offset (see app.css).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { formatMs, formatRate, type Formatted } from '../engine';
  import type { Reading, RunData } from '../run/data';
  import { SETTLE } from '../run/timing';
  import { EASE_IN_OUT_SINE, EASE_OUT, EASE_OUT_SOFT, bump, lerp, mixc, smooth, span, type RGB } from '../scene/math';
  import { onFrame } from './stage';
  import { is, ui } from './state.svelte';

  const LIME: RGB = [161, 255, 89];
  const LIME_ACC: RGB = [198, 255, 134];
  const ORANGE: RGB = [255, 122, 48];
  const INK: RGB = [241, 247, 235];
  const WHITE: RGB = [255, 255, 255];
  const DIR_RGB = [LIME, ORANGE];
  /**
   * The number's glow peaks GLOW_PEAK after its beat, with the pop, then
   * falls by a factor of e every GLOW_FADE seconds. The next beat puts it out
   * over GLOW_CUT as its own glow swells in.
   */
  const GLOW_PEAK = 0.1;
  const GLOW_FADE = 0.3;
  const GLOW_CUT = 0.08;

  /** How bright the number's glow is tau seconds after its beat: it swells in on the pop's own curve, then eases out. */
  const glowOf = (tau: number) => (tau <= 0 ? 0 : tau <= GLOW_PEAK ? bump(tau, GLOW_PEAK) : Math.exp(-(tau - GLOW_PEAK) / GLOW_FADE));
  const css = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const unitOf = (r: Reading | undefined) => (r?.g ? 'Gbps' : 'Mbps');

  // Writes every frame skip what has not changed.
  const written = new WeakMap<HTMLElement, Record<string, string>>();
  function put(n: HTMLElement, prop: string, v: string): void {
    let m = written.get(n);
    if (!m) written.set(n, (m = {}));
    if (m[prop] === v) return;
    m[prop] = v;
    if (prop === 'text') n.textContent = v;
    else if (prop.startsWith('@')) n.setAttribute(prop.slice(1), v);
    else n.style.setProperty(prop, v);
  }

  /** What the eye shows at a moment: the phase, its colour, the number and its unit. */
  interface EyeWords {
    label: string;
    col: RGB;
    num: string;
    dim: boolean;
    unit: string;
    dir: number;
  }

  class Writer {
    data: RunData | null = null;
    MOVE = 1;
    REDUCED = false;
    slots: HTMLElement[][];
    constructor(slots: HTMLElement[][]) {
      this.slots = slots;
    }

    /** The live lines at run time t. */
    write(t: number): void {
      this.rollLine(0, t, (c) => c.label, this.styleLabel);
      this.rollLine(1, t, (c) => c.num, this.styleNum);
      this.rollLine(2, t, (c) => c.unit, this.styleUnit);
    }

    eyeAt(t: number): EyeWords {
      const d = this.data!;
      if (t >= d.failedAt) return { ...this.eyeAt(d.failedAt - 1e-3), label: 'Failed', col: INK, dim: true, dir: -1 };
      if (t < d.dirs[0].t0) {
        let n = -1;
        for (let i = 0; i < d.throws.length; i++) if (t >= d.catchAt(i)) n = i;
        // Until the first catch the number waits at a greyed zero, the width of a reading.
        if (n < 0) return { label: 'Ping', col: INK, num: formatMs(0).value, dim: true, unit: 'ms', dir: -1 };
        const f = formatMs(d.catchValue(n));
        return { label: 'Ping', col: INK, num: f.value, dim: false, unit: f.unit, dir: -1 };
      }
      // Each direction takes over the eye as its phase starts, with its swarm;
      // until the meter's first reading its number waits at a greyed zero.
      const i = t < d.dirs[1].t0 ? 0 : 1;
      const dir = d.dirs[i];
      const label = i ? 'Upload' : 'Download';
      let f: Formatted;
      if (t < dir.firstAt && t < dir.t1) {
        f = formatRate(0);
        return { label, col: DIR_RGB[i], num: f.value, dim: true, unit: f.unit, dir: i };
      }
      if (t < dir.t1 || dir.final === undefined) {
        const r = dir.readingAt(t);
        f = formatRate(r?.mbps ?? 0, unitOf(r));
      } else {
        const last = dir.readings[dir.readings.length - 1];
        const settle = EASE_OUT(span(t, dir.t1, dir.t1 + SETTLE));
        f = settle >= 1 ? formatRate(dir.final) : formatRate(lerp(last?.mbps ?? dir.final, dir.final, settle), formatRate(dir.final).unit);
      }
      return { label, col: DIR_RGB[i], num: f.value, dim: false, unit: f.unit, dir: i };
    }

    popAt(t: number): { scale: number; heat: number; unit: number } {
      const d = this.data!;
      let scale = 0;
      let heat = 0;
      let unit = 0;
      // Milestones close together take the strongest pop rather than adding up.
      for (const sw of [d.D, d.U]) {
        for (const r of sw.rewards) {
          if (r.giga) continue;
          const tau = t - r.t;
          if (tau < 0 || tau > 1.2) continue;
          scale = Math.max(scale, (0.025 + 0.012 * r.level) * bump(tau, 0.09));
          heat = Math.max(heat, (0.2 + 0.08 * r.level) * bump(tau, 0.12));
        }
      }
      // Crossing from Mbps into Gbps is an event: the number pops and the unit flares.
      for (const tg of d.gigas) {
        const tau = t - tg;
        if (tau < 0 || tau > 1.6) continue;
        scale += 0.17 * bump(tau, 0.1);
        heat += 0.9 * bump(tau, 0.16);
        unit += 0.8 * bump(tau, 0.16);
      }
      return { scale: Math.min(scale, 0.2), heat: Math.min(heat, 0.92), unit: Math.min(unit, 1) };
    }

    /**
     * The number's glow at t, from 0 to 1. It fires on each catch, as its
     * reading shows, and on each milestone, as its shockwave leaves the eye
     * and the number pops; stepping up into Gbps pops it too. Each beat takes
     * over from the one before, which goes out as it swells in, so a ripple
     * of milestones 0.12 s apart dips to about half between its crests rather
     * than piling into a blaze, and a lone beat eases out in full. Words
     * rolling away take no beat from the moment they began to go (before),
     * so a beat lights only the reading it belongs to, even when it lands on
     * the very reading that rolls the number into Gbps.
     */
    glowAt(t: number, before = Infinity): number {
      if (this.REDUCED) return 0;
      const d = this.data!;
      // The latest beat so far (at, k) and the one before it (at0, k0). A
      // milestone and the step into Gbps on the same reading are one beat.
      let at = -Infinity;
      let k = 0;
      let at0 = -Infinity;
      let k0 = 0;
      const beat = (tb: number, kb: number) => {
        if (tb > t || tb >= before) return;
        if (tb === at) k = Math.max(k, kb);
        else if (tb > at) [at0, k0, at, k] = [at, k, tb, kb];
        else if (tb === at0) k0 = Math.max(k0, kb);
        else if (tb > at0) [at0, k0] = [tb, kb];
      };
      for (let i = 0; i < d.throws.length; i++) beat(d.catchAt(i), 1);
      for (const sw of [d.D, d.U]) for (const r of sw.rewards) beat(r.t, lerp(0.8, 1, r.s));
      for (const tg of d.gigas) beat(tg, 1);
      return Math.max(k * glowOf(t - at), k0 * glowOf(t - at0) * (1 - smooth(0, GLOW_CUT, t - at)));
    }

    // A line of the eye that rolls when its words change: the old words lift
    // away over the first part, and the new ones rise into place over the
    // rest, fading across each other so the line is never empty. A catch hands
    // over on the catch itself: the old reading has lifted away as the
    // boomerang comes in, and the new one shows whole from the frame it lands.
    rollLine(j: number, t: number, pick: (c: EyeWords) => string, style: (n: HTMLElement, c: EyeWords, t: number, before?: number) => void): void {
      const s = this.slots[j];
      const d = this.data!;
      let ev = null;
      for (const e of d.events) if ((j !== 0 || e.phase) && e.t <= t && t - e.t < e.dur) ev = e;
      const cur = this.eyeAt(t);
      const [a, b] = s;
      if (ev && pick(this.eyeAt(ev.at - 1e-3)) !== pick(this.eyeAt(ev.at + 1e-4))) {
        const prev = this.eyeAt(ev.at - 1e-3);
        const next = t < ev.at ? this.eyeAt(ev.at + 1e-4) : cur;
        let oY: number;
        let oOp: number;
        let nY: number;
        let nOp: number;
        if (ev.land) {
          const so = span(t, ev.t, ev.at);
          const si = span(t, ev.at, ev.t + ev.dur);
          oY = -0.3 * EASE_OUT_SOFT(so);
          oOp = 1 - EASE_IN_OUT_SINE(so);
          nY = 0.12 * (1 - EASE_OUT_SOFT(si));
          nOp = t >= ev.at ? 1 : 0;
        } else {
          const so = span(t, ev.t, ev.t + 0.45 * ev.dur);
          const si = span(t, ev.t + 0.2 * ev.dur, ev.t + ev.dur);
          oY = -0.42 * EASE_OUT_SOFT(so);
          oOp = 1 - so;
          nY = 0.42 * (1 - EASE_OUT_SOFT(si));
          nOp = span(si, 0, 0.6);
        }
        put(a, 'text', pick(prev));
        put(b, 'text', pick(next));
        style(a, prev, t, ev.t);
        style(b, next, t);
        put(a, 'transform', `translateY(${(oY * this.MOVE).toFixed(3)}em)`);
        put(a, 'opacity', oOp.toFixed(3));
        put(b, 'transform', `translateY(${(nY * this.MOVE).toFixed(3)}em)`);
        put(b, 'opacity', nOp.toFixed(3));
      } else {
        put(a, 'text', pick(cur));
        style(a, cur, t);
        put(a, 'transform', 'none');
        put(a, 'opacity', '1');
        put(b, 'opacity', '0');
        put(b, 'text', '');
      }
    }

    styleLabel = (n: HTMLElement, c: EyeWords, t: number) => {
      put(n, 'color', css(c.col));
      put(n, 'translate', `0 calc(var(--s) * ${(-this.popAt(t).scale * 0.15 * this.MOVE).toFixed(4)})`);
    };

    // The glow's copy of the digits and its colour change only with the
    // reading and the phase; only its strength moves frame to frame.
    styleNum = (n: HTMLElement, c: EyeWords, t: number, before?: number) => {
      put(n, '@data-num', c.num);
      put(n, '--bloom-c', c.col.join(' '));
      if (c.dim) {
        put(n, 'color', css(INK, 0.4));
        put(n, 'scale', '1');
        put(n, '--bloom', '0');
        return;
      }
      const p = this.popAt(t);
      put(n, 'color', css(mixc(c.col, WHITE, c.dir < 0 ? 0 : p.heat)));
      put(n, 'scale', (1 + p.scale * this.MOVE).toFixed(4));
      put(n, '--bloom', this.glowAt(t, before).toFixed(3));
    };

    styleUnit = (n: HTMLElement, _c: EyeWords, t: number) => {
      const p = this.popAt(t);
      put(n, 'color', p.unit > 0.01 ? css(mixc([150, 154, 147], LIME_ACC, p.unit)) : '');
      put(n, 'scale', (1 + 0.45 * p.unit * this.MOVE).toFixed(4));
      put(n, 'translate', `0 calc(var(--s) * ${(p.scale * 0.15 * this.MOVE).toFixed(4)})`);
    };

  }

  const WORD = 'font-stretch-125% text-[length:calc(var(--s)*0.064)] leading-none font-bold tracking-[0.08em] uppercase';
  /** One of a slot's two spans, which roll one into the other. */
  const SLOT = 'relative grid place-items-center *:col-1 *:row-1 *:leading-none';
  const NUM = 'font-stretch-62% leading-none font-extrabold tracking-[-0.01em]';
  /**
   * The live number's glow: a copy of its digits (data-num) behind them,
   * drawn as nothing but a bloom in the number's own colour (--bloom-c),
   * faded by --bloom. It is a layer of its own, so a fade only recomposites
   * it and the blur is drawn once per reading.
   */
  const GLOW =
    'relative isolate after:pointer-events-none after:absolute after:inset-0 after:-z-1 after:text-transparent after:opacity-[var(--bloom,0)] after:will-change-[opacity] after:content-[attr(data-num)] after:text-shadow-[0_0_0.04em_rgb(var(--bloom-c)),0_0_0.12em_rgb(var(--bloom-c)/0.9),0_0_0.3em_rgb(var(--bloom-c)/0.7),0_0_0.6em_rgb(var(--bloom-c)/0.45)]';
  const UNIT = 'text-[length:calc(var(--s)*0.085)] leading-none font-semibold text-ink-2';
  const RES_UNIT = 'text-[length:calc(var(--s)*0.095)] leading-none font-semibold text-ink-2';

  let phase: HTMLElement;
  let num: HTMLElement;
  let unit: HTMLElement;
  let words = $state({ down: { value: '', unit: '' }, up: '' });
  let resUnit: HTMLElement;
  /** How wide the result's unit is, gap included, so the number and its unit come to rest centred as a pair. */
  let unitW = $state(0);

  onMount(() => {
    const spans = (n: HTMLElement) => [...n.children] as HTMLElement[];
    const w = new Writer([spans(phase), spans(num), spans(unit)]);
    w.REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    w.MOVE = w.REDUCED ? 0 : 1;
    let shown: unknown = null;
    return onFrame(({ t, data }) => {
      if (!data || ui.screen === 'idle') return;
      w.data = data;
      // The result's own words, once it has them.
      if (data.result && data.result !== shown) {
        shown = data.result;
        const down = formatRate(data.result.download.mbps);
        words = { down: { value: down.value, unit: down.unit }, up: formatRate(data.result.upload.mbps).unit };
        void tick().then(() => (unitW = (resUnit.firstElementChild as HTMLElement).offsetWidth));
      }
      if (t > 0.3) w.write(t);
    });
  });
</script>

<div class="absolute top-0 left-0 size-0 origin-top-left *:absolute *:top-0 *:left-0 *:[translate:-50%_-50%]" id="eye">
  <!-- A pool of shade behind the number, wider for the two-line result, so the digits always win. -->
  <div class="pointer-events-none size-[calc(var(--s)*1.134)]" id="pool"></div>
  <!-- The result's download line, rising in above the number come to rest:
       where the old two-line result's top line sat, 0.247 of the swarm's
       size above the eye. -->
  <div style="top: calc(var(--s) * -0.247)" id="result" aria-live="polite" data-testid={is.formed && ui.screen === 'run' ? 'result' : undefined} data-settled={ui.beat === 'settled' && ui.screen === 'run' ? '' : undefined}>
  <div class="flex flex-col items-center whitespace-nowrap" id="resD">
    <div class="{WORD} text-lime">Download</div>
    <div class="mt-[calc(var(--s)*0.03)] flex items-baseline gap-[calc(var(--s)*0.025)]" data-testid="result-download" aria-hidden={!is.formed}>
      <span class="{NUM} text-[length:calc(var(--s)*0.34)] text-lime">{words.down.value}</span><span class={RES_UNIT}>{words.down.unit}</span>
    </div>
  </div>
  </div>
  <div style:--unit-w="{unitW}px" class="flex flex-col items-center whitespace-nowrap" id="live" data-testid={is.measuring ? 'running' : undefined} data-phase={is.measuring ? ui.beat : undefined}>
    <div class="{SLOT} h-[calc(var(--s)*0.07)]" id="lvPhase" bind:this={phase} aria-hidden="true"><span class={WORD}></span><span class={WORD}></span></div>
    <!-- The number, and the result's unit, which opens out beside it as it comes to rest. -->
    <div class="relative mt-[calc(var(--s)*0.03)] grid h-[calc(var(--s)*0.37)] place-items-center" id="lvNum">
      <div class="inline-flex items-baseline" data-testid="result-upload">
        <!-- Each rolling span centred on its own, so a wider word rolling in never shifts the one on screen. -->
        <div class="grid justify-items-center *:col-1 *:row-1 *:leading-none" bind:this={num}>
          <span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span><span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span>
        </div>
        <div class="w-0 whitespace-nowrap" id="resUnit" bind:this={resUnit}><span class="inline-block {RES_UNIT}">{words.up}</span></div>
      </div>
    </div>
    <div class="{SLOT} mt-[calc(var(--s)*0.025)] h-[calc(var(--s)*0.09)]" id="lvUnit" bind:this={unit} aria-hidden="true">
      <span class="origin-top {UNIT}"></span><span class="origin-top {UNIT}"></span>
    </div>
    {#if ui.failed && ui.view === 'start'}
      <!-- Why it failed, said plainly under it. -->
      <p class="absolute top-full left-1/2 mt-[calc(var(--s)*0.06)] -translate-x-1/2 whitespace-nowrap text-[length:calc(var(--s)*0.07)] leading-tight font-semibold text-ink-2" id="reason" role="alert" data-testid="run-failed">{ui.failed}</p>
    {/if}
  </div>
</div>
