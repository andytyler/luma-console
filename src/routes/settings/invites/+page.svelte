<script lang="ts">
  import { Send, UserPlus } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';

  let { data, form } = $props();
</script>

<main class="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Calendar invites</h1>
      <p class="mt-1 text-sm text-muted-foreground">Invite Luma calendar admins, managers, hosts, and reviewers without exposing API keys.</p>
    </div>
    {#if data.calendars.length > 1}
      <form method="GET">
        <select class="h-9 rounded-md border bg-background px-2 text-sm" name="calendar_id" onchange={(event) => event.currentTarget.form?.submit()}>
          {#each data.calendars as calendar}
            <option value={calendar.id} selected={data.selectedCalendarId === calendar.id}>{calendar.name}</option>
          {/each}
        </select>
      </form>
    {/if}
  </div>

  <Card.Root>
    <Card.Header class="flex flex-row items-start justify-between gap-4">
      <div>
        <Card.Title>Send invites</Card.Title>
        <Card.Description>
          `INVITE_EMAILS_ENABLED=false` records dry-runs only. Turn it on with Resend configured to send real email.
        </Card.Description>
      </div>
      <form method="POST" action="?/sendAll">
        <input type="hidden" name="calendar_id" value={data.selectedCalendarId} />
        <Button type="submit">
          <Send data-icon="inline-start" /> Send invites
        </Button>
      </form>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-3 md:grid-cols-[1fr_180px_auto]" method="POST" action="?/create">
        <input type="hidden" name="calendar_id" value={data.selectedCalendarId} />
        <Input name="email" type="text" inputmode="email" placeholder="teammate@example.com" required />
        <Select.Root type="single" name="role" value="reviewer">
          <Select.Trigger class="w-full">Reviewer</Select.Trigger>
          <Select.Content>
            <Select.Group>
              <Select.Item value="reviewer">Reviewer</Select.Item>
              <Select.Item value="admin">Admin</Select.Item>
            </Select.Group>
          </Select.Content>
        </Select.Root>
        <Button type="submit">
          <UserPlus data-icon="inline-start" /> Create invite
        </Button>
      </form>

      {#if form?.message}
        <p class="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {form.message}
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <div class="grid gap-6 xl:grid-cols-3">
    <Card.Root>
      <Card.Header>
        <Card.Title>Luma people</Card.Title>
        <Card.Description>{data.people.length} people discovered from the calendar payload.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Person</Table.Head>
              <Table.Head>Role</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.people as person}
              <Table.Row>
                <Table.Cell>
                  <div class="flex items-center gap-2">
                    {#if person.avatar_url}
                      <img class="size-6 rounded-full" src={person.avatar_url} alt="" />
                    {/if}
                    <div class="min-w-0">
                      <div class="truncate">{person.name ?? person.email}</div>
                      <div class="truncate text-xs text-muted-foreground">{person.email}</div>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge variant={person.app_role === 'admin' ? 'secondary' : 'outline'}>{person.app_role}</Badge>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Members</Card.Title>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Email</Table.Head>
              <Table.Head>Role</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.users as user}
              <Table.Row>
                <Table.Cell>{user.email}</Table.Cell>
                <Table.Cell><Badge variant="secondary">{user.role}</Badge></Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Recent invites</Card.Title>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Email</Table.Head>
              <Table.Head>Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.invites as invite}
              <Table.Row>
                <Table.Cell>{invite.email}</Table.Cell>
                <Table.Cell>
                  <Badge variant={invite.accepted_at ? 'secondary' : invite.send_status === 'failed' ? 'destructive' : 'outline'}>
                    {invite.accepted_at ? 'accepted' : invite.send_status}
                  </Badge>
                  {#if invite.last_error}
                    <div class="mt-1 text-xs text-destructive">{invite.last_error}</div>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  </div>
</main>
