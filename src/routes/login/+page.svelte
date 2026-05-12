<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let { data, form } = $props();

  function configuredAdminEmails() {
    const formWithAdmins = form as { adminEmails?: string[] } | undefined;
    return formWithAdmins?.adminEmails ?? data.adminEmails;
  }
</script>

<main class="grid min-h-screen place-items-center bg-muted/30 px-4 py-10">
  <Card.Root class="w-full max-w-md">
    <Card.Header>
      <Card.Title>{data.setupMode ? 'Create admin' : 'Sign in'}</Card.Title>
      <Card.Description>
        {#if data.setupMode}
          Use an email from ADMIN_EMAILS to bootstrap the private console.
        {:else}
          Access is limited to invited reviewers.
        {/if}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if data.setupMode}
        <div class="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {#if configuredAdminEmails().length}
            <div class="font-medium">Allowed first admin</div>
            <div class="mt-1 text-muted-foreground">{configuredAdminEmails().join(', ')}</div>
          {:else}
            <div class="font-medium text-destructive">ADMIN_EMAILS is not configured</div>
            <div class="mt-1 text-muted-foreground">Add it to .env, then restart the dev server.</div>
          {/if}
        </div>
      {/if}
      <form class="flex flex-col gap-4" method="POST">
        <input type="hidden" name="next" value={data.next} />
        <label class="flex flex-col gap-2 text-sm font-medium">
          Email
          <Input name="email" type="text" inputmode="email" autocomplete="email" value={form?.email ?? ''} required />
        </label>
        <label class="flex flex-col gap-2 text-sm font-medium">
          Password
          <Input
            name="password"
            type="password"
            autocomplete={data.setupMode ? 'new-password' : 'current-password'}
            minlength={data.setupMode ? 12 : undefined}
            required
          />
        </label>
        {#if form?.message}
          <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {form.message}
          </p>
        {/if}
        <Button type="submit">{data.setupMode ? 'Create admin account' : 'Sign in'}</Button>
      </form>
    </Card.Content>
  </Card.Root>
</main>
