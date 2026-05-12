<script lang="ts">
  import '../app.css';
  import { LogOut, Settings, UsersRound } from 'lucide-svelte';

  let { data, children } = $props();
</script>

{#if data.user}
  <div class="min-h-screen">
    <header class="border-b border-neutral-200 bg-white/90">
      <div class="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3">
        <a href="/" class="flex items-center gap-2 text-sm font-semibold text-neutral-950">
          <span class="grid size-8 place-items-center rounded bg-neutral-950 text-xs font-bold text-white">LC</span>
          <span>Luma Console</span>
        </a>
        <nav class="flex items-center gap-1 text-sm">
          <a class="rounded px-3 py-2 text-neutral-700 hover:bg-neutral-100" href="/events">
            <UsersRound class="mr-1 inline size-4" /> Events
          </a>
          <a class="rounded px-3 py-2 text-neutral-700 hover:bg-neutral-100" href="/settings/invites">
            <Settings class="mr-1 inline size-4" /> Invites
          </a>
          <form method="POST" action="/logout">
            <button class="rounded px-3 py-2 text-neutral-700 hover:bg-neutral-100">
              <LogOut class="mr-1 inline size-4" /> Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
    {@render children()}
  </div>
{:else}
  {@render children()}
{/if}
