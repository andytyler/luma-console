<script lang="ts">
  import { CalendarSync, ExternalLink, RefreshCw, UsersRound, Webhook } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Table from '$lib/components/ui/table/index.js';

  let { data, form } = $props();

  function formatDate(value: string | null) {
    if (!value) return 'No date';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function formDetails() {
    const candidate = form as { details?: string[] } | undefined;
    return Array.isArray(candidate?.details) ? candidate.details : [];
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
      <Card.Title>Luma events</Card.Title>
      <Card.Description>{data.events.length} events stored locally.</Card.Description>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Event</Table.Head>
            <Table.Head>Date</Table.Head>
            <Table.Head>Guests</Table.Head>
            <Table.Head>Status mix</Table.Head>
            <Table.Head>Last sync</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.events as event}
            <Table.Row>
              <Table.Cell>
                <div class="flex flex-col gap-1">
                  <a class="font-medium hover:underline" href={`/events/${event.id}`}>{event.name}</a>
                  <span class="text-xs text-muted-foreground">{event.luma_event_id}</span>
                </div>
              </Table.Cell>
              <Table.Cell>{formatDate(event.start_at)}</Table.Cell>
              <Table.Cell>{event.guest_count}</Table.Cell>
              <Table.Cell>
                <div class="flex flex-wrap gap-1">
                  <Badge variant="outline">{event.pending_count} pending</Badge>
                  <Badge variant="secondary">{event.approved_count} approved</Badge>
                  <Badge variant="outline">{event.waitlist_count} waitlist</Badge>
                </div>
              </Table.Cell>
              <Table.Cell>{event.last_synced_at ? formatDate(event.last_synced_at) : 'Never'}</Table.Cell>
              <Table.Cell>
                <div class="flex justify-end gap-2">
                  {#if event.url}
                    <Button variant="outline" size="sm" href={event.url}>
                      <ExternalLink data-icon="inline-start" /> Luma
                    </Button>
                  {/if}
                  <Button variant="default" size="sm" href={`/events/${event.id}`}>
                    <RefreshCw data-icon="inline-start" /> Review
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={6} class="py-10 text-center text-sm text-muted-foreground">
                No events imported yet.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
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
