<!--
  The eye, at the swarm's centre: the live number during a run, and the
  result. Its type is sized in the swarm's own size (--s), which the stage
  sets with the cameras (--run-*, --idle-*).
-->
<script lang="ts">
  import { ui } from './state.svelte';

  /** The phase over the live number, and each direction's name over its result. */
  const WORD = 'font-stretch-125% text-[length:calc(var(--s)*0.064)] leading-none font-bold tracking-[0.08em] uppercase';
  /** One of a slot's two spans, which the stage rolls one into the other. */
  const SLOT = 'relative grid place-items-center *:col-1 *:row-1 *:leading-none';
  const NUM = 'font-stretch-62% leading-none font-extrabold tracking-[-0.01em]';
  /**
   * The live number's glow: a copy of its digits (data-num) behind them,
   * drawn as nothing but a bloom in the number's own colour (--bloom-c). The
   * stage fades it (--bloom). It is a layer of its own, so a fade only
   * recomposites it and the blur is drawn once per reading.
   */
  const GLOW =
    'relative isolate after:pointer-events-none after:absolute after:inset-0 after:-z-1 after:text-transparent after:opacity-[var(--bloom,0)] after:will-change-[opacity] after:content-[attr(data-num)] after:text-shadow-[0_0_0.04em_rgb(var(--bloom-c)),0_0_0.12em_rgb(var(--bloom-c)/0.9),0_0_0.3em_rgb(var(--bloom-c)/0.7),0_0_0.6em_rgb(var(--bloom-c)/0.45)]';
  const UNIT = 'text-[length:calc(var(--s)*0.085)] leading-none font-semibold text-ink-2';
  const RES_UNIT = 'text-[length:calc(var(--s)*0.095)] leading-none font-semibold text-ink-2';
</script>

<div class="absolute top-0 left-0 size-0 origin-top-left *:absolute *:top-0 *:left-0 *:[translate:-50%_-50%]" id="eye">
  <!-- A pool of shade behind the number, wider for the two-line result, so the digits always win. -->
  <div class="pointer-events-none size-[calc(var(--s)*1.134)]" id="pool"></div>
  <div
    class="flex flex-col items-center whitespace-nowrap"
    id="live"
    aria-hidden="true"
    data-testid={ui.phase ? 'running' : undefined}
    data-phase={ui.phase || undefined}
  >
    <div class="{SLOT} h-[calc(var(--s)*0.07)]" id="lvPhase"><span class={WORD}></span><span class={WORD}></span></div>
    <div class="{SLOT} mt-[calc(var(--s)*0.03)] h-[calc(var(--s)*0.37)]" id="lvNum">
      <span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span><span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span>
    </div>
    <div class="{SLOT} mt-[calc(var(--s)*0.025)] h-[calc(var(--s)*0.09)]" id="lvUnit">
      <span class="origin-top {UNIT}"></span><span class="origin-top {UNIT}"></span>
    </div>
  </div>
  <!-- The result: upload is the live number come to rest; download joins it
       from above. Each line is centred as a whole, number and unit together. -->
  <div
    class="flex flex-col items-center whitespace-nowrap"
    id="result"
    aria-live="polite"
    data-testid={ui.formed && ui.screen === 'run' ? 'result' : undefined}
    data-settled={ui.settled ? '' : undefined}
  >
    <div class="flex flex-col items-center" id="resD">
      <div class="{WORD} text-lime">Download</div>
      <div class="mt-[calc(var(--s)*0.03)] flex items-baseline gap-[calc(var(--s)*0.025)]" data-testid="result-download" aria-hidden={!ui.formed}>
        <span class="{NUM} text-[length:calc(var(--s)*0.34)] text-lime" id="res-numD"></span><span class={RES_UNIT} id="res-unitD"></span>
      </div>
    </div>
    <div class="mt-[calc(var(--s)*0.06)] flex flex-col items-center">
      <div class="{WORD} text-orange" id="res-label">Upload</div>
      <div class="mt-[calc(var(--s)*0.03)] flex items-baseline gap-[calc(var(--s)*0.025)]" data-testid="result-upload" aria-hidden={!ui.formed}>
        <span class="{NUM} text-[length:calc(var(--s)*0.34)] text-orange" id="res-num"></span><span class={RES_UNIT} id="res-unit"></span>
      </div>
    </div>
  </div>
</div>
