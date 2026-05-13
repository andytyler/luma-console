<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    ArrowRight,
    ArrowDownWideNarrow,
    CalendarClock,
    Clock3,
    Download,
    ExternalLink,
    Filter,
    GitFork,
    Image as ImageIcon,
    ListChecks,
    MapPin,
    RefreshCw,
    Search,
    Settings2,
    Sparkles,
    Trash2,
    Users,
    X
  } from '@lucide/svelte';
  import GithubHeatmap from '$lib/components/GithubHeatmap.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
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
  import {
    answerFor,
    attendanceMarker,
    currentAttendanceLabel,
    type AnswerColumn,
    displayAnswer,
    historyAttendanceLabel,
    humanStatus,
    questionTypeLabel
  } from '$lib/guest-review.js';
  import { calculateGuestScore, type ScoreReason } from '$lib/scoring-rules.js';
  import { cn } from '$lib/utils.js';

  let { data } = $props();
  type TableDensity = 'compact' | 'comfortable';
  let tableDensity = $state<TableDensity>('compact');
  let wrapAnswers = $state(false);
  let hoveredGuest = $state<{ id: string; email: string } | null>(null);
  let quickActionGuestId = $state<string | null>(null);
  type BatchNoteStatus = 'approved' | 'declined';
  let batchNoteDrafts = $state<Partial<Record<BatchNoteStatus, string>>>({});
  let linkedinDebugKey = $state('');

  function currentSort() {
    return (data.filters as typeof data.filters & { sort?: string }).sort ?? 'score_desc';
  }

  function batchNoteStatus(value: string): BatchNoteStatus {
    return value === 'declined' ? 'declined' : 'approved';
  }

  function batchNoteStorageKey(status: string) {
    return `luma-console:batch-note:${data.event.id}:${batchNoteStatus(status)}`;
  }

  function batchNoteValue(status: string) {
    const noteStatus = batchNoteStatus(status);
    return batchNoteDrafts[noteStatus] ?? data.batchNotes[noteStatus] ?? '';
  }

  function saveBatchNoteDraft(status: string, event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    const noteStatus = batchNoteStatus(status);
    batchNoteDrafts[noteStatus] = target.value;
    localStorage.setItem(batchNoteStorageKey(noteStatus), target.value);
  }

  onMount(() => {
    for (const status of ['approved', 'declined'] as const) {
      const stored = localStorage.getItem(batchNoteStorageKey(status));
      if (stored !== null) batchNoteDrafts[status] = stored;
    }
  });

  const reviewStatuses = [
    'needs_review',
    'approve_candidate',
    'pool',
    'reject_candidate',
    'approved',
    'rejected'
  ];

  function formatDate(value: string | null) {
    return value ? formatDateTime(value) : 'Never';
  }

  function countFor(status: string) {
    return data.statusCounts.find((row) => row.status_internal === status)?.count ?? 0;
  }

  function formatStatus(status: string) {
    return status.replaceAll('_', ' ');
  }

  function totalStatusCount() {
    return data.statusCounts.reduce((total, row) => total + row.count, 0);
  }

  function activeFilterCount() {
    return (
      (data.filters.q ? 1 : 0) +
      (data.filters.status ? 1 : 0) +
      (data.filters.github ? 1 : 0) +
      (data.filters.prior ? 1 : 0) +
      (currentSort() !== 'score_desc' ? 1 : 0)
    );
  }

  function statusVariant(status: string) {
    if (status === 'approve_candidate' || status === 'approved') return 'default';
    if (status === 'reject_candidate' || status === 'rejected') return 'destructive';
    if (status === 'pool') return 'secondary';
    return 'outline';
  }

  function lumaStatusVariant(status: string | null) {
    const normalized = (status ?? '').toLowerCase();
    if (['approved', 'going', 'checked_in', 'checked in'].includes(normalized)) return 'default';
    if (['declined', 'rejected', 'cancelled', 'canceled'].includes(normalized)) return 'destructive';
    if (normalized.includes('waitlist')) return 'secondary';
    return 'outline';
  }

  function rawLumaStatus(status: string | null) {
    return status || 'unknown';
  }

  function targetActionLabel(status: string | null) {
    if (status === 'approved') return 'Approve';
    if (status === 'declined') return 'Decline';
    return 'No action';
  }

  function targetActionTone(status: string | null) {
    if (status === 'approved') return 'text-emerald-700';
    if (status === 'declined') return 'text-destructive';
    return 'text-muted-foreground';
  }

  function actionMatchesLuma(guest: { approval_status: string | null; desired_luma_status: string | null }) {
    return !guest.desired_luma_status || rawLumaStatus(guest.approval_status) === guest.desired_luma_status;
  }

  function queuedTransitionCount() {
    return data.transitionCounts.reduce((total, transition) => total + transition.count, 0);
  }

  function transitionSampleText(transition: { sample_guests: { name: string | null; email: string }[]; count: number }) {
    const samples = transition.sample_guests
      .slice(0, 4)
      .map((guest) => guest.name || guest.email);
    const remaining = transition.count - samples.length;
    return `${samples.join(', ')}${remaining > 0 ? `, +${remaining} more` : ''}`;
  }

  function submitSelectChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    select.form?.requestSubmit();
  }

  function shouldIgnoreQuickAction(event: KeyboardEvent) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('input, textarea, select, button, a, [contenteditable="true"]')
    );
  }

  async function setHoveredGuestDesiredStatus(desiredStatus: 'approved' | 'declined' | '') {
    if (!hoveredGuest || quickActionGuestId) return;

    const guest = hoveredGuest;
    const table = document.getElementById('guest-table');
    const scroll = {
      x: window.scrollX,
      y: window.scrollY,
      tableLeft: table?.scrollLeft ?? 0
    };
    const toastId = toast.loading(`${targetActionLabel(desiredStatus)} ${guest.email}`);
    const formData = new FormData();
    formData.set('desired_luma_status', desiredStatus);
    formData.set('next', data.next);
    quickActionGuestId = guest.id;

    try {
      const response = await fetch(`/api/guests/${guest.id}/luma-action`, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        headers: {
          'x-luma-console-action': 'true'
        }
      });
      const payload = (response.headers.get('content-type') ?? '').includes('application/json')
        ? ((await response.json()) as { ok?: boolean; error?: string; message?: string })
        : null;

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error ?? `Quick action failed: ${response.status} ${response.statusText}`);
      }

      toast.success(payload?.message ?? `${targetActionLabel(desiredStatus)} queued for ${guest.email}.`, {
        id: toastId
      });
      await invalidateAll();
      await tick();
      restoreScroll(scroll);
      requestAnimationFrame(() => restoreScroll(scroll));
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : String(exception);
      toast.error(message, { id: toastId });
    } finally {
      quickActionGuestId = null;
    }
  }

  function handleQuickActionKeydown(event: KeyboardEvent) {
    if (shouldIgnoreQuickAction(event)) return;

    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      void setHoveredGuestDesiredStatus('approved');
    }
  }

  function scoreClass(score: number) {
    if (score >= 78) return 'text-emerald-700';
    if (score >= 58) return 'text-amber-700';
    if (score >= 38) return 'text-neutral-700';
    return 'text-destructive';
  }

  function scoreBreakdownForGuest(guest: {
    current_title: string | null;
    current_company: string | null;
    github_username: string | null;
    contribution_total: number | null;
    public_repos: number | null;
    followers: number | null;
    prior_attended_count: number;
    answers: { question: string; answer: string | null }[];
  }) {
    return calculateGuestScore({
      currentTitle: guest.current_title,
      currentCompany: guest.current_company,
      githubUsername: guest.github_username,
      contributionTotal: guest.contribution_total,
      publicRepos: guest.public_repos,
      followers: guest.followers,
      priorAttendedCount: guest.prior_attended_count,
      answers: guest.answers
    });
  }

  function scoreDelta(value: number) {
    return `${value >= 0 ? '+' : ''}${value}`;
  }

  function scoreCalculationTitle(reason: ScoreReason) {
    return [
      ...reason.calculations.map((calculation) => `${scoreDelta(calculation.delta)} ${calculation.label}: ${calculation.detail}`),
      `Raw total: ${reason.raw_total}`,
      `Final score: ${reason.total}`
    ].join('\n');
  }

  function jobTotal(status: string) {
    return data.jobs
      .filter((job) => job.status === status)
      .reduce((total, job) => total + job.count, 0);
  }

  function stoppableJobCount() {
    return jobTotal('queued') + jobTotal('running');
  }

  function clearableJobCount() {
    return jobTotal('succeeded') + jobTotal('failed');
  }

  function eventStatusVariant() {
    if (isLiveEvent(data.event)) return 'default';
    if (isPastEvent(data.event)) return 'outline';
    return 'secondary';
  }

  function tableCellClass(...classes: Array<string | false | null | undefined>) {
    return cn(
      tableDensity === 'compact' ? 'px-1.5 py-1 text-xs leading-tight' : 'px-2 py-2 text-sm',
      'align-top',
      classes
    );
  }

  function tableHeadClass(...classes: Array<string | false | null | undefined>) {
    return cn(
      'sticky top-0 z-10 bg-card text-xs leading-tight',
      tableDensity === 'compact' ? 'h-8 px-1.5 py-1' : 'h-10 px-2 py-2',
      classes
    );
  }

  function answerColumnClass(column: AnswerColumn) {
    const type = (column.question_type ?? '').toLowerCase();
    const question = column.question.toLowerCase();

    if (type.includes('github') || question.includes('github')) {
      return 'w-[188px] min-w-[176px] max-w-[188px]';
    }

    if (type.includes('linkedin') || question.includes('linkedin')) {
      return wrapAnswers
        ? 'w-[260px] min-w-[230px] max-w-[300px]'
        : 'w-[210px] min-w-[190px] max-w-[230px]';
    }

    if (type.includes('company') || question.includes('company') || question.includes('job title')) {
      return wrapAnswers
        ? 'w-[240px] min-w-[220px] max-w-[280px]'
        : 'w-[190px] min-w-[180px] max-w-[210px]';
    }

    if (
      type.includes('dropdown') ||
      type.includes('select') ||
      type.includes('choice') ||
      type.includes('checkbox') ||
      type.includes('boolean')
    ) {
      return 'w-[140px] min-w-[120px] max-w-[170px]';
    }

    return wrapAnswers
      ? 'w-[300px] min-w-[260px] max-w-[340px]'
      : 'w-[220px] min-w-[180px] max-w-[250px]';
  }

  function compactTextClass() {
    return wrapAnswers ? 'whitespace-pre-wrap' : 'truncate whitespace-nowrap';
  }

  function githubColumnClass() {
    return 'w-[188px] min-w-[176px] max-w-[188px]';
  }

  function fullAnswerText(primary: string, secondary: string | null) {
    return secondary ? `${primary} · ${secondary}` : primary;
  }

  function restoreScroll(scroll: { x: number; y: number; tableLeft: number }) {
    window.scrollTo(scroll.x, scroll.y);
    const table = document.getElementById('guest-table');
    if (table) table.scrollLeft = scroll.tableLeft;
  }

  function textFromUnknown(value: unknown, fallback = '') {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') {
      if ('message' in value) return textFromUnknown((value as { message: unknown }).message, fallback);
      if ('error' in value) return textFromUnknown((value as { error: unknown }).error, fallback);
      try {
        return JSON.stringify(value);
      } catch {
        return fallback;
      }
    }
    if (value === undefined || value === null) return fallback;
    return String(value);
  }

  function submitInPlace(node: HTMLFormElement) {
    function setLoading(submitter: HTMLElement | null) {
      const button = submitter instanceof HTMLButtonElement ? submitter : null;
      const previousDisabled = button?.disabled ?? false;
      const spinner = document.createElement('span');
      spinner.className = 'luma-action-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const progressCell =
        node.dataset.cellProgress === 'true'
          ? (node.closest('[data-action-cell]') as HTMLElement | null)
          : null;
      const cellSpinner = document.createElement('span');

      if (button) {
        button.disabled = true;
        button.dataset.actionLoading = 'true';
        button.append(spinner);
      }

      if (progressCell) {
        const indicatorSpinner = document.createElement('span');
        indicatorSpinner.className = 'luma-action-spinner';
        indicatorSpinner.setAttribute('aria-hidden', 'true');
        cellSpinner.className = 'luma-cell-action-spinner';
        cellSpinner.textContent = 'Fetching';
        cellSpinner.append(indicatorSpinner);
        progressCell.append(cellSpinner);
        node.dataset.actionWorking = 'true';
      }

      return () => {
        spinner.remove();
        cellSpinner.remove();
        if (button) {
          button.disabled = previousDisabled;
          delete button.dataset.actionLoading;
        }
        delete node.dataset.actionWorking;
      };
    }

    function setLocalStatus(message: string, variant: 'loading' | 'success' | 'error') {
      if (node.dataset.actionStatus === 'toast-only') return;

      const inlineButton = node.dataset.inlineStatus === 'button'
        ? (node.querySelector('button[type="submit"]') as HTMLButtonElement | null)
        : null;
      const inlineLabel = inlineButton?.querySelector('[data-action-label-text]') as HTMLElement | null;

      if (inlineButton && inlineLabel) {
        inlineButton.dataset.actionStatusVariant = variant;
        inlineButton.dataset.defaultLabel ||= inlineLabel.textContent ?? '';
        inlineLabel.textContent = message;

        if (variant !== 'loading') {
          window.setTimeout(() => {
            inlineLabel.textContent = inlineButton.dataset.defaultLabel ?? '';
            delete inlineButton.dataset.actionStatusVariant;
          }, 1800);
        }
        return;
      }

      let status = node.nextElementSibling as HTMLElement | null;
      if (!status?.matches('[data-action-status]')) {
        status = document.createElement('span');
        status.dataset.actionStatus = 'true';
        node.insertAdjacentElement('afterend', status);
      }

      status.className =
        variant === 'error'
          ? 'inline-flex h-6 items-center rounded-md border border-destructive/30 bg-destructive/10 px-2 text-xs text-destructive'
          : variant === 'success'
            ? 'inline-flex h-6 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-800'
            : 'inline-flex h-6 items-center rounded-md border bg-background px-2 text-xs text-muted-foreground';
      status.textContent = message;

      if (variant !== 'loading') {
        window.setTimeout(() => {
          status?.remove();
        }, 2400);
      }
    }

    async function onSubmit(event: SubmitEvent) {
      event.preventDefault();

      const submitter = event.submitter as HTMLElement | null;
      const table = document.getElementById('guest-table');
      const scroll = {
        x: window.scrollX,
        y: window.scrollY,
        tableLeft: table?.scrollLeft ?? 0
      };
      const formData = new FormData(node);
      if (
        (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.name
      ) {
        formData.append(submitter.name, submitter.value);
      }
      const actionUrl = new URL(node.action || window.location.href, window.location.href);
      const actionLabel = node.dataset.actionLabel ?? submitter?.getAttribute('title') ?? actionUrl.pathname;
      const cleanupLoading = setLoading(submitter);
      const toastId = toast.loading(actionLabel);

      setLocalStatus('Working...', 'loading');
      console.info('[ui-action:start]', {
        action: actionUrl.pathname + actionUrl.search,
        label: actionLabel,
        fields: Array.from(formData.keys()),
        scroll
      });

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
          headers: {
            'x-luma-console-action': 'true'
          }
        });
        let responseMessage = `${actionLabel} done.`;
        let responseError: string | null = null;
        if ((response.headers.get('content-type') ?? '').includes('application/json')) {
          const payload = (await response.json()) as { message?: unknown; error?: unknown; ok?: boolean };
          responseMessage = textFromUnknown(payload.message, responseMessage);
          responseError = payload.error !== undefined
            ? textFromUnknown(payload.error, responseMessage)
            : payload.ok === false
              ? responseMessage
              : null;
        }

        console.info('[ui-action:done]', {
          action: actionUrl.pathname + actionUrl.search,
          label: actionLabel,
          status: response.status,
          redirected: response.redirected,
          finalUrl: response.url
        });

        if (!response.ok || responseError) {
          const errorMessage =
            responseError ?? `${actionLabel} failed: ${response.status} ${response.statusText}`;
          setLocalStatus('Failed', 'error');
          toast.error(errorMessage, { id: toastId });
          await invalidateAll();
          await tick();
          restoreScroll(scroll);
          requestAnimationFrame(() => restoreScroll(scroll));
          return;
        }

        setLocalStatus('Done', 'success');
        toast.success(responseMessage, { id: toastId });
        await invalidateAll();
        await tick();
        restoreScroll(scroll);
        requestAnimationFrame(() => restoreScroll(scroll));
      } catch (exception) {
        console.error('[ui-action:error]', {
          action: actionUrl.pathname + actionUrl.search,
          label: actionLabel,
          error: exception
        });
        const errorMessage = textFromUnknown(exception, 'Action failed.');
        setLocalStatus('Failed', 'error');
        toast.error(errorMessage, { id: toastId });
      } finally {
        cleanupLoading();
      }
    }

    node.addEventListener('submit', onSubmit);
    return {
      destroy() {
        node.removeEventListener('submit', onSubmit);
      }
    };
  }

  function autoSaveNote(node: HTMLTextAreaElement) {
    const actionUrl = node.dataset.actionUrl;
    const next = node.dataset.next ?? data.next;
    const email = node.dataset.email ?? 'guest';
    const status = node.parentElement?.querySelector('[data-note-status]') as HTMLElement | null;
    let lastSaved = node.value;
    let requestId = 0;

    function setStatus(message: string, variant: 'idle' | 'dirty' | 'loading' | 'success' | 'error') {
      if (!status) return;

      if (variant === 'idle' || !message) {
        status.textContent = '';
        status.className = 'hidden';
        return;
      }

      status.textContent = message;
      status.className = cn(
        'pointer-events-none absolute right-1 top-1 rounded border bg-background/95 px-1 text-[10px] leading-4 shadow-sm',
        variant === 'dirty' && 'border-amber-200 text-amber-700',
        variant === 'loading' && 'border-border text-muted-foreground',
        variant === 'success' && 'border-emerald-200 text-emerald-700',
        variant === 'error' && 'border-destructive/30 text-destructive'
      );
    }

    function onInput() {
      setStatus(node.value === lastSaved ? '' : 'Unsaved', node.value === lastSaved ? 'idle' : 'dirty');
    }

    async function save() {
      const value = node.value;
      if (!actionUrl || value === lastSaved) {
        setStatus('', 'idle');
        return;
      }

      const currentRequest = ++requestId;
      const formData = new FormData();
      formData.set('notes', value);
      formData.set('next', next);
      setStatus('Saving...', 'loading');
      console.info('[ui-action:start]', {
        action: actionUrl,
        label: `Save note for ${email}`,
        fields: ['notes', 'next']
      });

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
          headers: {
            'x-luma-console-action': 'true'
          }
        });
        const payload = (response.headers.get('content-type') ?? '').includes('application/json')
          ? ((await response.json()) as { ok?: boolean; error?: unknown; message?: unknown })
          : null;

        console.info('[ui-action:done]', {
          action: actionUrl,
          label: `Save note for ${email}`,
          status: response.status
        });

        if (!response.ok || payload?.ok === false) {
          throw new Error(textFromUnknown(payload?.error, `Note save failed: ${response.status} ${response.statusText}`));
        }

        if (currentRequest !== requestId) return;
        lastSaved = value;
        setStatus('Saved', 'success');
        window.setTimeout(() => {
          if (node.value === lastSaved) setStatus('', 'idle');
        }, 1400);
      } catch (exception) {
        if (currentRequest !== requestId) return;
        console.error('[ui-action:error]', {
          action: actionUrl,
          label: `Save note for ${email}`,
          error: exception
        });
        const message = textFromUnknown(exception, 'Note save failed.');
        setStatus('Not saved', 'error');
        toast.error(`Note not saved for ${email}: ${message}`);
      }
    }

    node.addEventListener('input', onInput);
    node.addEventListener('blur', save);
    return {
      destroy() {
        node.removeEventListener('input', onInput);
        node.removeEventListener('blur', save);
      }
    };
  }

  function isGithubColumn(column: AnswerColumn) {
    const type = (column.question_type ?? '').toLowerCase();
    const question = column.question.toLowerCase();
    return type.includes('github') || question.includes('github');
  }

  function hasNativeGithubColumn() {
    return data.answerColumns.some(isGithubColumn);
  }

  function showDedicatedGithubColumn() {
    return !hasNativeGithubColumn();
  }

  function tableColspan() {
    return 7 + (showDedicatedGithubColumn() ? 1 : 0) + Math.max(data.answerColumns.length, 1);
  }

  function isLinkedinColumn(column: AnswerColumn) {
    const type = (column.question_type ?? '').toLowerCase();
    const question = column.question.toLowerCase();
    return type.includes('linkedin') || question.includes('linkedin');
  }

  type LinkedinProfileSummary = {
    linkedin_url: string | null;
    linkedin_avatar_url: string | null;
    linkedin_display_name: string | null;
    linkedin_bio: string | null;
    linkedin_location: string | null;
    linkedin_followers: number | null;
    linkedin_connections: number | null;
    linkedin_snapshot_id: string | null;
    linkedin_snapshot_status: string | null;
    linkedin_organizations: {
      title: string;
      subtitle: string | null;
    }[];
    linkedin_activity: {
      title: string;
      interaction: string | null;
      link: string | null;
    }[];
    linkedin_awards: {
      title: string;
      subtitle: string | null;
    }[];
    linkedin_recent_jobs: {
      company: string | null;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
    }[];
    profile_raw_keys: string[];
    profile_source: string | null;
    profile_confidence: number | null;
    profile_updated_at: string | null;
    current_title: string | null;
    current_company: string | null;
    favicon_url: string | null;
    past_titles: string[];
  };

  function linkedinPrimary(
    display: ReturnType<typeof displayAnswer>,
    guest: LinkedinProfileSummary
  ) {
    if (display.kind === 'empty' && guest.linkedin_url) {
      return guest.linkedin_url.replace(/^https?:\/\/(?:www\.)?linkedin\.com/i, '');
    }

    return display.primary;
  }

  function linkedinHeadline(guest: LinkedinProfileSummary) {
    return [guest.current_title, guest.current_company].filter(Boolean).join(' · ');
  }

  function linkedinMeta(guest: LinkedinProfileSummary) {
    return [
      guest.linkedin_bio,
      guest.linkedin_location,
      guest.linkedin_followers === null ? null : `${guest.linkedin_followers} followers`,
      guest.linkedin_connections === null ? null : `${guest.linkedin_connections} connections`
    ].filter(Boolean).join(' · ');
  }

  function linkedinSignalLine(guest: LinkedinProfileSummary) {
    return [
      guest.current_title ?? guest.linkedin_bio,
      guest.current_company,
      guest.linkedin_location
    ].filter(Boolean).join(' · ');
  }

  function linkedinStatsLine(guest: LinkedinProfileSummary) {
    const jobs = linkedinWorkHistory(guest);
    return [
      guest.linkedin_followers === null ? null : `${guest.linkedin_followers} followers`,
      guest.linkedin_connections === null ? null : `${guest.linkedin_connections} connections`,
      guest.linkedin_organizations.length ? `${guest.linkedin_organizations.length} orgs` : null,
      jobs.length ? `${jobs.length} roles` : null,
      guest.linkedin_activity.length ? `${guest.linkedin_activity.length} recent` : null
    ].filter(Boolean).join(' · ');
  }

  function linkedinJobText(job: LinkedinProfileSummary['linkedin_recent_jobs'][number]) {
    return [job.title, job.company].filter(Boolean).join(' · ');
  }

  function linkedinJobDateText(job: LinkedinProfileSummary['linkedin_recent_jobs'][number]) {
    return [job.start_date, job.end_date || 'Present'].filter(Boolean).join(' - ');
  }

  function linkedinVisibleJobs(guest: LinkedinProfileSummary) {
    return linkedinWorkHistory(guest).slice(0, wrapAnswers ? 4 : 3);
  }

  function linkedinWorkHistory(guest: LinkedinProfileSummary) {
    return guest.linkedin_recent_jobs.filter((job) => job.title || job.company);
  }

  function linkedinCurrentRoleFallback(guest: LinkedinProfileSummary) {
    const title = guest.current_title;
    const company = guest.current_company;
    if (!title && !company) return null;

    return [title ?? 'Title unknown', company].filter(Boolean).join(' · ');
  }

  function linkedinOrganizationSummary(guest: LinkedinProfileSummary) {
    return guest.linkedin_organizations
      .map((organization) =>
        [organization.subtitle, organization.title].filter(Boolean).join(' · ')
      )
      .filter(Boolean)
      .join(' · ');
  }

  function hasLinkedinEnrichment(guest: LinkedinProfileSummary) {
    return Boolean(
      guest.current_title ||
        guest.current_company ||
        guest.linkedin_avatar_url ||
        guest.linkedin_display_name ||
        guest.linkedin_bio ||
        guest.linkedin_location ||
        guest.linkedin_followers !== null ||
        guest.linkedin_connections !== null ||
        guest.linkedin_organizations.length ||
        guest.linkedin_recent_jobs.length ||
        guest.linkedin_activity.length ||
        guest.linkedin_awards.length ||
        guest.favicon_url ||
        guest.past_titles.length ||
        guest.profile_raw_keys.length ||
        guest.linkedin_snapshot_id ||
        guest.linkedin_url
    );
  }

  function hasLinkedinPayload(guest: LinkedinProfileSummary) {
    return Boolean(
      guest.linkedin_url ||
        guest.current_title ||
        guest.current_company ||
        guest.linkedin_display_name ||
        guest.linkedin_bio ||
        guest.linkedin_location ||
        guest.linkedin_followers !== null ||
        guest.linkedin_connections !== null ||
        guest.linkedin_recent_jobs.length ||
        guest.linkedin_organizations.length ||
        guest.linkedin_activity.length ||
        guest.linkedin_awards.length
    );
  }

  $effect(() => {
    const linkedinRows = data.guests
      .filter(hasLinkedinPayload)
      .sort((a, b) => Number(b.linkedin_recent_jobs.length > 0) - Number(a.linkedin_recent_jobs.length > 0))
      .slice(0, 20)
      .map((guest) => ({
        email: guest.email,
        linkedin_url: guest.linkedin_url,
        source: guest.profile_source,
        current_title: guest.current_title,
        current_company: guest.current_company,
        bio: guest.linkedin_bio,
        recent_jobs: linkedinWorkHistory(guest).slice(0, 5).map((job) => linkedinJobText(job)),
        raw_recent_jobs: guest.linkedin_recent_jobs.length,
        raw_keys: guest.profile_raw_keys.slice(0, 10).join(', '),
        updated_at: guest.profile_updated_at
      }));
    const key = `${data.event.id}:${data.guests.length}:${linkedinRows.map((row) => `${row.email}:${row.raw_recent_jobs}:${row.current_company ?? ''}:${row.current_title ?? ''}`).join('|')}`;

    if (key === linkedinDebugKey) return;
    linkedinDebugKey = key;
    console.info('[linkedin:client:summary]', {
      event: data.event.id,
      guests: data.guests.length,
      linkedinRows: linkedinRows.length,
      withRawRecentJobs: linkedinRows.filter((row) => row.raw_recent_jobs > 0).length
    });
    console.info('[linkedin:client:note]', 'If recent_jobs is empty, the saved BrightData payload did not contain a supported work-history array such as experience, jobs, employment_history, or positions.');
    console.table(linkedinRows);
  });

  function linkedinRawKeys(guest: LinkedinProfileSummary) {
    return guest.profile_raw_keys
      .filter((key) => !['snapshot_id', 'snapshotId', 'status'].includes(key))
      .slice(0, 4);
  }

  function linkedinFallbackStatus(guest: LinkedinProfileSummary) {
    if (linkedinHeadline(guest)) return null;
    if (guest.linkedin_snapshot_id) {
      return `Snapshot ${guest.linkedin_snapshot_status ?? 'pending'} · ${guest.linkedin_snapshot_id}`;
    }
    const keys = linkedinRawKeys(guest);
    if (keys.length) return `BrightData returned: ${keys.join(', ')}`;
    if (guest.profile_updated_at) return 'BrightData saved, no title/company';
    return null;
  }

  function githubStats(guest: {
    contribution_total: number | null;
    public_repos: number | null;
    followers: number | null;
    total_stars: number | null;
  }) {
    return [
      `${guest.contribution_total ?? 0} contrib`,
      `${guest.public_repos ?? 0} repos`,
      `${guest.total_stars ?? 0} top stars`,
      `${guest.followers ?? 0} followers`
    ].join(' · ');
  }

  function attendanceMarkerClass(label: string | null) {
    const marker = attendanceMarker(label);
    return cn(
      'inline-block size-2.5 shrink-0 border align-middle',
      marker.shape === 'circle' && 'rounded-full',
      marker.shape === 'square' && 'rounded-[2px]',
      marker.shape === 'diamond' && 'rotate-45 rounded-[1px]',
      marker.shape === 'outline' && 'rounded-[2px]',
      marker.tone === 'checked_in' && 'border-emerald-700 bg-emerald-600',
      marker.tone === 'going' && 'border-sky-600 bg-sky-500',
      marker.tone === 'waitlist' && 'border-amber-600 bg-amber-400',
      marker.tone === 'rejected' && 'border-rose-700 bg-rose-500',
      marker.tone === 'invited' && 'border-slate-300 bg-background',
      marker.tone === 'pending' && 'border-slate-300 bg-slate-200',
      marker.tone === 'unknown' && 'border-muted-foreground/30 bg-muted'
    );
  }

  function attendanceCurrentClass(label: string | null) {
    const marker = attendanceMarker(label);
    return cn(
      'inline-flex h-4 max-w-full items-center gap-1 rounded-full border px-1 text-[10px] leading-none',
      marker.tone === 'checked_in' && 'border-emerald-700 bg-emerald-50 text-emerald-800',
      marker.tone === 'going' && 'border-sky-500 bg-sky-50 text-sky-800',
      marker.tone === 'waitlist' && 'border-amber-500 bg-amber-50 text-amber-800',
      marker.tone === 'rejected' && 'border-rose-500 bg-rose-50 text-rose-800',
      (marker.tone === 'pending' || marker.tone === 'invited' || marker.tone === 'unknown') &&
        'border-border bg-background text-muted-foreground'
    );
  }

</script>

<svelte:window onkeydown={handleQuickActionKeydown} />

<Tooltip.Provider delayDuration={100}>
<main class="flex w-full max-w-none flex-col gap-2 px-2 py-2">
  <section class="flex flex-wrap items-center gap-2 border-b pb-2">
    <div class="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
      {#if data.event.cover_url}
        <img
          class={cn('size-full object-cover', isPastEvent(data.event) && 'grayscale')}
          src={data.event.cover_url}
          alt={data.event.name}
        />
      {:else}
        <div class="flex size-full items-center justify-center text-muted-foreground">
          <ImageIcon class="size-5" />
        </div>
      {/if}
    </div>

    <div class="min-w-[280px] flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="max-w-[520px] truncate text-lg font-semibold tracking-tight">{data.event.name}</h1>
        <Badge variant={eventStatusVariant()}>{relativeEventTime(data.event)}</Badge>
        <Badge variant="outline">{eventVisibility(data.event.raw_json, data.event.status) ?? 'status unknown'}</Badge>
        <Badge variant="secondary">
          <Users data-icon="inline-start" /> {data.event.guest_count}
        </Badge>
      </div>

      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <CalendarClock class="size-3.5" /> {formatDate(data.event.start_at)}
        </span>
        {#if data.event.end_at}
          <span>ends {formatDate(data.event.end_at)}</span>
        {/if}
        {#if data.event.timezone}
          <span>{data.event.timezone}</span>
        {/if}
        {#if eventLocation(data.event.raw_json)}
          <span class="inline-flex items-center gap-1">
            <MapPin class="size-3.5" /> {eventLocation(data.event.raw_json)}
          </span>
        {/if}
        {#if eventCapacity(data.event.raw_json)}
          <span>capacity {eventCapacity(data.event.raw_json)}</span>
        {/if}
        <span>synced {formatDate(data.event.last_synced_at)}</span>
      </div>

      <div class="mt-1 flex flex-wrap items-center gap-1 text-xs">
        <Badge variant="outline">pending {data.event.pending_count}</Badge>
        <Badge variant="outline">approved {data.event.approved_count}</Badge>
        <Badge variant="outline">waitlist {data.event.waitlist_count}</Badge>
        {#each eventHosts(data.event.raw_json).slice(0, 3) as host}
          <Badge variant="secondary">host {host}</Badge>
        {/each}
        {#if eventDescription(data.event.raw_json)}
          <span class="max-w-[560px] truncate text-muted-foreground">{eventDescription(data.event.raw_json)}</span>
        {/if}
      </div>
    </div>

    <div class="ml-auto flex flex-wrap items-center justify-end gap-1">
      {#if data.event.url}
        <Button variant="outline" size="sm" href={data.event.url} title="Open Luma event">
          <ExternalLink data-icon="inline-start" /> Luma
        </Button>
      {/if}
      <form method="POST" action="?/syncGuests" use:submitInPlace data-action-label="Sync guests">
        <Button type="submit" variant="outline" size="sm" disabled={!data.lumaConfigured} title="Read latest guests from Luma">
          <RefreshCw data-icon="inline-start" /> Sync
        </Button>
      </form>
      <Button variant="outline" size="sm" href={`/api/export?event_id=${data.event.id}`} title="Export current event CSV">
        <Download data-icon="inline-start" /> CSV
      </Button>
      <details class="relative">
        <summary class="flex h-8 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium">
          <ListChecks class="size-3.5" /> Raw
        </summary>
        <div class="absolute right-0 z-20 mt-1 w-[520px] max-w-[calc(100vw-1rem)] rounded-md border bg-popover p-2 text-xs shadow-md">
          <div class="mb-2 flex flex-wrap gap-1">
            {#each rawFieldNames(data.event.raw_json) as field}
              <span class="rounded bg-muted px-1.5 py-0.5">{field}</span>
            {/each}
          </div>
          <pre class="max-h-80 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">{rawJsonPreview(data.event.raw_json)}</pre>
        </div>
      </details>
    </div>
  </section>

  {#if data.batch}
    <div class="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-sm">
      Batch {data.batch.status === 'applied' ? 'applied' : data.batch.status === 'failed' ? 'failed' : 'dry-run completed'} for {data.batch.count} guests.
    </div>
  {/if}

  <section class="flex flex-wrap items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-xs">
    <span class="mr-1 font-medium text-muted-foreground">Luma</span>
    {#each data.lumaStatusCounts as status}
      <Badge variant={lumaStatusVariant(status.approval_status)} title={`${status.count} raw ${rawLumaStatus(status.approval_status)}`}>
        {status.count} {rawLumaStatus(status.approval_status)}
      </Badge>
    {/each}
    <span class="ml-2 mr-1 font-medium text-muted-foreground">Actions</span>
    {#each data.actionCounts as action}
      <Badge variant={lumaStatusVariant(action.desired_luma_status)} title={`${action.count} ${targetActionLabel(action.desired_luma_status)}`}>
        {action.count} {targetActionLabel(action.desired_luma_status)}
      </Badge>
    {/each}
    {#if queuedTransitionCount() > 0}
      <Badge variant="default" title="Rows where the desired action differs from the current Luma state">
        {queuedTransitionCount()} queued Luma changes
      </Badge>
    {/if}
  </section>

  <details class="rounded-md border bg-background px-2 py-1 text-sm">
    <summary class="flex cursor-pointer flex-wrap items-center gap-2 text-xs font-medium">
      <Sparkles class="size-3.5" /> Job queue
      <Badge variant="outline"><Clock3 data-icon="inline-start" /> {jobTotal('queued')} queued</Badge>
      <Badge variant="outline">{jobTotal('running')} running</Badge>
      {#if jobTotal('failed') > 0}
        <Badge variant="destructive">{jobTotal('failed')} failed/stopped</Badge>
      {/if}
    </summary>
    <div class="mt-2 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-1">
        <form method="POST" action="?/cancelJobs" use:submitInPlace data-action-label="Stop queued enrichment jobs">
          <Button type="submit" size="sm" variant="destructive" disabled={stoppableJobCount() === 0}>
            <X data-icon="inline-start" /> Stop queue
          </Button>
        </form>
        <form method="POST" action="?/deleteJobs" use:submitInPlace data-action-label="Clear stopped, failed, and finished job records">
          <Button type="submit" size="sm" variant="outline" disabled={clearableJobCount() === 0}>
            <Trash2 data-icon="inline-start" /> Clear history
          </Button>
        </form>
      </div>

      <Table.Root class="text-xs">
        <Table.Header>
          <Table.Row>
            <Table.Head>Type</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Guest</Table.Head>
            <Table.Head>Ready</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.activeJobs as job}
            <Table.Row>
              <Table.Cell>{job.type.replaceAll('_', ' ')}</Table.Cell>
              <Table.Cell>
                <Badge variant={job.status === 'running' ? 'default' : 'outline'}>
                  {job.status}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col">
                  <span>{job.guest_name ?? job.guest_email}</span>
                  {#if job.guest_name}
                    <span class="text-xs text-muted-foreground">{job.guest_email}</span>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell>{formatDate(job.run_after)}</Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={4} class="py-4 text-center text-muted-foreground">
                No queued or running jobs.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      {#if data.failedJobs.length > 0}
        <div class="flex flex-col gap-1 rounded-md border border-destructive/30 p-2">
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
    </div>
  </details>

  <details class="rounded-md border bg-background px-2 py-1 text-sm">
    <summary class="flex cursor-pointer flex-wrap items-center gap-2 text-xs font-medium">
      <ListChecks class="size-3.5" /> Approval flow
      <Badge variant={queuedTransitionCount() > 0 ? 'default' : 'outline'}>{queuedTransitionCount()} pending changes</Badge>
      <span class="text-muted-foreground">grouped by current Luma state → desired action; writes require the Setup toggle and APPLY</span>
      <span class="text-muted-foreground">batch notes are local; Luma's public status API does not document custom messages</span>
    </summary>
    <div class="mt-2 flex flex-col gap-2">
      {#if data.transitionCounts.length}
        {#each data.transitionCounts as transition}
          <form
            class="grid items-center gap-2 border-t py-2 text-xs md:grid-cols-[170px_64px_minmax(180px,1fr)_minmax(190px,260px)_92px_100px_120px]"
            method="POST"
            action="/api/batches/apply"
            use:submitInPlace
            data-action-label={`Apply ${transition.count} ${rawLumaStatus(transition.from_status)} to ${transition.to_status}`}
          >
            <input type="hidden" name="event_id" value={data.event.id} />
            <input type="hidden" name="source_luma_status" value={transition.from_status} />
            <input type="hidden" name="target_luma_status" value={transition.to_status} />
            <input type="hidden" name="next" value={data.next} />
            <div class="flex min-w-0 items-center gap-1">
              <Badge variant={lumaStatusVariant(transition.from_status)} title={`Raw Luma state: ${rawLumaStatus(transition.from_status)}`}>
                {rawLumaStatus(transition.from_status)}
              </Badge>
              <ArrowRight class="size-3 shrink-0 text-muted-foreground" />
              <Badge variant={lumaStatusVariant(transition.to_status)}>{transition.to_status}</Badge>
            </div>
            <div class="font-medium">{transition.count} guests</div>
            <div class="truncate text-muted-foreground" title={transitionSampleText(transition)}>
              {transitionSampleText(transition)}
            </div>
            <Textarea
              class="min-h-8 text-xs"
              name="message"
              placeholder={`Local batch note for ${rawLumaStatus(transition.from_status)} → ${transition.to_status}`}
              rows={1}
              value={batchNoteValue(transition.to_status)}
              oninput={(event) => saveBatchNoteDraft(transition.to_status, event)}
            ></Textarea>
            <Button type="submit" name="dry_run" value="true" size="sm" variant="outline">Dry-run</Button>
            <Input class="h-8 text-xs" name="confirm" placeholder="APPLY" />
            <Button
              type="submit"
              name="dry_run"
              value="false"
              size="sm"
              variant={transition.to_status === 'declined' ? 'destructive' : 'default'}
              disabled={!data.lumaWritesEnabled}
            >
              Send
            </Button>
          </form>
        {/each}
      {:else}
        <div class="border-t py-3 text-xs text-muted-foreground">
          No Luma changes queued. Set the Action dropdown on rows to approve or decline people, then this flow will show each current-state → target-state batch.
        </div>
      {/if}
    </div>
  </details>

  <section class="flex flex-col">
    <div class="flex min-h-10 flex-wrap items-center gap-1 border-y bg-background px-1 py-1">
      <form class="flex min-w-0 flex-1 flex-wrap items-center gap-1" method="GET">
        <div class="relative min-w-[220px] flex-1 sm:max-w-[360px]">
          <Search class="pointer-events-none absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
          <Input
            class="h-7 rounded-md border-transparent bg-muted/70 pl-7 pr-2 text-xs shadow-none hover:bg-muted focus-visible:bg-background"
            name="q"
            placeholder="Search guests, company, title"
            value={data.filters.q}
            aria-label="Search guests"
          />
        </div>

        <label class="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-1.5 text-xs text-muted-foreground">
          <Filter class="size-3" />
          <select class="h-5 max-w-36 bg-transparent text-xs text-foreground outline-none" name="status" title="Decision status">
            <option value="">All states · {totalStatusCount()}</option>
            {#each reviewStatuses as status}
              <option value={status} selected={data.filters.status === status}>
                {formatStatus(status)} · {countFor(status)}
              </option>
            {/each}
          </select>
        </label>

        <select class="h-7 rounded-md border bg-background px-1.5 text-xs" name="github" title="GitHub enrichment status">
          <option value="" selected={data.filters.github === ''}>GitHub: any</option>
          <option value="found" selected={data.filters.github === 'found'}>GitHub: found</option>
          <option value="missing" selected={data.filters.github === 'missing'}>GitHub: missing</option>
        </select>

        <label class="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-1.5 text-xs text-muted-foreground">
          <ArrowDownWideNarrow class="size-3" />
          <select class="h-5 max-w-44 bg-transparent text-xs text-foreground outline-none" name="sort" title="Sort guests">
            <option value="score_desc" selected={currentSort() === 'score_desc'}>Sort: score high-low</option>
            <option value="github_activity_desc" selected={currentSort() === 'github_activity_desc'}>Sort: GitHub active</option>
            <option value="github_stars_desc" selected={currentSort() === 'github_stars_desc'}>Sort: GitHub stars</option>
            <option value="registered_desc" selected={currentSort() === 'registered_desc'}>Sort: newest</option>
          </select>
        </label>

        <label
          class={cn(
            'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-xs',
            data.filters.prior ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
          )}
          title="Only show guests who have checked in to a prior imported event"
        >
          <input class="sr-only" type="checkbox" name="prior" value="true" checked={data.filters.prior} />
          <Users class="size-3" />
          Prior
        </label>

        <Button type="submit" size="xs" variant="outline">Apply</Button>

        {#if activeFilterCount() > 0}
          <Button href={`/events/${data.event.id}`} size="icon-xs" variant="ghost" title="Clear filters" aria-label="Clear filters">
            <X class="size-3.5" />
          </Button>
          <span class="text-xs text-muted-foreground">{activeFilterCount()} active</span>
        {/if}
      </form>

      <div class="ml-auto flex items-center gap-1 text-xs">
        <span class="hidden text-muted-foreground sm:inline">{data.guests.length} shown</span>
        <label class="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-1.5">
          <Settings2 class="size-3 text-muted-foreground" />
          <select
            class="h-5 bg-transparent text-xs outline-none"
            bind:value={tableDensity}
            aria-label="Table row density"
            title="Table row density"
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>
        <label
          class={cn(
            'inline-flex h-7 cursor-pointer items-center rounded-md border px-1.5 text-xs',
            wrapAnswers ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
          )}
          title="Toggle cell wrapping"
        >
          <input class="sr-only" type="checkbox" bind:checked={wrapAnswers} />
          Wrap
        </label>
      </div>
    </div>
    <div id="guest-table" class="w-full overflow-x-auto">
      <Table.Root class="w-max min-w-full table-fixed text-xs">
        <Table.Header>
          <Table.Row>
            <Table.Head class={tableHeadClass('w-[52px] min-w-[52px]')}>Score</Table.Head>
            <Table.Head class={tableHeadClass('w-[125px] min-w-[115px]')}>Event state</Table.Head>
            <Table.Head class={tableHeadClass('w-[145px] min-w-[135px]')}>Action</Table.Head>
            <Table.Head class={tableHeadClass(wrapAnswers ? 'w-[160px] min-w-[150px]' : 'w-[120px] min-w-[110px]')}>
              History
            </Table.Head>
            <Table.Head class={tableHeadClass(wrapAnswers ? 'w-[220px] min-w-[200px]' : 'w-[185px] min-w-[175px]')}>
              Person
            </Table.Head>
            {#if showDedicatedGithubColumn()}
              <Table.Head class={tableHeadClass(githubColumnClass())}>
                <div class="flex items-center justify-between gap-1">
                  <div class="min-w-0">
                    <div class="truncate">GitHub</div>
                    <div class="truncate text-xs font-normal text-muted-foreground">graph · repos · stars</div>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <form
                      method="POST"
                      action={`/api/events/${data.event.id}/github`}
                      use:submitInPlace
                      data-action-label="Fetch missing GitHub graphs"
                      data-action-status="toast-only"
                    >
                      <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                      <input type="hidden" name="mode" value="missing" />
                      <Button type="submit" size="icon-xs" variant="outline" title="Fetch missing GitHub graphs now">
                        <RefreshCw class="size-3" />
                      </Button>
                    </form>
                    <form
                      method="POST"
                      action={`/api/events/${data.event.id}/github`}
                      use:submitInPlace
                      data-action-label="Fetch all GitHub graphs"
                      data-action-status="toast-only"
                    >
                      <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                      <input type="hidden" name="mode" value="force" />
                      <Button
                        type="submit"
                        size="icon-xs"
                        variant="outline"
                        class="px-0 text-[10px] font-semibold"
                        title="Fetch GitHub graphs now for every guest"
                      >
                        All
                      </Button>
                    </form>
                  </div>
                </div>
              </Table.Head>
            {/if}
            {#if data.answerColumns.length}
              {#each data.answerColumns as column}
                <Table.Head class={tableHeadClass(answerColumnClass(column))} title={column.question}>
                  {#if isGithubColumn(column)}
                    <div class="flex items-center justify-between gap-1">
                      <div class="min-w-0">
                        <div class={cn('truncate text-xs', wrapAnswers && 'whitespace-normal')}>
                          {column.question}
                        </div>
                        <div class="truncate text-xs font-normal text-muted-foreground">
                          {questionTypeLabel(column.question_type)} · graph · repos · stars
                        </div>
                      </div>
                      <div class="flex shrink-0 items-center gap-1">
                        <form
                          method="POST"
                          action={`/api/events/${data.event.id}/github`}
                          use:submitInPlace
                          data-action-label="Fetch missing GitHub graphs"
                          data-action-status="toast-only"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                          <input type="hidden" name="mode" value="missing" />
                          <Button type="submit" size="icon-xs" variant="outline" title="Fetch missing GitHub graphs now">
                            <RefreshCw class="size-3" />
                          </Button>
                        </form>
                        <form
                          method="POST"
                          action={`/api/events/${data.event.id}/github`}
                          use:submitInPlace
                          data-action-label="Fetch all GitHub graphs"
                          data-action-status="toast-only"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                          <input type="hidden" name="mode" value="force" />
                          <Button
                            type="submit"
                            size="icon-xs"
                            variant="outline"
                            class="px-0 text-[10px] font-semibold"
                            title="Fetch GitHub graphs now for every guest"
                          >
                            All
                          </Button>
                        </form>
                      </div>
                    </div>
                  {:else if isLinkedinColumn(column)}
                    <div class="flex items-center justify-between gap-1">
                      <div class="min-w-0">
                        <div class={cn('truncate text-xs', wrapAnswers && 'whitespace-normal')}>
                          {column.question}
                        </div>
                        <div class="truncate text-xs font-normal text-muted-foreground">
                          {questionTypeLabel(column.question_type)} · title · company
                        </div>
                      </div>
                      <div class="flex shrink-0 items-center gap-1">
                        <form
                          method="POST"
                          action={`/api/events/${data.event.id}/linkedin`}
                          use:submitInPlace
                          data-action-label="Fetch missing LinkedIn profiles"
                          data-action-status="toast-only"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                          <input type="hidden" name="mode" value="missing" />
                          <Button type="submit" size="icon-xs" variant="outline" title="Fetch missing LinkedIn profiles now">
                            <RefreshCw class="size-3" />
                          </Button>
                        </form>
                        <form
                          method="POST"
                          action={`/api/events/${data.event.id}/linkedin`}
                          use:submitInPlace
                          data-action-label="Fetch all LinkedIn profiles"
                          data-action-status="toast-only"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-table`} />
                          <input type="hidden" name="mode" value="force" />
                          <Button
                            type="submit"
                            size="icon-xs"
                            variant="outline"
                            class="px-0 text-[10px] font-semibold"
                            title="Fetch LinkedIn profiles now for every guest with a LinkedIn signal"
                          >
                            All
                          </Button>
                        </form>
                      </div>
                    </div>
                  {:else}
                    <div class="flex flex-col gap-1">
                      <span class={cn('text-xs', wrapAnswers ? 'whitespace-normal' : 'truncate')}>
                        {column.question}
                      </span>
                      <span class="text-xs font-normal text-muted-foreground">
                        {questionTypeLabel(column.question_type)} · {column.answer_count} answers
                      </span>
                    </div>
                  {/if}
                </Table.Head>
              {/each}
            {:else}
              <Table.Head class={tableHeadClass('w-[180px] min-w-[180px]')}>Answers</Table.Head>
            {/if}
            <Table.Head class={tableHeadClass(wrapAnswers ? 'w-[260px] min-w-[240px]' : 'w-[185px] min-w-[170px]')}>Notes</Table.Head>
            <Table.Head class={tableHeadClass('w-[118px] min-w-[108px]')}>Tools</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.guests as guest}
            {@const scoreBreakdown = scoreBreakdownForGuest(guest)}
            <Table.Row
              class={cn(
                tableDensity === 'compact' ? 'h-9' : undefined,
                hoveredGuest?.id === guest.id && 'bg-muted/30'
              )}
              onmouseenter={() => {
                hoveredGuest = { id: guest.id, email: guest.email };
              }}
              onmouseleave={() => {
                if (hoveredGuest?.id === guest.id) hoveredGuest = null;
              }}
            >
              <Table.Cell class={tableCellClass('w-[52px] min-w-[52px]')}>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    class="block rounded-sm p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    title={scoreCalculationTitle(scoreBreakdown)}
                  >
                    <div class={cn(tableDensity === 'compact' ? 'text-lg' : 'text-2xl', 'font-semibold leading-none', scoreClass(guest.score))}>{guest.score}</div>
                    <div class="mt-0.5 text-[10px] leading-3 text-muted-foreground">
                      calc
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    side="right"
                    sideOffset={8}
                    class="max-w-[360px] flex-col items-start gap-2 border bg-popover p-3 text-popover-foreground shadow-lg"
                  >
                    <div>
                      <div class="font-medium">Score calculation</div>
                      <div class="text-xs text-muted-foreground">
                        Raw {scoreBreakdown.raw_total} · final {scoreBreakdown.total} · {formatStatus(scoreBreakdown.status)}
                      </div>
                    </div>
                    <div class="grid w-full gap-1">
                      {#each scoreBreakdown.calculations as calculation}
                        <div class="grid grid-cols-[3rem_1fr] gap-2 text-xs">
                          <span class={cn('font-medium tabular-nums', calculation.delta >= 0 ? 'text-emerald-700' : 'text-destructive')}>
                            {scoreDelta(calculation.delta)}
                          </span>
                          <div>
                            <div class="font-medium">{calculation.label}</div>
                            <div class="text-muted-foreground">{calculation.detail}</div>
                          </div>
                        </div>
                      {/each}
                    </div>
                    {#if guest.score_locked}
                      <div class="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Score is locked, so this auto calculation is not applied.
                      </div>
                    {/if}
                  </Tooltip.Content>
                </Tooltip.Root>
                {#if guest.score_locked}
                  <Badge variant="outline">locked</Badge>
                {:else if guest.score !== scoreBreakdown.total}
                  <Badge variant="outline" title={`Current auto calculation is ${scoreBreakdown.total}`}>calc {scoreBreakdown.total}</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class={tableCellClass('w-[125px] min-w-[115px]')}>
                <div class="flex min-w-0 flex-col gap-1">
                  <Badge variant={lumaStatusVariant(guest.approval_status)} title={`Raw Luma state: ${rawLumaStatus(guest.approval_status)}`}>
                    {humanStatus(guest.approval_status)}
                  </Badge>
                  <code class="truncate rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground" title={rawLumaStatus(guest.approval_status)}>
                    {rawLumaStatus(guest.approval_status)}
                  </code>
                  {#if guest.prior_attended_count > 0}
                    <Badge variant="secondary">
                      <Users data-icon="inline-start" /> {guest.prior_attended_count} prior
                    </Badge>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class={tableCellClass('w-[145px] min-w-[135px]')}>
                <div class="flex min-w-0 flex-col gap-1">
                  <form
                    class="flex min-w-0 flex-col gap-1"
                    method="POST"
                    action={`/api/guests/${guest.id}/luma-action`}
                    use:submitInPlace
                    data-action-label={`Set Luma action for ${guest.email}`}
                  >
                    <input type="hidden" name="next" value={data.next} />
                    <select
                      class={cn(
                        'h-7 w-full rounded-md border bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        targetActionTone(guest.desired_luma_status)
                      )}
                      name="desired_luma_status"
                      value={guest.desired_luma_status ?? ''}
                      aria-label={`Desired Luma action for ${guest.email}`}
                      onchange={submitSelectChange}
                    >
                      <option value="">No action</option>
                      <option value="approved">Approve</option>
                      <option value="declined">Decline</option>
                    </select>
                  </form>
                  {#if guest.desired_luma_status}
                    <div
                      class={cn(
                        'flex min-w-0 items-center gap-1 text-[10px]',
                        actionMatchesLuma(guest) ? 'text-muted-foreground' : 'font-medium text-amber-700'
                      )}
                      title={`${rawLumaStatus(guest.approval_status)} → ${guest.desired_luma_status}`}
                    >
                      <span class="truncate">{rawLumaStatus(guest.approval_status)}</span>
                      <ArrowRight class="size-3 shrink-0" />
                      <span class="truncate">{guest.desired_luma_status}</span>
                    </div>
                  {:else}
                    <span class="text-[10px] text-muted-foreground">No Luma update queued</span>
                  {/if}
                  <span class="truncate text-[10px] text-muted-foreground" title={`Review state: ${guest.status_internal}`}>
                    Review: {formatStatus(guest.status_internal)}
                  </span>
                </div>
              </Table.Cell>
              <Table.Cell class={tableCellClass(wrapAnswers ? 'w-[160px] min-w-[150px]' : 'w-[120px] min-w-[110px]')}>
                {@const currentLabel = currentAttendanceLabel(guest)}
                <div class="flex min-w-0 flex-col gap-1">
                  {#if currentLabel}
                    <Tooltip.Root>
                      <Tooltip.Trigger class="min-w-0 rounded-full p-0 text-left">
                        <span class={attendanceCurrentClass(currentLabel)}>
                          <span class={attendanceMarkerClass(currentLabel)}></span>
                          <span class="truncate">{attendanceMarker(currentLabel).shortLabel}</span>
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        side="top"
                        class="max-w-80 flex-col items-start gap-1 border bg-popover text-popover-foreground shadow-md"
                      >
                        <div class="font-medium">Current event</div>
                        <div>Status: {currentLabel}</div>
                        <div>Luma status: {humanStatus(guest.approval_status)}</div>
                        <div>Registered: {formatDate(guest.registered_at)}</div>
                        {#if guest.checked_in_at}
                          <div>Checked in: {formatDate(guest.checked_in_at)}</div>
                        {/if}
                      </Tooltip.Content>
                    </Tooltip.Root>
                  {/if}

                  {#if guest.event_history.length}
                    <div class="grid max-w-[112px] grid-cols-8 gap-[3px]">
                      {#each guest.event_history as history}
                        {@const historyLabel = historyAttendanceLabel(history)}
                        <Tooltip.Root>
                          <Tooltip.Trigger class="size-3 rounded-sm p-0 text-left" aria-label={`${historyLabel}: ${history.event_name}`}>
                            <span class={attendanceMarkerClass(historyLabel)}></span>
                          </Tooltip.Trigger>
                          <Tooltip.Content
                            side="top"
                            class="max-w-96 flex-col items-start gap-1 border bg-popover text-popover-foreground shadow-md"
                          >
                            <div class="font-medium">{history.event_name}</div>
                            <div>Status: {historyLabel}</div>
                            <div>Event time: {formatDate(history.event_start_at)}</div>
                            <div>Luma status: {humanStatus(history.approval_status)}</div>
                            <div>Internal state: {humanStatus(history.status_internal)}</div>
                            <div>Registered: {formatDate(history.registered_at)}</div>
                            {#if history.checked_in_at}
                              <div>Checked in: {formatDate(history.checked_in_at)}</div>
                            {/if}
                            {#if history.ticket_name}
                              <div>Ticket: {history.ticket_name}</div>
                            {/if}
                            {#if history.event_url}
                              <a class="text-primary underline" href={history.event_url}>Open Luma event</a>
                            {/if}
                          </Tooltip.Content>
                        </Tooltip.Root>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-xs text-muted-foreground">No prior</span>
                  {/if}
                  {#if guest.prior_attended_count > 0}
                    <span class="truncate text-[10px] text-muted-foreground">{guest.prior_attended_count} checked in</span>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class={tableCellClass(wrapAnswers ? 'w-[220px] min-w-[200px]' : 'w-[185px] min-w-[175px]')}>
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class={cn('font-medium', compactTextClass())} title={guest.name ?? 'No name'}>
                    {guest.name ?? 'No name'}
                  </div>
                  <a class={cn('text-muted-foreground hover:underline', compactTextClass())} href={`mailto:${guest.email}`} title={guest.email}>{guest.email}</a>
                  <span class="text-xs text-muted-foreground">Registered {formatDate(guest.registered_at)}</span>
                </div>
              </Table.Cell>
              {#if showDedicatedGithubColumn()}
                <Table.Cell
                  id={`guest-${guest.id}`}
                  class={tableCellClass('group/github relative overflow-visible', githubColumnClass())}
                  data-action-cell="true"
                >
                  <div class={cn('relative flex min-w-0 max-w-full flex-col overflow-hidden', tableDensity === 'compact' ? 'gap-1' : 'gap-2')}>
                    {#if guest.github_username}
                      <a class="inline-flex min-w-0 items-center gap-1 font-medium hover:underline" href={`https://github.com/${guest.github_username}`}>
                        <img class="size-3.5 shrink-0 rounded-sm" src="https://github.githubassets.com/favicons/favicon.svg" alt="" />
                        <span class="truncate">{guest.github_username}</span>
                      </a>
                      <GithubHeatmap weeks={guest.weeks} />
                      <div class="truncate text-xs text-muted-foreground" title={githubStats(guest)}>
                        {githubStats(guest)}
                      </div>
                      {#if guest.top_repositories.length}
                        <div class="flex min-w-0 max-w-full flex-col gap-0.5 overflow-hidden">
                          {#each guest.top_repositories.slice(0, 3) as repo}
                            <a class="flex min-w-0 items-center gap-1 text-xs hover:underline" href={repo.url} title={repo.description ?? repo.name}>
                              <GitFork class="size-3 shrink-0 text-muted-foreground" />
                              <span class="min-w-0 truncate">{repo.name.replace(`${guest.github_username}/`, '')}</span>
                              <span class="shrink-0 text-muted-foreground">{repo.stars} stars</span>
                            </a>
                          {/each}
                        </div>
                      {/if}
                    {:else}
                      <span class="text-sm text-muted-foreground">No GitHub profile yet</span>
                    {/if}
                    <form
                      class="absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover/github:opacity-100 focus-within:opacity-100 data-[action-working=true]:opacity-100"
                      method="POST"
                      action={`/api/guests/${guest.id}/enrich`}
                      use:submitInPlace
                      data-action-label={`Refetch GitHub for ${guest.email}`}
                      data-inline-status="button"
                      data-cell-progress="true"
                    >
                      <input type="hidden" name="next" value={`${data.next}#guest-${guest.id}`} />
                      <input type="hidden" name="type" value="github" />
                      <input type="hidden" name="force" value="true" />
                      <Button
                        type="submit"
                        size="xs"
                        variant="outline"
                        class="h-6 min-w-[4.75rem] justify-start bg-background/95 px-1.5 text-[11px] shadow-sm"
                        title="Refetch this GitHub graph"
                      >
                        <RefreshCw class="size-3" />
                        <span data-action-label-text>Fetch</span>
                      </Button>
                    </form>
                  </div>
                </Table.Cell>
              {/if}
              {#if data.answerColumns.length}
                {#each data.answerColumns as column}
                  {@const answer = answerFor(guest.answers, column)}
                  {@const display = displayAnswer(answer, column)}
                  {@const linkedInColumn = isLinkedinColumn(column)}
                  {@const displayHref = linkedInColumn ? (display.href ?? guest.linkedin_url) : display.href}
                  {@const displayPrimary = linkedInColumn ? linkedinPrimary(display, guest) : display.primary}
                  {#if isGithubColumn(column)}
                    <Table.Cell
                      id={`guest-${guest.id}`}
                      class={tableCellClass(answerColumnClass(column), 'group/github relative overflow-visible')}
                      data-action-cell="true"
                    >
                      <div class={cn('relative flex min-w-0 max-w-full flex-col overflow-hidden', tableDensity === 'compact' ? 'gap-1' : 'gap-2')}>
                        {#if guest.github_username}
                          <a class="inline-flex min-w-0 items-center gap-1 font-medium hover:underline" href={`https://github.com/${guest.github_username}`}>
                            <img class="size-3.5 shrink-0 rounded-sm" src="https://github.githubassets.com/favicons/favicon.svg" alt="" />
                            <span class="truncate">{guest.github_username}</span>
                          </a>
                          <GithubHeatmap weeks={guest.weeks} />
                          <div class="truncate text-xs text-muted-foreground" title={githubStats(guest)}>
                            {githubStats(guest)}
                          </div>
                          {#if guest.top_repositories.length}
                            <div class="flex min-w-0 max-w-full flex-col gap-0.5 overflow-hidden">
                              {#each guest.top_repositories.slice(0, 3) as repo}
                                <a class="flex min-w-0 items-center gap-1 text-xs hover:underline" href={repo.url} title={repo.description ?? repo.name}>
                                  <GitFork class="size-3 shrink-0 text-muted-foreground" />
                                  <span class="min-w-0 truncate">{repo.name.replace(`${guest.github_username}/`, '')}</span>
                                  <span class="shrink-0 text-muted-foreground">{repo.stars} stars</span>
                                </a>
                              {/each}
                            </div>
                          {/if}
                        {:else if display.kind !== 'empty'}
                          <div class="flex min-w-0 flex-col gap-0.5">
                            {#if display.href}
                              <a class="inline-flex min-w-0 items-center gap-1 font-medium hover:underline" href={display.href}>
                                <img class="size-3.5 shrink-0 rounded-sm" src="https://github.githubassets.com/favicons/favicon.svg" alt="" />
                                <span class="truncate">{display.primary}</span>
                                <ExternalLink class="size-3 shrink-0" />
                              </a>
                            {:else}
                              <span class="inline-flex min-w-0 items-center gap-1 font-medium">
                                <img class="size-3.5 shrink-0 rounded-sm" src="https://github.githubassets.com/favicons/favicon.svg" alt="" />
                                <span class="truncate">{display.primary}</span>
                              </span>
                            {/if}
                            <span class="truncate text-xs text-muted-foreground">Graph not fetched yet</span>
                          </div>
                        {:else}
                          <span class="text-sm text-muted-foreground">No GitHub profile yet</span>
                        {/if}
                        <form
                          class="absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover/github:opacity-100 focus-within:opacity-100 data-[action-working=true]:opacity-100"
                          method="POST"
                          action={`/api/guests/${guest.id}/enrich`}
                          use:submitInPlace
                          data-action-label={`Refetch GitHub for ${guest.email}`}
                          data-inline-status="button"
                          data-cell-progress="true"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-${guest.id}`} />
                          <input type="hidden" name="type" value="github" />
                          <input type="hidden" name="force" value="true" />
                          <Button
                            type="submit"
                            size="xs"
                            variant="outline"
                            class="h-6 min-w-[4.75rem] justify-start bg-background/95 px-1.5 text-[11px] shadow-sm"
                            title="Refetch this GitHub graph"
                          >
                            <RefreshCw class="size-3" />
                            <span data-action-label-text>Fetch</span>
                          </Button>
                        </form>
                      </div>
                    </Table.Cell>
                  {:else}
                    <Table.Cell
                      class={tableCellClass(answerColumnClass(column), linkedInColumn && 'group/linkedin relative overflow-visible')}
                      data-action-cell={linkedInColumn ? 'true' : undefined}
                    >
                      <div
                        class={cn(
                          'min-w-0 overflow-hidden',
                          linkedInColumn && 'flex w-full flex-col pr-20',
                          !wrapAnswers && !linkedInColumn && 'max-h-6'
                        )}
                        title={fullAnswerText(displayPrimary, display.secondary)}
                      >
                        {#if displayHref}
                          <a class="inline-flex max-w-full items-center gap-1 font-medium text-primary hover:underline" href={displayHref}>
                            {#if linkedInColumn}
                              <img class="size-3 shrink-0 rounded-[2px]" src="https://www.linkedin.com/favicon.ico" alt="" />
                            {/if}
                            <span class="truncate">{displayPrimary}</span>
                            <ExternalLink class="size-3 shrink-0" />
                          </a>
                        {:else if display.secondary && !wrapAnswers}
                          <div class="truncate font-medium">
                            {displayPrimary}
                            <span class="font-normal text-muted-foreground"> · {display.secondary}</span>
                          </div>
                        {:else}
                          <div class={cn(compactTextClass(), display.kind === 'empty' ? 'text-muted-foreground' : 'font-medium')}>
                            {displayPrimary}
                          </div>
                        {/if}
                        {#if display.secondary && wrapAnswers}
                          <div class={cn('text-xs text-muted-foreground', wrapAnswers ? 'mt-0.5 whitespace-pre-wrap' : 'truncate')}>
                            {display.secondary}
                          </div>
                        {/if}
                        {#if linkedInColumn && hasLinkedinEnrichment(guest)}
                          {@const linkedInHeadline = linkedinHeadline(guest)}
                          {@const linkedInMeta = linkedinMeta(guest)}
                          {@const linkedInOrg = linkedinOrganizationSummary(guest)}
                          {@const linkedInSignal = linkedinSignalLine(guest)}
                          {@const linkedInStats = linkedinStatsLine(guest)}
                          {@const linkedInWorkHistory = linkedinWorkHistory(guest)}
                          {@const linkedInVisibleJobs = linkedinVisibleJobs(guest)}
                          {@const linkedInCurrentRole = linkedinCurrentRoleFallback(guest)}
                          <div class="mt-0.5 flex min-w-0 flex-col gap-0.5 text-xs">
                            <Tooltip.Root>
                              <Tooltip.Trigger
                                class="block min-w-0 rounded-sm p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                aria-label={`LinkedIn details for ${guest.email}`}
                              >
                                <span class="flex min-w-0 items-center gap-1 font-medium text-foreground">
                                  {#if guest.linkedin_avatar_url}
                                    <img class="size-4 shrink-0 rounded-full object-cover" src={guest.linkedin_avatar_url} alt="" />
                                  {:else if guest.favicon_url}
                                    <img class="size-3 shrink-0 rounded-sm" src={guest.favicon_url} alt="" />
                                  {/if}
                                  <span class="truncate">
                                    {[guest.linkedin_display_name, linkedInHeadline].filter(Boolean).join(' · ') || 'LinkedIn profile'}
                                  </span>
                                </span>
                                {#if linkedInSignal}
                                  <span class="mt-0.5 block truncate text-muted-foreground">{linkedInSignal}</span>
                                {/if}
                                {#if linkedInStats}
                                  <span class="mt-0.5 flex min-w-0 flex-wrap gap-1">
                                    {#if guest.linkedin_followers !== null}
                                      <span class="rounded border bg-muted/50 px-1 leading-4 text-muted-foreground">{guest.linkedin_followers} followers</span>
                                    {/if}
                                    {#if guest.linkedin_connections !== null}
                                      <span class="rounded border bg-muted/50 px-1 leading-4 text-muted-foreground">{guest.linkedin_connections} connections</span>
                                    {/if}
                                    {#if guest.linkedin_organizations.length}
                                      <span class="rounded border bg-muted/50 px-1 leading-4 text-muted-foreground">{guest.linkedin_organizations.length} orgs</span>
                                    {/if}
                                    {#if linkedInWorkHistory.length}
                                      <span class="rounded border bg-muted/50 px-1 leading-4 text-muted-foreground">{linkedInWorkHistory.length} roles</span>
                                    {/if}
                                    {#if guest.linkedin_awards.length}
                                      <span class="rounded border bg-muted/50 px-1 leading-4 text-muted-foreground">{guest.linkedin_awards.length} awards</span>
                                    {/if}
                                  </span>
                                {/if}
                                {#if linkedInVisibleJobs.length}
                                  <span class="mt-1 flex min-w-0 flex-col gap-0.5">
                                    {#each linkedInVisibleJobs as job}
                                      <span class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 rounded-sm border border-transparent bg-muted/30 px-1 py-0.5">
                                        <span class="truncate font-medium text-foreground" title={linkedinJobText(job)}>
                                          {job.title ?? 'Untitled role'}
                                        </span>
                                        {#if job.company}
                                          <span class="truncate text-muted-foreground" title={job.company}>{job.company}</span>
                                        {/if}
                                      </span>
                                    {/each}
                                  </span>
                                {:else if linkedInCurrentRole}
                                  <span class="mt-1 block truncate rounded-sm bg-muted/30 px-1 py-0.5 text-muted-foreground" title={linkedInCurrentRole}>
                                    Current: {linkedInCurrentRole}
                                  </span>
                                {/if}
                                {#if linkedInOrg}
                                  <span class="mt-0.5 block truncate text-muted-foreground">{linkedInOrg}</span>
                                {/if}
                              </Tooltip.Trigger>
                              <Tooltip.Content
                                side="right"
                                sideOffset={8}
                                class="max-w-[380px] flex-col items-start gap-2 border bg-popover p-3 text-popover-foreground shadow-lg"
                              >
                                <div class="flex min-w-0 items-start gap-2">
                                  {#if guest.linkedin_avatar_url}
                                    <img class="size-8 shrink-0 rounded-full object-cover" src={guest.linkedin_avatar_url} alt="" />
                                  {/if}
                                  <div class="min-w-0">
                                    <div class="font-medium">{guest.linkedin_display_name ?? displayPrimary}</div>
                                    {#if linkedInHeadline}
                                      <div class="text-muted-foreground">{linkedInHeadline}</div>
                                    {/if}
                                  </div>
                                </div>
                                {#if linkedInMeta}
                                  <div class="text-muted-foreground">{linkedInMeta}</div>
                                {/if}
                                {#if linkedInWorkHistory.length}
                                  <div class="w-full">
                                    <div class="mb-1 font-medium">Work history</div>
                                    <div class="flex flex-col gap-1 text-muted-foreground">
                                      {#each linkedInWorkHistory as job}
                                        <div class="grid gap-0.5">
                                          <div class="font-medium text-popover-foreground">
                                            {linkedinJobText(job) || 'Untitled role'}
                                          </div>
                                          {#if linkedinJobDateText(job)}
                                            <div class="text-[10px]">{linkedinJobDateText(job)}</div>
                                          {/if}
                                        </div>
                                      {/each}
                                    </div>
                                  </div>
                                {:else if linkedInCurrentRole}
                                  <div class="w-full">
                                    <div class="mb-1 font-medium">Current role</div>
                                    <div class="text-muted-foreground">{linkedInCurrentRole}</div>
                                    <div class="mt-1 text-[10px] text-muted-foreground">No work history returned by BrightData for this profile.</div>
                                  </div>
                                {/if}
                                {#if linkedInOrg}
                                  <div class="w-full">
                                    <div class="mb-1 font-medium">Community / orgs</div>
                                    <div class="flex flex-col gap-0.5 text-muted-foreground">
                                      {#each guest.linkedin_organizations as organization}
                                        <div>{[organization.subtitle, organization.title].filter(Boolean).join(' · ')}</div>
                                      {/each}
                                    </div>
                                  </div>
                                {/if}
                                {#if guest.linkedin_awards.length}
                                  <div class="w-full">
                                    <div class="mb-1 font-medium">Awards</div>
                                    <div class="flex flex-col gap-0.5 text-muted-foreground">
                                      {#each guest.linkedin_awards as award}
                                        <div>{[award.title, award.subtitle].filter(Boolean).join(' · ')}</div>
                                      {/each}
                                    </div>
                                  </div>
                                {/if}
                                {#if guest.linkedin_activity.length}
                                  <div class="w-full">
                                    <div class="mb-1 font-medium">Recent activity</div>
                                    <div class="flex flex-col gap-1 text-muted-foreground">
                                      {#each guest.linkedin_activity as activity}
                                        {#if activity.link}
                                          <a class="line-clamp-2 text-primary underline" href={activity.link}>
                                            {[activity.interaction, activity.title].filter(Boolean).join(' · ')}
                                          </a>
                                        {:else}
                                          <div class="line-clamp-2">{[activity.interaction, activity.title].filter(Boolean).join(' · ')}</div>
                                        {/if}
                                      {/each}
                                    </div>
                                  </div>
                                {/if}
                                {#if guest.past_titles.length}
                                  <div class="text-muted-foreground">Past: {guest.past_titles.slice(0, 5).join(', ')}</div>
                                {/if}
                                {#if guest.profile_updated_at}
                                  <div class="text-[10px] text-muted-foreground">
                                    BrightData {formatDate(guest.profile_updated_at)} · Confidence {guest.profile_confidence ?? 0}
                                  </div>
                                {/if}
                              </Tooltip.Content>
                            </Tooltip.Root>
                            {#if guest.past_titles.length}
                              <div class="truncate text-muted-foreground" title={`Past: ${guest.past_titles.slice(0, 5).join(', ')}`}>
                                Past: {guest.past_titles.slice(0, 3).join(', ')}
                              </div>
                            {/if}
                            {#if linkedinFallbackStatus(guest)}
                              <div
                                class={cn(
                                  'truncate',
                                  guest.linkedin_snapshot_id ? 'text-amber-700' : 'text-muted-foreground'
                                )}
                                title={linkedinFallbackStatus(guest)}
                              >
                                {linkedinFallbackStatus(guest)}
                              </div>
                            {/if}
                            {#if guest.profile_updated_at}
                              <div class="truncate text-[10px] text-muted-foreground" title={`Source: ${guest.profile_source ?? 'unknown'} · Confidence: ${guest.profile_confidence ?? 0}`}>
                                BrightData {formatDate(guest.profile_updated_at)}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                      {#if linkedInColumn}
                        <form
                          class="absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover/linkedin:opacity-100 focus-within:opacity-100 data-[action-working=true]:opacity-100"
                          method="POST"
                          action={`/api/guests/${guest.id}/enrich`}
                          use:submitInPlace
                          data-action-label={`Refetch LinkedIn for ${guest.email}`}
                          data-inline-status="button"
                          data-cell-progress="true"
                        >
                          <input type="hidden" name="next" value={`${data.next}#guest-${guest.id}`} />
                          <input type="hidden" name="type" value="brightdata_linkedin" />
                          <input type="hidden" name="force" value="true" />
                          <Button
                            type="submit"
                            size="xs"
                            variant="outline"
                            class="h-6 min-w-[4.75rem] justify-start bg-background/95 px-1.5 text-[11px] shadow-sm"
                            title="Refetch this LinkedIn profile"
                          >
                            <RefreshCw class="size-3" />
                            <span data-action-label-text>Fetch</span>
                          </Button>
                        </form>
                      {/if}
                    </Table.Cell>
                  {/if}
                {/each}
              {:else}
                <Table.Cell class={tableCellClass('w-[180px] min-w-[180px] text-muted-foreground')}>No registration answers</Table.Cell>
              {/if}
              <Table.Cell class={tableCellClass(wrapAnswers ? 'w-[260px] min-w-[240px]' : 'w-[185px] min-w-[170px]')}>
                <div class="relative min-w-0">
                  <textarea
                    class={cn(
                      'w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 pr-12 text-xs leading-tight outline-none placeholder:text-muted-foreground/70 hover:border-border hover:bg-muted/40 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30',
                      wrapAnswers || tableDensity === 'comfortable'
                        ? 'min-h-14 resize-y whitespace-pre-wrap'
                        : 'h-7 resize-none overflow-hidden whitespace-nowrap'
                    )}
                    name="notes"
                    rows={wrapAnswers || tableDensity === 'comfortable' ? 2 : 1}
                    wrap={wrapAnswers ? 'soft' : 'off'}
                    placeholder="Add note"
                    value={guest.notes}
                    title={guest.notes || 'Add note'}
                    data-action-url={`/api/guests/${guest.id}/note`}
                    data-next={data.next}
                    data-email={guest.email}
                    aria-label={`Notes for ${guest.email}`}
                    use:autoSaveNote
                  ></textarea>
                  <span data-note-status class="hidden"></span>
                </div>
              </Table.Cell>
              <Table.Cell class={tableCellClass('w-[118px] min-w-[108px]')}>
                <div class={cn('flex flex-col', tableDensity === 'compact' ? 'gap-1' : 'gap-2')}>
                  <div class="flex flex-wrap gap-1">
                    <form
                      method="POST"
                      action={`/api/guests/${guest.id}/enrich`}
                      use:submitInPlace
                      data-action-label={`Queue profile enrichment for ${guest.email}`}
                    >
                      <input type="hidden" name="next" value={`${data.next}#guest-${guest.id}`} />
                      <input type="hidden" name="type" value="brightdata_linkedin" />
                      <input type="hidden" name="type" value="score" />
                      <Button type="submit" size="xs" variant="outline">
                        <Sparkles data-icon="inline-start" /> Profile
                      </Button>
                    </form>
                    <form
                      method="POST"
                      action={`/api/guests/${guest.id}/score`}
                      use:submitInPlace
                      data-action-label={`Re-score ${guest.email}`}
                    >
                      <input type="hidden" name="next" value={data.next} />
                      <input type="hidden" name="mode" value="rescore" />
                      <Button type="submit" size="xs" variant="outline">Re-score</Button>
                    </form>
                  </div>
                </div>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={tableColspan()}
                class="py-10 text-center text-sm text-muted-foreground"
              >
                No guests match these filters.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
</main>
</Tooltip.Provider>
