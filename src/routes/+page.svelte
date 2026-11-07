<!--
  Home: Start, at idle's centre, over the run's screen. A run plays out here;
  once it is saved, the address becomes its own (/history/[id]).
-->
<script lang="ts">
  import { app } from '../lib/ui/stage';
  import { ui } from '../lib/ui/state.svelte';
</script>

<svelte:head><title>Boomerang</title></svelte:head>

<div class="absolute top-0 left-0 size-0 origin-top-left" id="startAt">
  <div class="absolute top-0 left-0 size-[calc(var(--s)*0.7)] [translate:-50%_-50%]" id="startWrap">
    <!-- Its label is pressed into the lime the way the others are pressed
         into dark glass, so it is dark, with a light lip under it. -->
    <button
      class="start glass absolute inset-0 grid place-items-center rounded-[50%]"
      id="start"
      type="button"
      data-testid="start"
      disabled={ui.screen !== 'idle' || ui.open}
      onpointerdown={(ev) => app.stage?.pressDown(ev)}
      onclick={() => app.stage?.pressStart()}
      ><span
        class="font-stretch-125% text-[length:calc(var(--s)*0.085)] leading-none font-bold tracking-[0.08em] uppercase text-shadow-[0_1px_0_rgba(246,255,238,0.55),0_-1px_0_rgba(13,34,5,0.18)]"
        >Start</span
      ></button
    >
  </div>
</div>
