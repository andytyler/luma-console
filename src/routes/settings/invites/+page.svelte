<script lang="ts">
  import { Copy, UserPlus } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';

  let { data, form } = $props();
</script>

<main class="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Reviewer invites</h1>
    <p class="mt-1 text-sm text-muted-foreground">Invite teammates without exposing API keys.</p>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Create invite</Card.Title>
      <Card.Description>Invite links expire after seven days.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-3 md:grid-cols-[1fr_180px_auto]" method="POST" action="?/create">
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
        <p class="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {form.message}
        </p>
      {/if}
      {#if form?.inviteUrl}
        <div class="mt-4 flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span class="font-medium">Invite URL</span>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded bg-background px-2 py-1">{form.inviteUrl}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => navigator.clipboard.writeText(form.inviteUrl)}
            >
              <Copy data-icon="inline-start" /> Copy
            </Button>
          </div>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <div class="grid gap-6 lg:grid-cols-2">
    <Card.Root>
      <Card.Header>
        <Card.Title>Users</Card.Title>
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
                  <Badge variant={invite.accepted_at ? 'secondary' : 'outline'}>
                    {invite.accepted_at ? 'accepted' : 'pending'}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  </div>
</main>
