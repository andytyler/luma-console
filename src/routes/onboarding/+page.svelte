<script lang="ts">
  import { KeyRound, ShieldCheck, UsersRound } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let { data, form } = $props();
</script>

<main class="mx-auto grid min-h-[calc(100vh-56px)] max-w-5xl items-center gap-6 px-4 py-8 lg:grid-cols-[1fr_420px]">
  <section class="flex flex-col gap-5">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">Connect your Luma calendar</h1>
      <p class="mt-2 max-w-2xl text-muted-foreground">
        Add a Luma API key once. The app imports your calendar profile, cover/icon assets, managed events, and Luma calendar people into a private workspace scoped to your Google account.
      </p>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <Card.Root>
        <Card.Content class="flex flex-col gap-2 py-4">
          <KeyRound class="size-5" />
          <div class="font-medium">Encrypted key storage</div>
          <p class="text-sm text-muted-foreground">The Luma key is encrypted at rest. Local dev creates its own persistent key automatically.</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="flex flex-col gap-2 py-4">
          <UsersRound class="size-5" />
          <div class="font-medium">Calendar team import</div>
          <p class="text-sm text-muted-foreground">Admins, managers, members, and hosts found in Luma are prepared for app invites.</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="flex flex-col gap-2 py-4">
          <ShieldCheck class="size-5" />
          <div class="font-medium">Strict permissions</div>
          <p class="text-sm text-muted-foreground">Every event, guest, CSV, and batch action is checked against calendar membership.</p>
        </Card.Content>
      </Card.Root>
    </div>
  </section>

  <Card.Root>
    <Card.Header>
      <Card.Title>Luma API key</Card.Title>
      <Card.Description>Use a key from the calendar you want to manage.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="flex flex-col gap-4" method="POST" action="?/connect">
        <label class="flex flex-col gap-2 text-sm font-medium">
          API key
          <Input name="api_key" type="password" autocomplete="off" placeholder="luma_..." required />
        </label>
        {#if form?.message}
          <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {form.message}
          </p>
        {/if}
        <Button type="submit">Connect and import events</Button>
      </form>

      {#if data.calendars.length > 0}
        <div class="mt-5 rounded-md border bg-muted/40 p-3 text-sm">
          <div class="font-medium">Connected calendars</div>
          <div class="mt-2 flex flex-col gap-1 text-muted-foreground">
            {#each data.calendars as calendar}
              <a class="hover:underline" href={`/events?calendar_id=${calendar.id}`}>{calendar.name}</a>
            {/each}
          </div>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</main>
