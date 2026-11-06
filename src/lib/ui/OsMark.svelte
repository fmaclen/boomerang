<!-- A system's filled mark, sized to the text beside it. -->
<script lang="ts">
  let { os, mark }: { os: string; mark: string } = $props();
</script>

<svg class="mr-[0.21em] ml-[0.1em] inline-block size-[0.94em] fill-current align-[-0.125em]" viewBox="0 0 24 24" role="img" aria-label={os}>{@html mark}</svg>
