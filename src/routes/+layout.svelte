<script lang="ts">
  import '../app.css';
  import { CircleHelp, LogOut, Plus, Settings, UsersRound } from '@lucide/svelte';
  import { Toaster } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button/index.js';

  let { data, children } = $props();
</script>

<Toaster position="bottom-right" richColors closeButton visibleToasts={4} />

{#if data.user}
  <div class="min-h-screen">
    <header class="border-b border-neutral-200 bg-white/90">
      <div class="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3">
        <a href="/" class="flex items-center gap-2 text-sm font-semibold text-neutral-950">
          <span class="grid size-8 place-items-center rounded bg-neutral-950 text-xs font-bold text-white">LC</span>
          <span>Luma Console</span>
        </a>
        <nav class="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" href="/events">
            <UsersRound data-icon="inline-start" /> Events
          </Button>
          <Button variant="ghost" size="sm" href="/onboarding">
            <Plus data-icon="inline-start" /> Calendar
          </Button>
          <Button variant="ghost" size="sm" href="/settings/invites">
            <Settings data-icon="inline-start" /> Invites
          </Button>
          <Button variant="ghost" size="sm" href="/settings/setup">
            <CircleHelp data-icon="inline-start" /> Setup
          </Button>
          <span class="hidden max-w-[220px] truncate px-2 text-xs text-muted-foreground md:inline">
            {data.user.email}
          </span>
          <form method="POST" action="/logout">
            <Button variant="ghost" size="sm">
              <LogOut data-icon="inline-start" /> Sign out
            </Button>
          </form>
        </nav>
      </div>
    </header>
    {@render children()}
  </div>
{:else}
  {@render children()}
{/if}
