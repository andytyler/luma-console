<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let { data, form } = $props();
</script>

<main class="grid min-h-screen place-items-center bg-muted/30 px-4 py-10">
  <Card.Root class="w-full max-w-md">
    <Card.Header>
      <Card.Title>Accept invite</Card.Title>
      <Card.Description>
        {#if data.invite}
          Create a password for {data.invite.email}.
        {:else}
          This invite link is invalid or expired.
        {/if}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if data.invite}
        <form class="flex flex-col gap-4" method="POST">
          <input type="hidden" name="token" value={data.token} />
          <label class="flex flex-col gap-2 text-sm font-medium">
            Password
            <Input name="password" type="password" autocomplete="new-password" minlength={12} required />
          </label>
          {#if form?.message}
            <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {form.message}
            </p>
          {/if}
          <Button type="submit">Create account</Button>
        </form>
      {:else}
        <Button variant="outline" href="/login">Back to login</Button>
      {/if}
    </Card.Content>
  </Card.Root>
</main>
