<script lang="ts">
  import { AlertCircle, CalendarDays, CheckCircle2, CircleHelp, ExternalLink, GitBranch, Search, Sparkles } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';

  let { data, form } = $props();

  type Diagnostic = {
    provider: string;
    title: string;
    url: string;
    summary: Record<string, unknown>;
    rawJson: string;
  };

  const diagnostic = $derived(
    (form as { diagnostic?: Diagnostic } | null | undefined)?.diagnostic ?? null
  );
  const formIntent = $derived((form as { intent?: string } | null | undefined)?.intent ?? null);
  const formMessage = $derived((form as { message?: string } | null | undefined)?.message ?? null);
  const githubInput = $derived((form as { githubInput?: string } | null | undefined)?.githubInput ?? '');
  const linkedinInput = $derived(
    (form as { linkedinInput?: string } | null | undefined)?.linkedinInput ?? ''
  );

  function statusVariant(connected: boolean) {
    return connected ? 'default' : 'outline';
  }

  function statusLabel(connected: boolean) {
    return connected ? 'Connected' : 'Needs setup';
  }

  function shortDate(value: string | null) {
    if (!value) return 'Never synced';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function displayValue(value: unknown) {
    if (value === null || value === undefined || value === '') return 'n/a';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
</script>

<Tooltip.Provider delayDuration={100}>
  <main class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Setup</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Connect these three pieces to import guests, enrich profiles, and show GitHub activity.
        </p>
      </div>
      <Button href="/onboarding">
        <CalendarDays data-icon="inline-start" /> Connect Luma
      </Button>
    </div>

    <div class="grid gap-3 lg:grid-cols-3">
      <Card.Root>
        <Card.Header class="pb-2">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <CalendarDays class="size-4" />
              <Card.Title class="text-base">Luma</Card.Title>
            </div>
            <div class="flex items-center gap-1">
              <Badge variant={statusVariant(data.integrations.luma.connected)}>
                {#if data.integrations.luma.connected}
                  <CheckCircle2 data-icon="inline-start" />
                {:else}
                  <AlertCircle data-icon="inline-start" />
                {/if}
                {statusLabel(data.integrations.luma.connected)}
              </Badge>
              <Tooltip.Root>
                <Tooltip.Trigger class="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <CircleHelp class="size-4" />
                </Tooltip.Trigger>
                <Tooltip.Content
                  side="top"
                  class="max-w-72 flex-col items-start gap-1 border bg-popover text-popover-foreground shadow-md"
                >
                  <div class="font-medium">What this unlocks</div>
                  <div>Imports calendars, events, guests, registration answers, cover images, and attendance.</div>
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm">
          <div class="rounded-md border bg-muted/30 p-2">
            <div class="font-medium">{data.integrations.luma.calendarCount} connected calendar{data.integrations.luma.calendarCount === 1 ? '' : 's'}</div>
            <div class="text-xs text-muted-foreground">
              {data.integrations.luma.globalConfigured ? 'Global LUMA_API_KEY is also set.' : 'Use onboarding to store calendar keys securely.'}
            </div>
          </div>
          <ol class="list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Get a Luma API key from Luma developer settings.</li>
            <li>Paste it into onboarding.</li>
            <li>Sync events, then sync guests.</li>
          </ol>
          <div class="flex flex-wrap gap-1">
            <Badge variant={data.integrations.luma.webhookConfigured ? 'secondary' : 'outline'}>
              Webhook {data.integrations.luma.webhookConfigured ? 'set' : 'optional'}
            </Badge>
            <Badge variant={data.integrations.luma.writesEnabled ? 'secondary' : 'outline'}>
              Writes {data.integrations.luma.writesEnabled ? 'enabled' : 'off'}
            </Badge>
          </div>
          <form method="POST" action="?/toggleLumaWrites">
            <input
              type="hidden"
              name="enabled"
              value={data.integrations.luma.writesEnabled ? 'false' : 'true'}
            />
            <Button
              type="submit"
              size="sm"
              variant={data.integrations.luma.writesEnabled ? 'destructive' : 'outline'}
            >
              {data.integrations.luma.writesEnabled ? 'Disable Luma writes' : 'Enable Luma writes'}
            </Button>
          </form>
          {#if formIntent === 'lumaWrites' && formMessage}
            <div class="rounded-md border bg-muted/40 px-2 py-1 text-xs">{formMessage}</div>
          {/if}
          <p class="text-xs text-muted-foreground">
            Keep writes off while importing and reviewing. Even when enabled, batch apply still requires typing APPLY.
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header class="pb-2">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <GitBranch class="size-4" />
              <Card.Title class="text-base">GitHub</Card.Title>
            </div>
            <div class="flex items-center gap-1">
              <Badge variant={statusVariant(data.integrations.github.connected)}>
                {#if data.integrations.github.connected}
                  <CheckCircle2 data-icon="inline-start" />
                {:else}
                  <AlertCircle data-icon="inline-start" />
                {/if}
                {statusLabel(data.integrations.github.connected)}
              </Badge>
              <Tooltip.Root>
                <Tooltip.Trigger class="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <CircleHelp class="size-4" />
                </Tooltip.Trigger>
                <Tooltip.Content
                  side="top"
                  class="max-w-72 flex-col items-start gap-1 border bg-popover text-popover-foreground shadow-md"
                >
                  <div class="font-medium">What this unlocks</div>
                  <div>Finds GitHub profiles and renders contribution graphs, repos, followers, and activity totals.</div>
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm">
          <div class="rounded-md border bg-muted/30 p-2">
            <div class="font-medium">{data.integrations.github.connected ? 'GITHUB_TOKEN is set' : 'Set GITHUB_TOKEN'}</div>
            <div class="text-xs text-muted-foreground">Used server-side for GitHub GraphQL only.</div>
          </div>
          <ol class="list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Create a GitHub token with public profile access.</li>
            <li>Add `GITHUB_TOKEN` to Railway or `.env`.</li>
            <li>Queue GitHub enrichment on an event.</li>
          </ol>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header class="pb-2">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <Sparkles class="size-4" />
              <Card.Title class="text-base">BrightData</Card.Title>
            </div>
            <div class="flex items-center gap-1">
              <Badge variant={statusVariant(data.integrations.brightData.connected)}>
                {#if data.integrations.brightData.connected}
                  <CheckCircle2 data-icon="inline-start" />
                {:else}
                  <AlertCircle data-icon="inline-start" />
                {/if}
                {statusLabel(data.integrations.brightData.connected)}
              </Badge>
              <Tooltip.Root>
                <Tooltip.Trigger class="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <CircleHelp class="size-4" />
                </Tooltip.Trigger>
                <Tooltip.Content
                  side="top"
                  class="max-w-72 flex-col items-start gap-1 border bg-popover text-popover-foreground shadow-md"
                >
                  <div class="font-medium">What this unlocks</div>
                  <div>Uses LinkedIn URLs from registration data to enrich title, company, past roles, and company favicon.</div>
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm">
          <div class="rounded-md border bg-muted/30 p-2">
            <div class="font-medium">
              {data.integrations.brightData.connected ? 'BRIGHTDATA_API_KEY is set' : 'Set BRIGHTDATA_API_KEY'}
            </div>
            <div class="truncate text-xs text-muted-foreground">Dataset: {data.integrations.brightData.datasetId}</div>
          </div>
          <ol class="list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Add a LinkedIn URL question to Luma.</li>
            <li>Add `BRIGHTDATA_API_KEY` to Railway or `.env`.</li>
            <li>Queue BrightData enrichment on an event.</li>
          </ol>
        </Card.Content>
      </Card.Root>
    </div>

    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title class="text-base">Provider test</Card.Title>
        <Card.Description>
          Fetch one GitHub or LinkedIn profile without saving anything to a guest.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4 lg:grid-cols-2">
        <form class="flex flex-col gap-2 rounded-md border p-3" method="POST" action="?/testGithub">
          <div class="flex items-center gap-2 text-sm font-medium">
            <GitBranch class="size-4" /> GitHub
          </div>
          <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              name="github"
              placeholder="username or https://github.com/username"
              value={githubInput}
              autocomplete="off"
            />
            <Button type="submit" variant="outline" disabled={!data.integrations.github.connected}>
              <Search data-icon="inline-start" /> Fetch GitHub
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Uses `GITHUB_TOKEN` and GitHub GraphQL. It reads public profile/contribution data only.
          </p>
        </form>

        <form class="flex flex-col gap-2 rounded-md border p-3" method="POST" action="?/testBrightData">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Sparkles class="size-4" /> BrightData LinkedIn
          </div>
          <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              name="linkedin"
              placeholder="https://linkedin.com/in/you or /in/you"
              value={linkedinInput}
              autocomplete="off"
            />
            <Button type="submit" variant="outline" disabled={!data.integrations.brightData.connected}>
              <Search data-icon="inline-start" /> Fetch BrightData
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Uses `BRIGHTDATA_API_KEY` and the configured LinkedIn profile dataset. This may consume BrightData credits.
          </p>
        </form>

        {#if (formIntent === 'github' || formIntent === 'brightdata') && formMessage}
          <div class="rounded-md border bg-muted/40 px-2 py-1 text-xs lg:col-span-2">{formMessage}</div>
        {/if}

        {#if diagnostic}
          <div class="rounded-md border bg-muted/20 p-3 lg:col-span-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-sm font-medium">{diagnostic.title}</div>
                <div class="text-xs text-muted-foreground">{diagnostic.provider}</div>
              </div>
              <Button href={diagnostic.url} variant="outline" size="sm">
                <ExternalLink data-icon="inline-start" /> Open source
              </Button>
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {#each Object.entries(diagnostic.summary) as [key, value]}
                <div class="rounded-md border bg-background p-2">
                  <div class="text-xs text-muted-foreground">{key.replaceAll('_', ' ')}</div>
                  <div class="truncate text-sm font-medium" title={displayValue(value)}>{displayValue(value)}</div>
                </div>
              {/each}
            </div>
            <details class="mt-3">
              <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Raw response preview
              </summary>
              <pre class="mt-2 max-h-96 overflow-auto rounded-md bg-background p-3 text-[11px] leading-relaxed">{diagnostic.rawJson}</pre>
            </details>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Content class="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div class="font-medium">Connected Luma calendars</div>
          <div class="text-xs text-muted-foreground">This list only shows local setup state; it does not call Luma.</div>
        </div>
        <Button variant="outline" size="sm" href="/events">Open events</Button>
      </Card.Content>
      <Card.Content class="border-t pt-3">
        {#if data.calendars.length}
          <div class="grid gap-2 md:grid-cols-2">
            {#each data.calendars as calendar}
              <div class="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                <div class="min-w-0">
                  <div class="truncate font-medium">{calendar.name}</div>
                  <div class="text-xs text-muted-foreground">
                    {calendar.role} · {calendar.has_api_key ? (calendar.api_key_hint ?? 'key stored') : 'no stored key'} · {shortDate(calendar.last_synced_at)}
                  </div>
                </div>
                <Badge variant={calendar.has_api_key ? 'secondary' : 'outline'}>
                  {calendar.has_api_key ? 'Connected' : 'No key'}
                </Badge>
              </div>
            {/each}
          </div>
        {:else}
          <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No Luma calendars connected yet.
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </main>
</Tooltip.Provider>
