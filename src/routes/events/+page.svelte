<script lang="ts">
  import { CalendarSync, ExternalLink, RefreshCw, UsersRound, Webhook } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import {
    eventCapacity,
    eventDescription,
    eventHosts,
    eventLocation,
    eventVisibility,
    formatDateTime,
    isLiveEvent,
    isPastEvent,
    rawFieldNames,
    rawJsonPreview,
    relativeEventTime
  } from '$lib/event-display.js';

  let { data, form } = $props();

  function formatDate(value: string | null) {
    return formatDateTime(value);
  }

  function formDetails() {
    const candidate = form as { details?: string[] } | undefined;
    return Array.isArray(candidate?.details) ? candidate.details : [];
  }

  function totalGuests() {
    return data.events.reduce((total: number, event) => total + event.guest_count, 0);
  }

  function upcomingCount() {
    return data.events.filter((event) => !isPastEvent(event)).length;
  }

  function pendingGuests() {
    return data.events.reduce((total: number, event) => total + event.pending_count, 0);
  }

  function eventTone(event: (typeof data.events)[number]) {
    if (isLiveEvent(event)) return 'default';
    if (isPastEvent(event)) return 'outline';
    return 'secondary';
  }
</script>

<main class="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Events</h1>
      <p class="mt-1 text-sm text-muted-foreground">Pull every managed Luma event, then import each guest list.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <form method="POST" action="?/sync">
        <Button type="submit" disabled={!data.lumaConfigured}>
          <CalendarSync data-icon="inline-start" /> Sync Luma events
        </Button>
      </form>
      <form method="POST" action="?/syncAllGuests">
        <Button type="submit" variant="outline" disabled={!data.lumaConfigured}>
          <UsersRound data-icon="inline-start" /> Sync all guest lists
        </Button>
      </form>
    </div>
  </div>

  {#if !data.lumaConfigured}
    <Card.Root class="border-destructive/30 bg-destructive/5">
      <Card.Content class="py-4 text-sm text-destructive">Set LUMA_API_KEY on Railway or in local env before importing.</Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2">
        <Webhook class="size-4" /> Luma webhook
      </Card.Title>
      <Card.Description>
        Configure Luma to POST guest and event changes to <code class="rounded bg-muted px-1 py-0.5">/api/webhooks/luma</code>.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant={data.lumaWebhookConfigured ? 'secondary' : 'destructive'}>
          {data.lumaWebhookConfigured ? 'Secret configured' : 'Set LUMA_WEBHOOK_SECRET'}
        </Badge>
        <span class="text-muted-foreground">Use it after the initial full event and guest import.</span>
      </div>
      {#if data.webhookDeliveries.length > 0}
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Type</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Event</Table.Head>
              <Table.Head>Guest</Table.Head>
              <Table.Head>Received</Table.Head>
              <Table.Head>Error</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.webhookDeliveries as delivery}
              <Table.Row>
                <Table.Cell>{delivery.event_type ?? 'unknown'}</Table.Cell>
                <Table.Cell>
                  <Badge variant={delivery.status === 'failed' ? 'destructive' : 'secondary'}>{delivery.status}</Badge>
                </Table.Cell>
                <Table.Cell>{delivery.luma_event_id ?? ''}</Table.Cell>
                <Table.Cell>{delivery.luma_guest_id ?? ''}</Table.Cell>
                <Table.Cell>{formatDate(delivery.received_at)}</Table.Cell>
                <Table.Cell class="max-w-[440px] truncate">{delivery.error ?? ''}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if form?.message}
    <Card.Root>
      <Card.Content class="flex flex-col gap-2 py-4 text-sm">
        <div>{form.message}</div>
        {#if formDetails().length}
          <ul class="flex flex-col gap-1 text-destructive">
            {#each formDetails() as detail}
              <li>{detail}</li>
            {/each}
          </ul>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Card.Title>Luma events</Card.Title>
          <Card.Description>
            {data.events.length} events stored locally, {upcomingCount()} upcoming or live, {totalGuests()} guests imported.
          </Card.Description>
        </div>
        <div class="grid grid-cols-3 gap-2 text-right text-sm">
          <div class="rounded-md border bg-background px-3 py-2">
            <div class="text-xs text-muted-foreground">Events</div>
            <div class="text-lg font-semibold">{data.events.length}</div>
          </div>
          <div class="rounded-md border bg-background px-3 py-2">
            <div class="text-xs text-muted-foreground">Guests</div>
            <div class="text-lg font-semibold">{totalGuests()}</div>
          </div>
          <div class="rounded-md border bg-background px-3 py-2">
            <div class="text-xs text-muted-foreground">Pending</div>
            <div class="text-lg font-semibold">{pendingGuests()}</div>
          </div>
        </div>
      </div>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      {#each data.events as event}
        <article
          class={`overflow-hidden rounded-lg border bg-card transition ${isPastEvent(event) ? 'border-border/70 bg-muted/20 opacity-60 grayscale' : 'border-border shadow-sm hover:shadow-md'}`}
        >
          <div class="grid gap-0 lg:grid-cols-[220px_1fr_auto]">
            <a class="relative block min-h-[150px] bg-muted" href={`/events/${event.id}`}>
              {#if event.cover_url}
                <img class="absolute inset-0 size-full object-cover" src={event.cover_url} alt={event.name} loading="lazy" />
              {:else}
                <div class="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#f1f5f9,#e2e8f0)] text-4xl font-semibold text-muted-foreground">
                  {event.name.slice(0, 1)}
                </div>
              {/if}
              {#if isPastEvent(event)}
                <div class="absolute inset-0 bg-background/35"></div>
              {/if}
            </a>

            <div class="flex min-w-0 flex-col gap-3 p-4">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant={eventTone(event)}>{relativeEventTime(event)}</Badge>
                <Badge variant="outline">{eventVisibility(event.raw_json, event.status) ?? 'status unknown'}</Badge>
                {#if event.timezone}
                  <Badge variant="outline">{event.timezone}</Badge>
                {/if}
              </div>

              <div class="min-w-0">
                <a class="text-lg font-semibold tracking-tight hover:underline" href={`/events/${event.id}`}>{event.name}</a>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{formatDate(event.start_at)}</span>
                  {#if event.end_at}
                    <span>Ends {formatDate(event.end_at)}</span>
                  {/if}
                  <span>{event.luma_event_id}</span>
                </div>
              </div>

              {#if eventDescription(event.raw_json) || eventLocation(event.raw_json) || eventHosts(event.raw_json).length}
                <div class="grid gap-2 text-sm md:grid-cols-3">
                  {#if eventDescription(event.raw_json)}
                    <div class="md:col-span-2">
                      <div class="text-xs font-medium uppercase text-muted-foreground">Description</div>
                      <p class="mt-1 max-h-14 overflow-hidden text-foreground/85">{eventDescription(event.raw_json)}</p>
                    </div>
                  {/if}
                  <div class="flex flex-col gap-2">
                    {#if eventLocation(event.raw_json)}
                      <div>
                        <div class="text-xs font-medium uppercase text-muted-foreground">Location</div>
                        <div class="mt-1">{eventLocation(event.raw_json)}</div>
                      </div>
                    {/if}
                    {#if eventHosts(event.raw_json).length}
                      <div>
                        <div class="text-xs font-medium uppercase text-muted-foreground">Hosts</div>
                        <div class="mt-1">{eventHosts(event.raw_json).slice(0, 3).join(', ')}</div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {#if eventCapacity(event.raw_json)}
                  <span class="rounded border bg-background px-2 py-1">Capacity {eventCapacity(event.raw_json)}</span>
                {/if}
                <span class="rounded border bg-background px-2 py-1">{rawFieldNames(event.raw_json).length} Luma fields stored</span>
                <span class="rounded border bg-background px-2 py-1">Last sync {event.last_synced_at ? formatDate(event.last_synced_at) : 'Never'}</span>
              </div>

              <details class="text-xs">
                <summary class="cursor-pointer text-muted-foreground hover:text-foreground">Raw Luma context</summary>
                <div class="mt-2 flex flex-wrap gap-1">
                  {#each rawFieldNames(event.raw_json).slice(0, 18) as field}
                    <span class="rounded bg-muted px-2 py-1">{field}</span>
                  {/each}
                </div>
                <pre class="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{rawJsonPreview(event.raw_json)}</pre>
              </details>
            </div>

            <div class="flex flex-col justify-between gap-4 border-t p-4 lg:min-w-[260px] lg:border-l lg:border-t-0">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="rounded-md border bg-background p-2">
                  <div class="text-xs text-muted-foreground">Guests</div>
                  <div class="text-xl font-semibold">{event.guest_count}</div>
                </div>
                <div class="rounded-md border bg-background p-2">
                  <div class="text-xs text-muted-foreground">Pending</div>
                  <div class="text-xl font-semibold">{event.pending_count}</div>
                </div>
                <div class="rounded-md border bg-background p-2">
                  <div class="text-xs text-muted-foreground">Approved</div>
                  <div class="text-xl font-semibold">{event.approved_count}</div>
                </div>
                <div class="rounded-md border bg-background p-2">
                  <div class="text-xs text-muted-foreground">Waitlist</div>
                  <div class="text-xl font-semibold">{event.waitlist_count}</div>
                </div>
              </div>

              <div class="flex flex-wrap justify-end gap-2">
                {#if event.url}
                  <Button variant="outline" size="sm" href={event.url}>
                    <ExternalLink data-icon="inline-start" /> Luma
                  </Button>
                {/if}
                <Button variant="default" size="sm" href={`/events/${event.id}`}>
                  <RefreshCw data-icon="inline-start" /> Review
                </Button>
              </div>
            </div>
          </div>
        </article>
      {:else}
        <div class="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No events imported yet.
        </div>
      {/each}
    </Card.Content>
  </Card.Root>

  {#if data.syncRuns.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Recent imports</Card.Title>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Type</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Records</Table.Head>
              <Table.Head>Started</Table.Head>
              <Table.Head>Error</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.syncRuns as run}
              <Table.Row>
                <Table.Cell>{run.type}</Table.Cell>
                <Table.Cell><Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'}>{run.status}</Badge></Table.Cell>
                <Table.Cell>{run.records_seen}</Table.Cell>
                <Table.Cell>{formatDate(run.started_at)}</Table.Cell>
                <Table.Cell class="max-w-[520px] truncate">{run.error ?? ''}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</main>
