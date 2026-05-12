<script lang="ts">
  import {
    Download,
    ExternalLink,
    GitBranch,
    Play,
    RefreshCw,
    Search,
    Sparkles,
    UserCheck,
    UserMinus,
    Users
  } from '@lucide/svelte';
  import GithubHeatmap from '$lib/components/GithubHeatmap.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';

  let { data, form } = $props();

  const reviewStatuses = [
    'needs_review',
    'approve_candidate',
    'pool',
    'reject_candidate',
    'approved',
    'rejected'
  ];

  function formatDate(value: string | null) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function countFor(status: string) {
    return data.statusCounts.find((row) => row.status_internal === status)?.count ?? 0;
  }

  function statusVariant(status: string) {
    if (status === 'approve_candidate' || status === 'approved') return 'default';
    if (status === 'reject_candidate' || status === 'rejected') return 'destructive';
    if (status === 'pool') return 'secondary';
    return 'outline';
  }

  function scoreClass(score: number) {
    if (score >= 78) return 'text-emerald-700';
    if (score >= 58) return 'text-amber-700';
    if (score >= 38) return 'text-neutral-700';
    return 'text-destructive';
  }

  function jobCount(type: string, status: string) {
    return data.jobs.find((job) => job.type === type && job.status === status)?.count ?? 0;
  }

  function jobTotal(status: string) {
    return data.jobs
      .filter((job) => job.status === status)
      .reduce((total, job) => total + job.count, 0);
  }
</script>

<main class="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="truncate text-2xl font-semibold tracking-tight">{data.event.name}</h1>
        {#if data.event.url}
          <Button variant="outline" size="sm" href={data.event.url}>
            <ExternalLink data-icon="inline-start" /> Luma
          </Button>
        {/if}
      </div>
      <p class="mt-1 text-sm text-muted-foreground">
        {formatDate(data.event.start_at)} · {data.event.guest_count} guests · last synced {formatDate(data.event.last_synced_at)}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <form method="POST" action="?/syncGuests">
        <Button type="submit" disabled={!data.lumaConfigured}>
          <RefreshCw data-icon="inline-start" /> Sync guests
        </Button>
      </form>
      <Button variant="outline" href={`/api/export?event_id=${data.event.id}`}>
        <Download data-icon="inline-start" /> Export CSV
      </Button>
    </div>
  </div>

  {#if form?.message}
    <Card.Root>
      <Card.Content class="py-4 text-sm">{form.message}</Card.Content>
    </Card.Root>
  {/if}

  {#if data.batch}
    <Card.Root>
      <Card.Content class="py-4 text-sm">
        Batch {data.batch.status === 'applied' ? 'applied' : 'dry-run completed'} for {data.batch.count} guests.
      </Card.Content>
    </Card.Root>
  {/if}

  <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
    {#each reviewStatuses as status}
      <Card.Root>
        <Card.Content class="flex items-center justify-between py-4">
          <div class="text-sm text-muted-foreground">{status.replaceAll('_', ' ')}</div>
          <div class="text-xl font-semibold">{countFor(status)}</div>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Filters</Card.Title>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-3 md:grid-cols-[1fr_180px_160px_150px_auto]" method="GET">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input class="pl-8" name="q" placeholder="Search name, email, company, title" value={data.filters.q} />
        </div>
        <select class="h-9 rounded-md border bg-background px-2 text-sm" name="status">
          <option value="">All statuses</option>
          {#each reviewStatuses as status}
            <option value={status} selected={data.filters.status === status}>{status.replaceAll('_', ' ')}</option>
          {/each}
        </select>
        <select class="h-9 rounded-md border bg-background px-2 text-sm" name="github">
          <option value="" selected={data.filters.github === ''}>GitHub any</option>
          <option value="found" selected={data.filters.github === 'found'}>GitHub found</option>
          <option value="missing" selected={data.filters.github === 'missing'}>GitHub missing</option>
        </select>
        <label class="flex h-9 items-center gap-2 rounded-md border px-2 text-sm">
          <input type="checkbox" name="prior" value="true" checked={data.filters.prior} />
          Prior attendee
        </label>
        <Button type="submit">Apply</Button>
      </form>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Enrichment</Card.Title>
      <Card.Description>
        Queue external lookups separately from scoring; BrightData jobs use profile credits when a LinkedIn URL is present.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-md border p-3">
          <div class="text-sm text-muted-foreground">Queued</div>
          <div class="text-2xl font-semibold">{jobTotal('queued')}</div>
        </div>
        <div class="rounded-md border p-3">
          <div class="text-sm text-muted-foreground">Running</div>
          <div class="text-2xl font-semibold">{jobTotal('running')}</div>
        </div>
        <div class="rounded-md border p-3">
          <div class="text-sm text-muted-foreground">Succeeded</div>
          <div class="text-2xl font-semibold">{jobTotal('succeeded')}</div>
        </div>
        <div class="rounded-md border p-3">
          <div class="text-sm text-muted-foreground">Failed</div>
          <div class="text-2xl font-semibold">{jobTotal('failed')}</div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <form method="POST" action="?/queueGithub">
          <Button type="submit" variant="outline">
            <GitBranch data-icon="inline-start" /> Queue GitHub
          </Button>
        </form>
        <form method="POST" action="?/queueLinkedin">
          <Button type="submit" variant="outline">
            <Sparkles data-icon="inline-start" /> Queue BrightData
          </Button>
        </form>
        <form method="POST" action="?/queueScore">
          <Button type="submit" variant="outline">Queue scoring</Button>
        </form>
        <form class="flex gap-2" method="POST" action="?/runJobs">
          <Input class="w-20" name="limit" type="number" min="1" max="25" value="10" />
          <Button type="submit">
            <Play data-icon="inline-start" /> Run jobs
          </Button>
        </form>
      </div>

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Type</Table.Head>
            <Table.Head>Queued</Table.Head>
            <Table.Head>Running</Table.Head>
            <Table.Head>Succeeded</Table.Head>
            <Table.Head>Failed</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each ['github', 'brightdata_linkedin', 'score'] as type}
            <Table.Row>
              <Table.Cell>{type.replaceAll('_', ' ')}</Table.Cell>
              <Table.Cell>{jobCount(type, 'queued')}</Table.Cell>
              <Table.Cell>{jobCount(type, 'running')}</Table.Cell>
              <Table.Cell>{jobCount(type, 'succeeded')}</Table.Cell>
              <Table.Cell>{jobCount(type, 'failed')}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      {#if data.failedJobs.length > 0}
        <div class="flex flex-col gap-2 rounded-md border border-destructive/30 p-3">
          <div class="text-sm font-medium text-destructive">Recent failed jobs</div>
          {#each data.failedJobs as job}
            <div class="text-sm">
              <span class="font-medium">{job.type.replaceAll('_', ' ')}</span>
              <span class="text-muted-foreground"> · {job.guest_name ?? job.guest_email}</span>
              <div class="text-xs text-muted-foreground">{job.error}</div>
            </div>
          {/each}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Batch actions</Card.Title>
      <Card.Description>
        Internal candidate states stay separate from Luma. Real Luma writes require LUMA_WRITES_ENABLED=true and confirmation text.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4 lg:grid-cols-2">
      <div class="flex flex-col gap-3 rounded-md border p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="font-medium">Approve candidates</div>
            <div class="text-sm text-muted-foreground">{countFor('approve_candidate')} guests selected</div>
          </div>
        </div>
        <form class="flex flex-col gap-3" method="POST" action="/api/batches/apply">
          <input type="hidden" name="event_id" value={data.event.id} />
          <input type="hidden" name="source_status" value="approve_candidate" />
          <input type="hidden" name="luma_status" value="approved" />
          <input type="hidden" name="dry_run" value="true" />
          <input type="hidden" name="next" value={data.next} />
          <Textarea name="message" placeholder="Optional Luma approval message" rows={3}></Textarea>
          <Button type="submit" variant="outline">Dry-run approval batch</Button>
        </form>
        <form class="grid gap-2 md:grid-cols-[1fr_auto]" method="POST" action="/api/batches/apply">
          <input type="hidden" name="event_id" value={data.event.id} />
          <input type="hidden" name="source_status" value="approve_candidate" />
          <input type="hidden" name="luma_status" value="approved" />
          <input type="hidden" name="dry_run" value="false" />
          <input type="hidden" name="next" value={data.next} />
          <Textarea class="md:col-span-2" name="message" placeholder="Optional Luma approval message" rows={2}></Textarea>
          <Input name="confirm" placeholder="Type APPLY" />
          <Button type="submit" disabled={!data.lumaWritesEnabled}>Apply to Luma</Button>
        </form>
      </div>

      <div class="flex flex-col gap-3 rounded-md border p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="font-medium">Reject candidates</div>
            <div class="text-sm text-muted-foreground">{countFor('reject_candidate')} guests selected</div>
          </div>
        </div>
        <form class="flex flex-col gap-3" method="POST" action="/api/batches/apply">
          <input type="hidden" name="event_id" value={data.event.id} />
          <input type="hidden" name="source_status" value="reject_candidate" />
          <input type="hidden" name="luma_status" value="declined" />
          <input type="hidden" name="dry_run" value="true" />
          <input type="hidden" name="next" value={data.next} />
          <Textarea name="message" placeholder="Optional Luma rejection message" rows={3}></Textarea>
          <Button type="submit" variant="outline">Dry-run rejection batch</Button>
        </form>
        <form class="grid gap-2 md:grid-cols-[1fr_auto]" method="POST" action="/api/batches/apply">
          <input type="hidden" name="event_id" value={data.event.id} />
          <input type="hidden" name="source_status" value="reject_candidate" />
          <input type="hidden" name="luma_status" value="declined" />
          <input type="hidden" name="dry_run" value="false" />
          <input type="hidden" name="next" value={data.next} />
          <Textarea class="md:col-span-2" name="message" placeholder="Optional Luma rejection message" rows={2}></Textarea>
          <Input name="confirm" placeholder="Type APPLY" />
          <Button type="submit" variant="destructive" disabled={!data.lumaWritesEnabled}>Apply to Luma</Button>
        </form>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Guest review</Card.Title>
      <Card.Description>
        Showing {data.guests.length} guests. Enrichment jobs can run one-at-a-time from the UI or continuously with the worker.
      </Card.Description>
    </Card.Header>
    <Card.Content class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-[76px]">Score</Table.Head>
            <Table.Head class="w-[150px]">State</Table.Head>
            <Table.Head class="min-w-[220px]">Person</Table.Head>
            <Table.Head class="min-w-[250px]">Profile</Table.Head>
            <Table.Head class="min-w-[220px]">GitHub</Table.Head>
            <Table.Head class="min-w-[260px]">Answers</Table.Head>
            <Table.Head class="min-w-[260px]">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.guests as guest}
            <Table.Row>
              <Table.Cell>
                <div class={`text-2xl font-semibold ${scoreClass(guest.score)}`}>{guest.score}</div>
                {#if guest.score_locked}
                  <Badge variant="outline">locked</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col gap-2">
                  <Badge variant={statusVariant(guest.status_internal)}>
                    {guest.status_internal.replaceAll('_', ' ')}
                  </Badge>
                  {#if guest.approval_status}
                    <span class="text-xs text-muted-foreground">Luma: {guest.approval_status}</span>
                  {/if}
                  {#if guest.prior_attended_count > 0}
                    <Badge variant="secondary">
                      <Users data-icon="inline-start" /> {guest.prior_attended_count} prior
                    </Badge>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col gap-1">
                  <div class="font-medium">{guest.name ?? 'No name'}</div>
                  <a class="text-sm text-muted-foreground hover:underline" href={`mailto:${guest.email}`}>{guest.email}</a>
                  <span class="text-xs text-muted-foreground">Registered {formatDate(guest.registered_at)}</span>
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col gap-2">
                  <div>
                    <div class="font-medium">{guest.current_title ?? 'No title yet'}</div>
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                      {#if guest.favicon_url}
                        <img class="size-4 rounded-sm" src={guest.favicon_url} alt="" />
                      {/if}
                      <span>{guest.current_company ?? 'No company yet'}</span>
                    </div>
                  </div>
                  {#if guest.past_titles.length}
                    <div class="text-xs text-muted-foreground">
                      Past: {guest.past_titles.slice(0, 3).join(', ')}
                    </div>
                  {/if}
                  {#if guest.linkedin_url}
                    <a class="text-xs text-primary hover:underline" href={guest.linkedin_url}>LinkedIn</a>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col gap-2">
                  {#if guest.github_username}
                    <a class="inline-flex items-center gap-1 text-sm font-medium hover:underline" href={`https://github.com/${guest.github_username}`}>
                      <GitBranch class="size-4" /> {guest.github_username}
                    </a>
                    <GithubHeatmap weeks={guest.weeks} />
                    <div class="text-xs text-muted-foreground">
                      {guest.contribution_total ?? 0} contributions · {guest.public_repos ?? 0} repos · {guest.followers ?? 0} followers
                    </div>
                  {:else}
                    <span class="text-sm text-muted-foreground">No GitHub profile yet</span>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell>
                <details class="max-w-[320px] text-sm">
                  <summary class="cursor-pointer text-muted-foreground">{guest.answers.length} answers</summary>
                  <div class="mt-2 flex flex-col gap-2">
                    {#each guest.answers as answer}
                      <div>
                        <div class="font-medium">{answer.question}</div>
                        <div class="text-muted-foreground">{answer.answer || 'No answer'}</div>
                      </div>
                    {/each}
                  </div>
                </details>
                {#if guest.notes}
                  <div class="mt-2 rounded-md bg-muted p-2 text-xs">{guest.notes}</div>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col gap-2">
                  <div class="flex flex-wrap gap-1">
                    <form method="POST" action={`/api/guests/${guest.id}/decision`}>
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="status" value="approve_candidate" />
                      <Button type="submit" size="xs" variant="outline">
                        <UserCheck data-icon="inline-start" /> Approve
                      </Button>
                    </form>
                    <form method="POST" action={`/api/guests/${guest.id}/decision`}>
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="status" value="pool" />
                      <Button type="submit" size="xs" variant="outline">Pool</Button>
                    </form>
                    <form method="POST" action={`/api/guests/${guest.id}/decision`}>
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="status" value="reject_candidate" />
                      <Button type="submit" size="xs" variant="destructive">
                        <UserMinus data-icon="inline-start" /> Reject
                      </Button>
                    </form>
                  </div>

                  <div class="flex flex-wrap gap-1">
                    <form method="POST" action={`/api/guests/${guest.id}/enrich`}>
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="type" value="github" />
                      <input type="hidden" name="type" value="brightdata_linkedin" />
                      <input type="hidden" name="type" value="score" />
                      <Button type="submit" size="xs" variant="outline">
                        <Sparkles data-icon="inline-start" /> Enrich
                      </Button>
                    </form>
                    <form method="POST" action={`/api/guests/${guest.id}/score`}>
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="mode" value="rescore" />
                      <Button type="submit" size="xs" variant="outline">Re-score</Button>
                    </form>
                  </div>

                  <form class="flex flex-col gap-1" method="POST" action={`/api/guests/${guest.id}/note`}>
                    <input type="hidden" name="next" value={data.next} />
                    <Textarea name="notes" rows={2} placeholder="Reviewer note" value={guest.notes}></Textarea>
                    <Button type="submit" size="xs" variant="outline">Save note</Button>
                  </form>
                </div>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={7} class="py-10 text-center text-sm text-muted-foreground">
                No guests match these filters.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</main>
