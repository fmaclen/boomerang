<!--
  The eye, at the swarm's centre: Start in idle, the live number during a
  run, and the result. The director moves and fills all three every frame
  and sets the test ids (running, result) as the run goes. Their type is
  sized in the swarm's own size (--s), which the director sets.
-->
<script lang="ts">
  /** The phase over the live number, and each direction's name over its result. */
  const WORD = 'font-stretch-125% text-[length:calc(var(--s)*0.064)] leading-none font-bold tracking-[0.08em] uppercase';
  /** One of a slot's two spans, which the director rolls one into the other. */
  const SLOT = 'relative grid place-items-center *:col-1 *:row-1 *:leading-none';
  const NUM = 'font-stretch-62% leading-none font-extrabold tracking-[-0.01em]';
  /**
   * The live number's glow: a copy of its digits (data-num) behind them,
   * drawn as nothing but a bloom in the number's own colour (--bloom-c). The
   * director fades it (--bloom). It is a layer of its own, so a fade only
   * recomposites it and the blur is drawn once per reading.
   */
  const GLOW =
    'relative isolate after:pointer-events-none after:absolute after:inset-0 after:-z-1 after:text-transparent after:opacity-[var(--bloom,0)] after:will-change-[opacity] after:content-[attr(data-num)] after:text-shadow-[0_0_0.04em_rgb(var(--bloom-c)),0_0_0.12em_rgb(var(--bloom-c)/0.9),0_0_0.3em_rgb(var(--bloom-c)/0.7),0_0_0.6em_rgb(var(--bloom-c)/0.45)]';
</script>

<div
  class="invisible fixed top-0 left-0 size-0 origin-top-left in-data-drawn:visible *:absolute *:top-0 *:left-0 *:[transform:translate(-50%,-50%)]"
  id="eye"
>
  <div class="size-[calc(var(--s)*0.7)]" id="startWrap">
    <!-- Its label is pressed into the lime the way the others are pressed
         into dark glass, so it is dark, with a light lip under it. -->
    <button
      class="start glass pointer-events-auto absolute inset-0 grid place-items-center rounded-[50%]"
      id="start"
      type="button"
      data-testid="start"
      ><span
        class="font-stretch-125% text-[length:calc(var(--s)*0.085)] leading-none font-bold tracking-[0.08em] uppercase text-shadow-[0_1px_0_rgba(246,255,238,0.55),0_-1px_0_rgba(13,34,5,0.18)]"
        >Start</span
      ></button
    >
  </div>
  <div class="pointer-events-none flex flex-col items-center whitespace-nowrap" id="live" aria-hidden="true">
    <div class="{SLOT} h-[calc(var(--s)*0.07)]" id="lvPhase"><span class={WORD}></span><span class={WORD}></span></div>
    <div class="{SLOT} mt-[calc(var(--s)*0.03)] h-[calc(var(--s)*0.37)]" id="lvNum">
      <span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span><span class="{NUM} {GLOW} text-[length:calc(var(--s)*0.44)]"></span>
    </div>
    <div class="{SLOT} mt-[calc(var(--s)*0.025)] h-[calc(var(--s)*0.09)]" id="lvUnit">
      <span class="origin-top text-[length:calc(var(--s)*0.085)] leading-none font-semibold text-ink-2"></span><span
        class="origin-top text-[length:calc(var(--s)*0.085)] leading-none font-semibold text-ink-2"
      ></span>
    </div>
  </div>
  <!-- Each result line is centred as a whole, number and unit together. -->
  <div class="pointer-events-none flex flex-col items-center whitespace-nowrap" id="result" aria-live="polite">
    <div class="res flex flex-col items-center">
      <div class="res-label {WORD} text-lime">Download</div>
      <div class="res-line mt-[calc(var(--s)*0.03)] flex items-baseline gap-[calc(var(--s)*0.025)]" data-testid="result-download">
        <span class="res-num {NUM} text-[length:calc(var(--s)*0.34)] text-lime"></span><span
          class="res-unit text-[length:calc(var(--s)*0.095)] leading-none font-semibold text-ink-2"
        ></span>
      </div>
    </div>
    <div class="res res-ul mt-[calc(var(--s)*0.06)] flex flex-col items-center">
      <div class="res-label {WORD} text-orange">Upload</div>
      <div class="res-line mt-[calc(var(--s)*0.03)] flex items-baseline gap-[calc(var(--s)*0.025)]" data-testid="result-upload">
        <span class="res-num {NUM} text-[length:calc(var(--s)*0.34)] text-orange"></span><span
          class="res-unit text-[length:calc(var(--s)*0.095)] leading-none font-semibold text-ink-2"
        ></span>
      </div>
    </div>
  </div>
</div>
