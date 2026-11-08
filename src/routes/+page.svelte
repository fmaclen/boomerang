<!--
  Home: Start, at idle's centre, over the run's screen. A run plays out here;
  once it is saved, the address becomes its own (/history/[id]).

  Start shows a press in light alone: its face lightens under the finger and
  a comet of the rim's own light runs once round the disc from the touch. On
  release it swells a little, then collapses on its own centre as the
  shockwave leaves its rim, faster and faster, to nothing; it thins only over
  its last few frames, so it never rests small. A resting cursor lifts it, and
  the press and the run keep the lift. When History closes it rises back the
  way it left (see app.css).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { START_GONE, START_SWELL, START_SWELL_T, START_THIN } from '../lib/run/timing';
  import { EASE_IN_OUT_SINE, EASE_OUT, lerp, span } from '../lib/scene/math';
  import { HOVER_LIFT, Hover } from '../lib/ui/hand';
  import { app, onFrame } from '../lib/ui/stage';
  import { is, ui } from '../lib/ui/state.svelte';

  const TOUCH_T = 0.16;
  const SWEEP_T = 0.9;

  let start: HTMLButtonElement;
  /** When the press went down, where round the disc it touched (degrees clockwise from the top), and when it was let go on the disc, or off it. */
  let press = { at: -1, ang: -40, up: -1, off: -1 };
  let closing = $state(false);
  const secs = () => performance.now() / 1000;

  // Closing History, Start comes back the way it left.
  afterNavigate(({ from }) => (closing = from?.route.id === '/history'));

  const down = (ev: PointerEvent) => {
    if (ui.screen !== 'idle') return;
    const r = start.getBoundingClientRect();
    press = { at: secs(), ang: (Math.atan2(ev.clientX - (r.left + r.width / 2), r.top + r.height / 2 - ev.clientY) * 180) / Math.PI, up: -1, off: -1 };
  };
  const letGo = (ev: PointerEvent) => {
    if (press.at < 0 || press.off >= 0 || ui.screen !== 'idle') return;
    const r = start.getBoundingClientRect();
    const inside = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)) <= r.width / 2;
    if (ev.type === 'pointerup' && inside) press.up = secs();
    else press.off = secs();
  };
  const go = () => {
    // A start with no press on the disc (a key) lights from now.
    if (press.at < 0 || press.off >= 0) press = { at: secs(), ang: -40, up: -1, off: -1 };
    press.off = -1;
    app.stage?.start();
  };

  onMount(() => {
    const hover = new Hover();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const written: Record<string, string> = {};
    const put = (prop: string, v: string) => {
      if (written[prop] !== v) start.style.setProperty(prop, (written[prop] = v));
    };
    const off = onFrame(({ now, t }) => {
      hover.update(now, ui.screen, start.matches(':hover') && !start.disabled);
      if (app.stage) app.stage.lean = hover.k;
      const run = ui.screen === 'run' && ui.view === 'start';
      let touch = 0;
      let sweep = 0;
      let sweepA = 0;
      if (press.at >= 0 && ui.screen !== 'exit') {
        // A finger let go on Start but no click came: let the light go.
        if (ui.screen === 'idle' && press.up >= 0 && press.off < 0 && now - press.up > 0.3) press.off = now;
        const held = now - press.at;
        const off = ui.screen === 'idle' && press.off >= 0 ? now - press.off : null;
        if (off !== null && off > TOUCH_T && held > SWEEP_T) press.at = -1;
        else {
          touch = EASE_OUT(span(held, 0, TOUCH_T)) * (off === null ? 1 : 1 - EASE_OUT(span(off, 0, TOUCH_T)));
          if (!reduced) {
            const u = span(held, 0, SWEEP_T);
            sweep = press.ang + 360 * EASE_IN_OUT_SINE(u);
            sweepA = EASE_IN_OUT_SINE(u / 0.15) * (1 - EASE_IN_OUT_SINE(span(u, 0.55, 1)));
          }
        }
      }
      let scale = reduced ? 1 : 1 + HOVER_LIFT * hover.k;
      let op = '';
      if (run) {
        sweepA *= 1 - span(t, 0, START_SWELL_T);
        if (!reduced)
          scale *=
            t < START_SWELL_T
              ? lerp(1, START_SWELL, EASE_IN_OUT_SINE(span(t, 0, START_SWELL_T)))
              : START_SWELL * (1 - Math.pow(span(t, START_SWELL_T, START_GONE), 2.4));
        op = (t >= START_GONE ? 0 : 1 - span(t, START_GONE - START_THIN, START_GONE)).toFixed(3);
      }
      put('scale', scale.toFixed(5));
      put('opacity', op);
      put('--glow', hover.glow(now, reduced).toFixed(3));
      put('--hov', hover.k.toFixed(3));
      put('--touch', Math.max(touch, hover.k).toFixed(3));
      put('--sweep', `${sweep.toFixed(1)}deg`);
      put('--sweep-a', sweepA.toFixed(3));
    });
    addEventListener('pointerup', letGo);
    addEventListener('pointercancel', letGo);
    return () => {
      off();
      if (app.stage) app.stage.lean = 0;
      removeEventListener('pointerup', letGo);
      removeEventListener('pointercancel', letGo);
    };
  });
</script>

<svelte:head><title>Boomerang</title></svelte:head>

<div class="absolute top-0 left-0 size-0 origin-top-left" id="startAt">
  <div class="absolute top-0 left-0 size-[calc(var(--s)*0.7)] [translate:-50%_-50%]" class:closing id="startWrap">
    <!-- Its label is pressed into the lime the way the others are pressed
         into dark glass, so it is dark, with a light lip under it. -->
    <button
      class="start glass absolute inset-0 grid place-items-center rounded-[50%]"
      id="start"
      type="button"
      data-testid="start"
      disabled={ui.screen !== 'idle' || is.open}
      bind:this={start}
      onpointerdown={down}
      onclick={go}
      ><span
        class="font-stretch-125% text-[length:calc(var(--s)*0.085)] leading-none font-bold tracking-[0.08em] uppercase text-shadow-[0_1px_0_rgba(246,255,238,0.55),0_-1px_0_rgba(13,34,5,0.18)]"
        >Start</span
      ></button
    >
  </div>
</div>
