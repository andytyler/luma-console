<script lang="ts">
  type Day = {
    date: string;
    contributionCount: number;
    color?: string;
  };

  type Week = {
    contributionDays?: Day[];
  };

  let { weeks = [] }: { weeks: unknown[] } = $props();

  const normalizedWeeks = $derived(weeks as Week[]);

  function intensity(count: number) {
    if (count <= 0) return 'bg-muted';
    if (count < 3) return 'bg-emerald-200';
    if (count < 7) return 'bg-emerald-400';
    if (count < 14) return 'bg-emerald-600';
    return 'bg-emerald-800';
  }
</script>

<div class="flex max-w-[180px] gap-[2px]" aria-label="GitHub contribution heatmap">
  {#each normalizedWeeks.slice(-26) as week}
    <div class="flex flex-col gap-[2px]">
      {#each (week.contributionDays ?? []) as day}
        <span
          class={`size-[5px] rounded-[1px] ${intensity(Number(day.contributionCount ?? 0))}`}
          title={`${day.date}: ${day.contributionCount} contributions`}
        ></span>
      {/each}
    </div>
  {/each}
</div>
