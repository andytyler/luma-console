# Stubbed Test Plan

This app must be testable without touching live external services. Any test that would contact Luma, GitHub, BrightData, Supabase, Google, Resend, Railway, or another third-party service must stub that boundary.

## Non-Negotiable Test Safety Rules

- No test may use a real `LUMA_API_KEY`, stored encrypted Luma key, GitHub token, BrightData token, Supabase project, Google OAuth app, Resend key, or Railway database.
- No test may call a real external URL. Mock `fetch` by default and fail the test on any unhandled network request.
- No test may call live Luma write endpoints. Approval/rejection tests must stub `updateGuestApprovalStatus` or the lower-level `fetch` call.
- Tests that exercise writes must use an isolated local test database, transaction rollback, or a SQL stub. Never use a developer or production `DATABASE_URL`.
- Add a global "network tripwire" test helper that throws if code attempts an unstubbed HTTP request.
- Add a global "mutation tripwire" test helper that throws if a request uses `POST`, `PUT`, `PATCH`, or `DELETE` against an external host.
- Tests may perform local HTTP requests against the SvelteKit test server only.
- Webhook tests must use fixture payloads and fixture secrets.
- OAuth tests must stub Supabase and Google responses.
- Email invite tests must stub Resend and assert payloads, not delivery.

## Recommended Test Harness

- Unit tests: Bun test runner or Vitest.
- Route/action tests: SvelteKit server module tests with mocked `locals`, `request`, `params`, and `url`.
- UI tests: Playwright against a local dev/build server with stubbed backend data or test database fixtures.
- Database tests: disposable Postgres database from Docker, with `TEST_DATABASE_URL`, migrations run before the suite, and cleanup between tests.
- External API fixtures: JSON files under `tests/fixtures`.
- External clients: thin adapter modules should be mocked at module level.

## Test Fixtures To Create

- Luma calendar list response with one calendar.
- Luma calendar list response with multiple calendars.
- Luma calendar response with admins/hosts/managers.
- Luma event list with upcoming, live, and past events.
- Luma event detail with cover image, timezone, location, capacity, visibility, hosts, and raw fields.
- Luma event detail missing optional fields.
- Luma guest list with 600+ guests.
- Luma guest with registration answers in every known Luma shape.
- Luma guest with no registration answers.
- Luma guest with duplicate email across events.
- Luma guest checked in at a prior event.
- Luma guest approved but not checked in at a prior event.
- Luma guest rejected/declined at a prior event.
- Luma guest with ticket name.
- Luma guest with malformed or unknown status.
- GitHub GraphQL profile with contribution calendar.
- GitHub GraphQL profile with no contribution calendar.
- GitHub GraphQL user not found.
- BrightData successful LinkedIn profile response.
- BrightData missing profile response.
- BrightData rate-limit/error response.
- Supabase session success response.
- Supabase session missing/expired response.
- Resend successful send response.
- Resend failed send response.
- Luma webhook signed payloads for guest registered, guest updated, event created, and event updated.
- Luma webhook invalid signature payload.
- Luma webhook duplicate delivery payload.

## Global Safety Tests

1. Unhandled external `fetch` throws immediately.
   - Stub: replace global `fetch` with a guard.
   - Assert: requests to `https://api.lu.ma/...` fail unless explicitly mocked.

2. External mutation request throws immediately.
   - Stub: guarded `fetch`.
   - Assert: `POST`, `PUT`, `PATCH`, and `DELETE` to external hosts fail.

3. Test environment refuses production database URLs.
   - Stub: env values.
   - Assert: tests fail if `DATABASE_URL` points to Railway, Supabase, Neon, RDS, or any non-local host.

4. Luma writes remain disabled by default.
   - Stub: app settings row missing or disabled.
   - Assert: batch apply dry-runs and never calls the Luma update client.

5. Luma write tests require explicit mock opt-in.
   - Stub: mocked Luma update client.
   - Assert: even with app writes enabled, the test uses the mock and records calls only.

6. No test logs API keys or encrypted secrets.
   - Stub: env with sentinel values.
   - Assert: captured logs do not include raw secrets.

## Environment And Configuration

1. Loads required private server env values on the server only.
   - Stub: `$env/static/private` values.
   - Assert: server modules read values correctly.

2. Public Supabase values are only read through public env.
   - Stub: `$env/static/public`.
   - Assert: client code never imports private env.

3. Missing `DATABASE_URL` produces a clear startup/migration error.
   - Stub: env without `DATABASE_URL`.
   - Assert: migration script fails with actionable message.

4. Missing `APP_ENCRYPTION_KEY` in local dev creates a persistent local key.
   - Stub: env without key and isolated local app directory.
   - Assert: `.local/app-encryption-key` is created and reused.

5. Invalid `APP_ENCRYPTION_KEY` is rejected.
   - Stub: too-short key.
   - Assert: encryption helper throws a clear error.

6. Disabled app write toggle blocks real status changes.
   - Stub: app setting disabled and Luma client mock.
   - Assert: no update call is made.

7. `INVITE_EMAILS_ENABLED=false` creates dry-run invites only.
   - Stub: Resend mock.
   - Assert: invite rows are created and no email send is called.

8. Optional enrichment keys can be missing.
   - Stub: no GitHub/BrightData keys.
   - Assert: UI loads and jobs fail or skip cleanly with explicit errors.

## Database And Migration Tests

1. Fresh migration succeeds on an empty test database.
   - Stub: local `TEST_DATABASE_URL`.
   - Assert: all tables and indexes exist.

2. Migration is idempotent.
   - Stub: local `TEST_DATABASE_URL`.
   - Assert: running `db:migrate` twice succeeds.

3. Legacy data migration creates a legacy calendar.
   - Stub: seeded old-style events/users.
   - Assert: events get `calendar_id` and owner membership.

4. Calendar membership uniqueness is enforced.
   - Stub: insert duplicate membership.
   - Assert: conflict updates/ignores as designed.

5. Event uniqueness by `luma_event_id` is enforced.
   - Stub: repeated event import.
   - Assert: event updates instead of duplicating.

6. Guest uniqueness by `(event_id, luma_guest_id)` is enforced.
   - Stub: repeated guest import.
   - Assert: guest updates instead of duplicating.

7. Registration answers replace old answers on guest refresh.
   - Stub: import guest, then import same guest with changed answers.
   - Assert: stale answers are gone.

8. Webhook delivery table enforces idempotency.
   - Stub: same delivery ID twice.
   - Assert: second delivery is ignored or marked duplicate.

9. Deleting a calendar cascades events, guests, invites, and memberships.
   - Stub: seeded calendar graph.
   - Assert: dependent rows are removed.

10. Deleting an event cascades guests and answers.
    - Stub: seeded event.
    - Assert: dependent rows are removed.

11. Guest email index supports case-insensitive history matching.
    - Stub: mixed-case duplicate emails.
    - Assert: prior history matches by lowercase email.

## Auth Tests

1. Unauthenticated users redirect to login.
   - Stub: `locals.user` missing.
   - Assert: protected routes redirect or return 401.

2. First legacy admin can be created from `ADMIN_EMAILS`.
   - Stub: `ADMIN_EMAILS`.
   - Assert: matching email creates admin.

3. First legacy admin cannot be created from a non-admin email.
   - Stub: `ADMIN_EMAILS`.
   - Assert: returns 403 and no user row.

4. Legacy password login succeeds with valid credentials.
   - Stub: seeded user with password hash.
   - Assert: session cookie is set.

5. Legacy password login rejects invalid password.
   - Stub: seeded user.
   - Assert: no session is created.

6. Existing username/password login still works when Google OAuth is not configured.
   - Stub: Supabase env missing.
   - Assert: password path is used.

7. Supabase configured path offers Google OAuth.
   - Stub: Supabase client methods.
   - Assert: login page/action builds OAuth redirect without contacting Google.

8. Supabase callback creates or updates local user.
   - Stub: Supabase session/user response.
   - Assert: user exists and session is set.

9. Supabase callback rejects missing session.
   - Stub: Supabase no-session response.
   - Assert: redirects to login with no local session.

10. Logout clears session cookie.
    - Stub: session in cookies.
    - Assert: cookie is expired.

11. Expired session is rejected.
    - Stub: expired session row.
    - Assert: `locals.user` is empty.

12. Session cookie is httpOnly, secure in production, and sameSite.
    - Stub: production env.
    - Assert: cookie attributes are correct.

13. Role changes take effect on next request.
    - Stub: membership role update.
    - Assert: stale permissions are not cached incorrectly.

## Calendar Permission Tests

1. Owner can view calendar events.
   - Stub: membership owner.
   - Assert: `/events?calendar_id=...` returns events.

2. Admin can view calendar events.
   - Stub: membership admin.
   - Assert: access allowed.

3. Reviewer can view calendar events.
   - Stub: membership reviewer.
   - Assert: access allowed.

4. Non-member cannot view calendar events.
   - Stub: no membership.
   - Assert: 403.

5. Owner can import/sync.
   - Stub: Luma read client.
   - Assert: sync action runs.

6. Admin can import/sync.
   - Stub: Luma read client.
   - Assert: sync action runs.

7. Reviewer cannot import/sync.
   - Stub: reviewer membership.
   - Assert: 403 before Luma client is called.

8. Reviewer can add notes if intended.
   - Stub: reviewer membership.
   - Assert: note endpoint behavior matches intended policy.

9. Cross-calendar event access is blocked.
   - Stub: user member of calendar A, event belongs to calendar B.
   - Assert: 403.

10. Cross-calendar guest mutation is blocked.
    - Stub: user member of calendar A, guest belongs to calendar B.
    - Assert: 403 and no DB update.

11. Cross-calendar export is blocked.
    - Stub: wrong membership.
    - Assert: 403 and no CSV.

12. Calendar-scoped API key is used for imports.
    - Stub: two calendars with different encrypted keys.
    - Assert: event import uses the correct calendar key only.

## Invite And Team Tests

1. Calendar admin can create reviewer invite.
   - Stub: local DB.
   - Assert: invite row with hashed token is created.

2. Calendar admin can create admin invite.
   - Stub: local DB.
   - Assert: invite role is admin.

3. Reviewer cannot create invites.
   - Stub: reviewer membership.
   - Assert: 403.

4. Invite tokens are never stored raw.
   - Stub: generated token.
   - Assert: DB stores hash only.

5. Accepting valid invite adds membership.
   - Stub: invite row and signed-in user.
   - Assert: membership created.

6. Accepting expired invite fails.
   - Stub: expired invite.
   - Assert: no membership created.

7. Accepting already-used invite fails or is idempotent.
   - Stub: used invite.
   - Assert: behavior is deterministic.

8. Invite email dry-run does not call Resend.
   - Stub: `INVITE_EMAILS_ENABLED=false`.
   - Assert: no email call.

9. Invite email enabled calls Resend mock only.
   - Stub: Resend client mock.
   - Assert: payload includes invite URL, role, calendar name.

10. Resend failure records error without exposing token.
    - Stub: Resend error.
    - Assert: UI/action shows safe error.

11. Importing Luma calendar admins creates people records.
    - Stub: Luma calendar fixture.
    - Assert: `luma_calendar_people` rows are upserted.

12. Sending invites to imported admins respects existing users.
    - Stub: existing user by email.
    - Assert: membership/invite behavior is correct.

## Luma Normalization Tests

1. Normalizes event ID from all known Luma ID fields.
   - Stub: event fixtures with alternative key names.
   - Assert: `luma_event_id` is consistent.

2. Normalizes event name/title.
   - Stub: fixtures with `name`, `title`.
   - Assert: event name is populated.

3. Normalizes cover image from all known image paths.
   - Stub: fixtures with cover URL variants.
   - Assert: `cover_url` is populated.

4. Handles missing cover image.
   - Stub: event fixture without cover.
   - Assert: import succeeds with `cover_url=null`.

5. Normalizes start/end time and timezone.
   - Stub: event fixture.
   - Assert: timestamps and timezone persist.

6. Normalizes calendar metadata.
   - Stub: calendar fixture.
   - Assert: calendar ID, name, icon/avatar, URL, and raw JSON persist.

7. Normalizes guest ID from all known guest ID fields.
   - Stub: guest fixtures.
   - Assert: `luma_guest_id` persists.

8. Normalizes guest email from guest or nested user.
   - Stub: variants.
   - Assert: email lowercased.

9. Rejects guest without email.
   - Stub: invalid fixture.
   - Assert: guest is skipped.

10. Rejects guest without ID.
    - Stub: invalid fixture.
    - Assert: guest is skipped.

11. Normalizes approval status.
    - Stub: pending, approved, going, waitlist, declined.
    - Assert: raw approval status persists.

12. Normalizes checked-in time.
    - Stub: checked-in fixture.
    - Assert: `checked_in_at` persists.

13. Normalizes registered time.
    - Stub: fixture with created/registered variants.
    - Assert: `registered_at` persists.

14. Normalizes ticket name.
    - Stub: ticket variants.
    - Assert: `ticket_name` persists.

15. Normalizes answers from `registration_answers`.
    - Stub: fixture.
    - Assert: question, key, answer, raw JSON persist.

16. Normalizes answers from `registrationAnswers`.
    - Stub: fixture.
    - Assert: same.

17. Normalizes answers from `answers`.
    - Stub: fixture.
    - Assert: same.

18. Normalizes answers from nested `registration.answers`.
    - Stub: fixture.
    - Assert: same.

19. Normalizes multi-select answer arrays.
    - Stub: answer array.
    - Assert: answer text joins cleanly.

20. Normalizes object answer values.
    - Stub: object with `label`, `value`, `text`, `name`.
    - Assert: best readable text selected.

21. Preserves unknown answer raw JSON.
    - Stub: unusual answer shape.
    - Assert: raw JSON available for future type detection.

## Luma Import Tests

1. Imports all calendars for a user API key.
   - Stub: Luma calendar list endpoint.
   - Assert: calendars created/updated.

2. Re-importing calendars is idempotent.
   - Stub: same response twice.
   - Assert: no duplicates.

3. Imports all events for a calendar.
   - Stub: paginated Luma event list.
   - Assert: all events stored.

4. Re-importing events updates changed fields.
   - Stub: changed cover/name/date.
   - Assert: existing event updated.

5. Imports guest list for each event.
   - Stub: paginated guest response.
   - Assert: all guests stored.

6. Re-importing guests updates statuses and answers.
   - Stub: guest status changed.
   - Assert: existing guest updated.

7. Pagination stops at the final page.
   - Stub: next cursor then null.
   - Assert: exact request count.

8. API rate-limit response is handled.
   - Stub: 429.
   - Assert: job/action returns retryable error and no partial corruption.

9. API 401 response is handled.
   - Stub: invalid key response.
   - Assert: clear onboarding error.

10. API 500 response is handled.
    - Stub: server error.
    - Assert: clear retryable error.

11. Import never calls Luma write endpoint.
    - Stub: mutation tripwire.
    - Assert: only GET requests are attempted.

12. Calendar-scoped encrypted API key is decrypted only server-side.
    - Stub: encrypted key.
    - Assert: import receives plain key; client payload never includes it.

13. Import event cover image does not download image.
    - Stub: event with cover URL.
    - Assert: only URL is stored; no image fetch occurs.

14. Import handles empty event list.
    - Stub: empty response.
    - Assert: onboarding still succeeds with zero events.

15. Import handles empty guest list.
    - Stub: empty guests.
    - Assert: event guest counts update to zero.

16. Import preserves raw JSON for event and guest.
    - Stub: fixture with extra fields.
    - Assert: raw JSON contains extra fields.

17. Import updates event aggregate counts.
    - Stub: guests with pending/approved/waitlist.
    - Assert: counts are correct.

18. Import queues jobs only when explicitly requested.
    - Stub: job table.
    - Assert: import alone does not unexpectedly enqueue external enrichment.

## Event List UI Tests

1. Shows all imported calendars in calendar selector.
   - Stub: server data.
   - Assert: names visible.

2. Shows calendar icon/avatar when available.
   - Stub: calendar image URL.
   - Assert: image renders with alt/fallback.

3. Shows all events for selected calendar.
   - Stub: events data.
   - Assert: only selected calendar events display.

4. Past events are greyed out.
   - Stub: past event.
   - Assert: past styling class or visual state.

5. Upcoming events are not greyed out.
   - Stub: upcoming event.
   - Assert: normal styling.

6. Live event is marked live.
   - Stub: start before now and end after now.
   - Assert: live status text/badge.

7. Countdown displays days/hours/minutes correctly.
   - Stub: fixed current time.
   - Assert: relative label is correct.

8. Event cover image is displayed.
   - Stub: cover URL.
   - Assert: image `src`.

9. Event without cover uses fallback.
   - Stub: no cover.
   - Assert: fallback visible.

10. Sync all events button calls local action only.
    - Stub: route action/import client.
    - Assert: no external unstubbed requests.

## Event Detail UI Tests

1. Event hero displays cover image.
   - Stub: event with cover URL.
   - Assert: image visible.

2. Event hero greyscale for past event.
   - Stub: past event.
   - Assert: greyscale class.

3. Event metadata displays start, end, timezone, Luma ID.
   - Stub: event data.
   - Assert: text visible.

4. Event context displays description.
   - Stub: raw JSON description.
   - Assert: text visible.

5. Event context displays location.
   - Stub: raw JSON location.
   - Assert: location visible.

6. Event context displays capacity.
   - Stub: raw JSON capacity.
   - Assert: capacity visible.

7. Event context displays hosts.
   - Stub: raw JSON hosts.
   - Assert: host pills visible.

8. Raw Luma event data disclosure includes field names.
   - Stub: raw JSON.
   - Assert: fields appear when details opened.

9. Guest status count cards match data.
   - Stub: status counts.
   - Assert: all status counts visible.

10. Filters preserve selected state.
    - Stub: URL search params.
    - Assert: selected options and checkbox state.

11. GitHub found filter narrows rows.
    - Stub: server query or mocked data.
    - Assert: rows match.

12. Prior attendee filter narrows to checked-in prior attendees only.
    - Stub: guest history.
    - Assert: only matching guests visible.

13. Empty guest state has correct colspan with dynamic answer columns.
    - Stub: no guests and several questions.
    - Assert: empty state spans full table.

## Dynamic Answer Column Tests

1. One Luma question creates one answer column.
   - Stub: `answerColumns` with one item.
   - Assert: one question header appears.

2. Three Luma questions create three answer columns.
   - Stub: `answerColumns` with three items.
   - Assert: three headers and three cells per row.

3. Question text appears at top of column.
   - Stub: question text.
   - Assert: header text equals question.

4. Question type appears under header.
   - Stub: `question_type`.
   - Assert: type label visible.

5. Missing question type displays `answer`.
   - Stub: `question_type=null`.
   - Assert: fallback visible.

6. Answer matches by `question_key` when available.
   - Stub: duplicate question text but distinct keys.
   - Assert: correct answer in correct column.

7. Answer falls back to question text matching.
   - Stub: no question key.
   - Assert: answer appears.

8. Missing answer displays `No answer`.
   - Stub: column without guest answer.
   - Assert: fallback visible.

9. Empty answer displays `No answer`.
   - Stub: answer empty string.
   - Assert: fallback visible.

10. Long answer wraps and scrolls inside cell.
    - Stub: long answer.
    - Assert: cell has max-height/overflow behavior.

11. Multi-line answer preserves line breaks.
    - Stub: answer with newline.
    - Assert: whitespace preserved.

12. Answer columns are ordered by Luma position.
    - Stub: raw JSON positions out of lexical order.
    - Assert: headers ordered by position.

13. Answer columns fall back to key ordering.
    - Stub: no positions, keys available.
    - Assert: headers ordered by key.

14. Answer columns fall back to question text ordering.
    - Stub: no positions/keys.
    - Assert: stable alphabetical order.

15. Answer count in header reflects event answer count.
    - Stub: answer counts.
    - Assert: header count visible.

16. Notes still display after answer columns moved.
    - Stub: guest note.
    - Assert: note appears in actions column.

17. CSV export still includes answers after table change.
    - Stub: export route data.
    - Assert: answer text is included.

18. Dynamic columns do not remove action buttons.
    - Stub: event with many questions.
    - Assert: approve/pool/reject/enrich/score/note actions remain visible.

## Prior Event History Tests

1. Guest with checked-in prior event shows checked-in prior count.
   - Stub: same email, previous event, `checked_in_at`.
   - Assert: count is 1.

2. Guest with approved but not checked-in prior event does not increment checked-in count.
   - Stub: prior approved no check-in.
   - Assert: checked-in count is 0.

3. Guest history is scoped to same calendar.
   - Stub: same email in another calendar.
   - Assert: history excludes other calendar.

4. Guest history excludes current event duplicates.
   - Stub: duplicate email in same event.
   - Assert: not shown as prior.

5. Prior checked-in event pill says `went`.
   - Stub: history row with `checked_in_at`.
   - Assert: pill label starts `went`.

6. Prior approved event pill says `going`.
   - Stub: history row approved no check-in.
   - Assert: pill label starts `going`.

7. Prior rejected event pill uses rejected/declined status.
   - Stub: history row rejected/declined.
   - Assert: destructive/status label.

8. Current event checked-in pill says `checked in`.
   - Stub: current guest `checked_in_at`.
   - Assert: current pill visible.

9. Current event approved pill says `going`.
   - Stub: approved no check-in.
   - Assert: current pill visible.

10. History tooltip includes event name.
    - Stub: history row.
    - Assert: tooltip text.

11. History tooltip includes Luma status.
    - Stub: status.
    - Assert: tooltip text.

12. History tooltip includes internal state.
    - Stub: internal state.
    - Assert: tooltip text.

13. History tooltip includes checked-in time when present.
    - Stub: checked-in timestamp.
    - Assert: formatted time visible.

14. History tooltip includes ticket name when present.
    - Stub: ticket name.
    - Assert: tooltip text.

15. History tooltip includes event link when present.
    - Stub: event URL.
    - Assert: link visible.

16. History caps at 12 rows.
    - Stub: more than 12 prior events.
    - Assert: only latest 12 returned.

17. History is sorted newest first.
    - Stub: several prior events.
    - Assert: order descending by start time.

## Guest Decision Tests

1. Approve candidate updates internal status only.
   - Stub: DB guest.
   - Assert: `status_internal=approve_candidate`, Luma not called.

2. Reject candidate updates internal status only.
   - Stub: DB guest.
   - Assert: `status_internal=reject_candidate`, Luma not called.

3. Pool updates internal status only.
   - Stub: DB guest.
   - Assert: `status_internal=pool`, Luma not called.

4. Invalid internal status is rejected.
   - Stub: invalid form.
   - Assert: 400 and no DB update.

5. Decision creates audit row.
   - Stub: reviewer user.
   - Assert: `decisions` row records from/to/reviewer.

6. Decision requires event/calendar access.
   - Stub: unauthorized user.
   - Assert: 403 before DB mutation.

7. Approved/rejected final statuses are protected if intended.
   - Stub: final status guest.
   - Assert: behavior matches policy.

8. Next redirect is sanitized.
   - Stub: external `next`.
   - Assert: no open redirect.

## Batch Action Tests

1. Preview approve batch returns candidate count.
   - Stub: approve candidates.
   - Assert: count and guest IDs returned.

2. Preview reject batch returns candidate count.
   - Stub: reject candidates.
   - Assert: count and guest IDs returned.

3. Dry-run approval does not call Luma.
   - Stub: Luma update mock.
   - Assert: zero calls.

4. Dry-run rejection does not call Luma.
   - Stub: Luma update mock.
   - Assert: zero calls.

5. Real apply requires the app write toggle enabled.
   - Stub: app setting disabled.
   - Assert: blocked before Luma mock.

6. Real apply requires confirmation text `APPLY`.
   - Stub: env true, bad confirm.
   - Assert: blocked before Luma mock.

7. Real approval calls mocked Luma client once per selected guest.
   - Stub: env true, confirm apply, Luma mock.
   - Assert: calls have approved status and message.

8. Real rejection calls mocked Luma client once per selected guest.
   - Stub: env true, confirm apply, Luma mock.
   - Assert: calls have declined status and message.

9. Partial Luma failure is handled.
   - Stub: one mock call fails.
   - Assert: successes/failures reported and DB consistent.

10. Batch apply updates local statuses only after successful mocked Luma write.
    - Stub: mixed success/failure.
    - Assert: failed guest not marked final.

11. Batch source status limits selected guests.
    - Stub: mixed statuses.
    - Assert: only source status guests are touched.

12. Empty batch is a no-op.
    - Stub: no candidates.
    - Assert: no Luma calls and clear result.

13. Batch action requires admin access.
    - Stub: reviewer role.
    - Assert: 403.

14. Batch action never sends unstubbed external POST.
    - Stub: mutation tripwire.
    - Assert: no tripwire hit.

## Notes Tests

1. Saving note updates guest notes.
   - Stub: guest row.
   - Assert: note persisted.

2. Empty note clears notes.
   - Stub: note row.
   - Assert: empty string persisted.

3. Very long note is handled.
   - Stub: long text.
   - Assert: persisted or rejected according to limit.

4. Note save requires calendar access.
   - Stub: unauthorized user.
   - Assert: 403.

5. Note save does not call external APIs.
   - Stub: network tripwire.
   - Assert: no calls.

## GitHub Enrichment Tests

1. Extracts GitHub username from explicit answer.
   - Stub: guest answers.
   - Assert: username candidate.

2. Extracts GitHub username from URL answer.
   - Stub: `https://github.com/user`.
   - Assert: `user`.

3. Ignores non-GitHub URLs.
   - Stub: website answer.
   - Assert: no username.

4. Calls mocked GitHub GraphQL with expected query.
   - Stub: GitHub fetch mock.
   - Assert: query contains contribution calendar.

5. Stores contribution total, repos, followers, avatar.
   - Stub: GraphQL success fixture.
   - Assert: `github_profiles` fields.

6. Stores weeks for heatmap.
   - Stub: calendar fixture.
   - Assert: JSON weeks stored.

7. Handles user not found.
   - Stub: GraphQL errors/null user.
   - Assert: job fails or marks no profile cleanly.

8. Handles GitHub rate limit.
   - Stub: rate-limit response.
   - Assert: retryable job state.

9. Handles missing GitHub token.
   - Stub: env missing.
   - Assert: clear skipped/failed job message.

10. GitHub enrichment never calls real GitHub.
    - Stub: network tripwire.
    - Assert: only mock called.

## BrightData LinkedIn Enrichment Tests

1. Extracts LinkedIn URL from explicit answer.
   - Stub: guest answers.
   - Assert: profile URL candidate.

2. Extracts LinkedIn URL from raw profile field.
   - Stub: profile row.
   - Assert: URL used.

3. Does not infer low-confidence LinkedIn by default.
   - Stub: name/email only.
   - Assert: no BrightData job call unless URL/source is configured.

4. Calls mocked BrightData endpoint with expected payload.
   - Stub: BrightData client mock.
   - Assert: payload includes profile URL.

5. Stores current title/company/location/bio/avatar.
   - Stub: success fixture.
   - Assert: profile fields.

6. Stores work history.
   - Stub: positions fixture.
   - Assert: work history rows.

7. Stores company domain and favicon.
   - Stub: company domain.
   - Assert: company row.

8. Handles missing BrightData key.
   - Stub: env missing.
   - Assert: clear skipped/failed job.

9. Handles BrightData no-result.
   - Stub: no result fixture.
   - Assert: confidence low and no crash.

10. Handles BrightData rate limit.
    - Stub: 429.
    - Assert: retryable job state.

11. BrightData enrichment never calls real BrightData.
    - Stub: network tripwire.
    - Assert: only mock called.

## Company And Favicon Tests

1. Builds Google favicon URL from domain.
   - Stub: domain.
   - Assert: expected `s2/favicons` URL.

2. Does not fetch favicon during tests/import.
   - Stub: network tripwire.
   - Assert: URL only, no request.

3. Handles invalid domain.
   - Stub: invalid text.
   - Assert: no crash and no fetch.

4. Company rows upsert by domain.
   - Stub: repeated company.
   - Assert: one company row.

## Scoring Tests

1. Prior checked-in attendance adds score.
   - Stub: same-calendar checked-in prior guest.
   - Assert: score includes prior attendance bonus.

2. Prior approved but not checked-in event does not add attendance bonus.
   - Stub: no checked-in timestamp.
   - Assert: no prior attendance bonus.

3. Other-calendar attendance does not add score.
   - Stub: same email on another calendar.
   - Assert: no bonus.

4. Relevant title adds score.
   - Stub: title `AI engineer`.
   - Assert: title bonus.

5. Vendor/sales/recruiting signals subtract score.
   - Stub: title/answers.
   - Assert: penalty.

6. Specific answers add score.
   - Stub: long meaningful answers.
   - Assert: answer bonus.

7. Vague answers subtract score.
   - Stub: `n/a`, `yes`, empty.
   - Assert: penalty.

8. Strong GitHub activity adds max GitHub score.
   - Stub: 500+ contributions.
   - Assert: high bonus.

9. Some GitHub activity adds medium GitHub score.
   - Stub: 100+ contributions.
   - Assert: medium bonus.

10. GitHub username without activity adds small score.
    - Stub: username only.
    - Assert: small bonus.

11. Missing GitHub subtracts score.
    - Stub: no username/profile.
    - Assert: penalty.

12. Company identified adds score.
    - Stub: current company.
    - Assert: company bonus.

13. Score is clamped 0-100.
    - Stub: extreme positive/negative signals.
    - Assert: bounds.

14. Locked score is not changed.
    - Stub: `score_locked=true`.
    - Assert: function returns null/no update.

15. Final approved/rejected internal status is preserved.
    - Stub: status approved/rejected.
    - Assert: scoring does not overwrite final status.

16. Score reason JSON includes positive, negative, and signals.
    - Stub: normal profile.
    - Assert: reason shape.

17. Scoring never calls external APIs.
    - Stub: network tripwire.
    - Assert: no calls.

## Job Queue Tests

1. Enqueue GitHub jobs for event guests.
   - Stub: guests.
   - Assert: one job per guest where needed.

2. Enqueue BrightData jobs for event guests.
   - Stub: guests with LinkedIn URLs.
   - Assert: jobs created.

3. Enqueue score jobs for event guests.
   - Stub: guests.
   - Assert: jobs created.

4. Enqueue is idempotent.
   - Stub: existing queued jobs.
   - Assert: no duplicates.

5. Run next job marks job running.
   - Stub: queued job.
   - Assert: state transition.

6. Successful job marks succeeded.
   - Stub: enrichment function mock.
   - Assert: status succeeded and finished timestamp.

7. Failed job records error.
   - Stub: enrichment throws.
   - Assert: status failed and safe error text.

8. Retryable job returns to queued.
   - Stub: retryable error.
   - Assert: queued with attempt count.

9. Worker processes only jobs for requested event when event ID passed.
   - Stub: jobs across events.
   - Assert: only target event jobs run.

10. Worker never uses live external APIs.
    - Stub: enrichment adapters.
    - Assert: mocks only.

11. Concurrent workers do not process same job twice.
    - Stub: two worker calls.
    - Assert: lock/skip behavior.

12. Job dashboard counts queued/running/succeeded/failed.
    - Stub: job rows.
    - Assert: counts match.

## Webhook Tests

1. Valid Luma signature is accepted.
   - Stub: fixture secret and payload.
   - Assert: 2xx response.

2. Invalid Luma signature is rejected.
   - Stub: bad signature.
   - Assert: 401/403 and no processing.

3. Missing signature is rejected.
   - Stub: no signature header.
   - Assert: 401/403.

4. Duplicate delivery is idempotent.
   - Stub: same delivery ID twice.
   - Assert: second request does not reprocess.

5. Guest registered webhook refreshes affected guest/event through mocked Luma reads.
   - Stub: Luma GET client.
   - Assert: guest imported.

6. Guest updated webhook refreshes affected guest/event through mocked Luma reads.
   - Stub: Luma GET client.
   - Assert: guest updated.

7. Event created webhook refreshes event through mocked Luma reads.
   - Stub: Luma GET client.
   - Assert: event stored.

8. Event updated webhook refreshes event through mocked Luma reads.
   - Stub: Luma GET client.
   - Assert: event updated.

9. Unknown webhook type is stored and ignored safely.
   - Stub: unknown event.
   - Assert: delivery stored, no crash.

10. Webhook never performs Luma write calls.
    - Stub: mutation tripwire.
    - Assert: no POST/PATCH/DELETE external calls.

11. Webhook maps payload calendar/event to stored calendar safely.
    - Stub: payload for unknown calendar.
    - Assert: ignored or clear error without cross-calendar mutation.

12. Webhook stores raw delivery payload.
    - Stub: payload.
    - Assert: raw JSON persisted.

## Export Tests

1. CSV export requires event access.
   - Stub: unauthorized user.
   - Assert: 403.

2. CSV export includes guest identity fields.
   - Stub: guest row.
   - Assert: name/email/status columns.

3. CSV export includes score and reason.
   - Stub: score data.
   - Assert: columns.

4. CSV export includes registration answers.
   - Stub: answers.
   - Assert: answer text included.

5. CSV export escapes commas, quotes, and newlines.
   - Stub: tricky answer/note.
   - Assert: valid CSV escaping.

6. CSV export includes profile and GitHub fields.
   - Stub: profile rows.
   - Assert: columns.

7. CSV export uses correct filename.
   - Stub: event name/date.
   - Assert: `Content-Disposition`.

8. CSV export does not call external APIs.
   - Stub: network tripwire.
   - Assert: no calls.

## API Route Tests

1. `/api/luma/sync` requires auth.
   - Stub: no user.
   - Assert: 401/redirect.

2. `/api/luma/sync` requires calendar access.
   - Stub: no membership.
   - Assert: 403.

3. `/api/events/[id]/sync-guests` requires admin.
   - Stub: reviewer.
   - Assert: 403.

4. `/api/events/[id]/sync-guests` calls mocked Luma read import.
   - Stub: import function.
   - Assert: imported count returned.

5. `/api/guests/[id]/decision` validates status.
   - Stub: invalid form.
   - Assert: 400.

6. `/api/guests/[id]/enrich` validates job types.
   - Stub: invalid type.
   - Assert: 400.

7. `/api/guests/[id]/score` requires access.
   - Stub: unauthorized.
   - Assert: 403.

8. `/api/enrichment/run` respects per-call job limit.
   - Stub: many jobs.
   - Assert: max jobs run.

9. `/api/batches/preview` does not mutate DB.
   - Stub: candidates.
   - Assert: no status changes.

10. `/api/batches/apply` dry-run does not mutate Luma or final statuses.
    - Stub: candidates.
    - Assert: no Luma calls.

11. All API routes reject cross-calendar IDs.
    - Stub: user calendar A, resource calendar B.
    - Assert: 403.

## UI Interaction Tests

1. Login form shows create admin state for first user.
   - Stub: no users, `ADMIN_EMAILS`.
   - Assert: create admin copy and form.

2. Login form shows sign-in state after admin exists.
   - Stub: seeded user.
   - Assert: sign-in copy and form.

3. Onboarding accepts Luma API key and imports calendars through mocks.
   - Stub: Luma calendar/event clients.
   - Assert: redirect to events.

4. Onboarding shows imported calendars.
   - Stub: server data.
   - Assert: calendar list.

5. Events page filter submits query params.
   - Stub: browser local route.
   - Assert: URL params.

6. Guest review decision buttons post to local route only.
   - Stub: route action.
   - Assert: local request made; no external request.

7. Guest note form saves and displays note.
   - Stub: route action.
   - Assert: note appears.

8. Batch dry-run form submits without external mutation.
   - Stub: route action.
   - Assert: dry-run response.

9. Apply-to-Luma button is disabled when writes disabled.
   - Stub: `lumaWritesEnabled=false`.
   - Assert: disabled.

10. Apply-to-Luma button is enabled when writes enabled.
    - Stub: `lumaWritesEnabled=true`.
    - Assert: enabled but still mocked.

11. Enrichment buttons queue jobs without running external calls.
    - Stub: queue action.
    - Assert: job rows created only.

12. Run jobs button uses mocked enrichment workers.
    - Stub: job runner.
    - Assert: results displayed.

13. Tooltips open for history pills.
    - Stub: browser hover.
    - Assert: tooltip content.

14. GitHub heatmap renders with fixture weeks.
    - Stub: weeks data.
    - Assert: cells render.

15. Event table remains usable with 600 guests.
    - Stub: 600 rows.
    - Assert: page loads within budget.

16. Event table remains usable with many answer columns.
    - Stub: 10+ answer columns.
    - Assert: horizontal scroll and actions remain reachable.

## Accessibility Tests

1. Login page has labels for email/password fields.
   - Stub: UI render.
   - Assert: accessible names.

2. Onboarding Luma key field has label.
   - Stub: UI render.
   - Assert: accessible name.

3. Event cover image has useful alt text.
   - Stub: event name.
   - Assert: alt equals event name.

4. Decorative company favicon images have empty alt.
   - Stub: profile with favicon.
   - Assert: `alt=""`.

5. Buttons have accessible names.
   - Stub: UI render.
   - Assert: sync/export/enrich/approve/reject names.

6. Tooltip triggers are keyboard focusable.
   - Stub: history pills.
   - Assert: tab focus and tooltip opens.

7. Badge-only states have text.
   - Stub: statuses.
   - Assert: visible text exists.

8. Table headers map to data columns.
   - Stub: answer columns.
   - Assert: headers present.

9. Color is not the only indicator for destructive actions.
   - Stub: reject button.
   - Assert: text says reject.

10. Empty states are announced as text.
    - Stub: no guests.
    - Assert: visible empty state.

## Security Tests

1. Luma API keys are encrypted at rest.
   - Stub: key.
   - Assert: DB value is not raw key.

2. Encrypted Luma API key decrypts only with correct app key.
   - Stub: encryption key.
   - Assert: wrong key fails.

3. Luma API key is never returned to client.
   - Stub: page load.
   - Assert: serialized data excludes raw/decrypted key.

4. Supabase tokens are never returned unnecessarily.
   - Stub: session.
   - Assert: page data excludes provider tokens.

5. Invite tokens are hashed in DB.
   - Stub: generated token.
   - Assert: raw token not stored.

6. Open redirect is blocked on login/logout/next params.
   - Stub: `next=https://evil.example`.
   - Assert: redirect falls back to safe path.

7. Cross-site form submissions are protected as intended.
   - Stub: missing/invalid origin or CSRF token if implemented.
   - Assert: rejected.

8. Webhook signature comparison is timing-safe.
   - Stub: signatures.
   - Assert: helper uses safe comparison path.

9. Raw JSON display escapes HTML.
   - Stub: raw JSON with script tag.
   - Assert: rendered as text, not executed.

10. Registration answers escape HTML.
    - Stub: answer with script tag.
    - Assert: rendered as text, not executed.

11. Notes escape HTML.
    - Stub: note with HTML.
    - Assert: rendered as text, not executed.

12. CSV export handles formula injection.
    - Stub: answer starts with `=`, `+`, `-`, or `@`.
    - Assert: escaped/prefixed according to policy.

13. Role escalation through invite form is blocked.
    - Stub: reviewer tries owner/admin escalation.
    - Assert: 403 or validation failure.

14. User cannot accept invite for a different email if policy requires email match.
    - Stub: invite email/user email mismatch.
    - Assert: rejected or explicit allowed behavior.

15. Stored raw external payloads are not used for unsafe redirects.
    - Stub: malicious URL in raw JSON.
    - Assert: links sanitized or safe.

## Error Handling Tests

1. Database unavailable returns controlled error.
   - Stub: SQL throws.
   - Assert: no secret leakage.

2. Luma import malformed JSON returns controlled error.
   - Stub: invalid JSON response.
   - Assert: clear error.

3. Luma import missing expected fields skips bad item.
   - Stub: mixed valid/invalid items.
   - Assert: valid items import.

4. GitHub malformed response fails job safely.
   - Stub: malformed GraphQL.
   - Assert: job failed with safe error.

5. BrightData malformed response fails job safely.
   - Stub: malformed response.
   - Assert: job failed with safe error.

6. Supabase callback error redirects to login.
   - Stub: Supabase error.
   - Assert: no local session.

7. Resend error does not invalidate invite row.
   - Stub: send failure.
   - Assert: invite row state is consistent.

8. Webhook processing error stores failed delivery status.
   - Stub: import throws.
   - Assert: delivery has error.

9. Worker continues after one failed job.
   - Stub: first job throws, second succeeds.
   - Assert: second processed.

10. UI displays failed job errors safely.
    - Stub: failed job with HTML/script error.
    - Assert: escaped text.

## Performance And Scale Tests

1. Event detail query handles 600 guests.
   - Stub: seeded test DB.
   - Assert: query completes within agreed budget.

2. Event detail query handles 600 guests with answer columns.
   - Stub: 600 guests, 8 questions.
   - Assert: load completes within budget.

3. Event detail query handles prior history.
   - Stub: 600 guests and prior events.
   - Assert: load completes within budget.

4. Event import handles paginated 600+ guest list.
   - Stub: pages.
   - Assert: all imported.

5. Enqueue jobs for 600 guests is idempotent and fast.
   - Stub: guests.
   - Assert: jobs count and time.

6. CSV export handles 600+ guests.
   - Stub: data.
   - Assert: valid CSV generated within budget.

7. UI render with 600 rows does not crash.
   - Stub: Playwright page.
   - Assert: page interactive.

8. UI render with many answer columns keeps horizontal scroll.
   - Stub: 12 columns.
   - Assert: no overlapping action controls.

## Regression Tests From This Build

1. Legacy username/password login still works after Supabase env support.
   - Stub: Supabase present/missing variants.
   - Assert: password login path remains available when requested.

2. Svelte env imports are correct.
   - Stub: build/check.
   - Assert: no server-only env imported into client modules.

3. Admin bootstrap respects `ADMIN_EMAILS`.
   - Stub: admin email and non-admin email.
   - Assert: only allowed email creates first admin.

4. Luma cover image is displayed on event detail.
   - Stub: event cover URL.
   - Assert: hero image visible.

5. Past events are visually muted.
   - Stub: past event.
   - Assert: muted/greyscale styling.

6. Countdown text is clear for future events.
   - Stub: fixed clock.
   - Assert: days/hours display.

7. Prior event history pills render.
   - Stub: event history rows.
   - Assert: `went` and `going` pills visible.

8. Dynamic answer columns render instead of collapsed details.
   - Stub: three questions.
   - Assert: three headers and row answers.

9. Notes remain available after answer column refactor.
   - Stub: guest notes.
   - Assert: note visible and save works.

10. Luma batch writes remain guarded after UI changes.
    - Stub: mutation tripwire.
    - Assert: no external mutation without explicit mocked write path.

## Manual Smoke Tests With Stubs Only

1. Start app with local test DB and fixture seed.
2. Create local admin with fixture email.
3. Complete onboarding with fake Luma API key and mocked Luma responses.
4. View events page with fixture upcoming/live/past events.
5. Open event detail with 600 fixture guests.
6. Confirm cover image, countdown, metadata, answer columns, history pills, GitHub heatmaps, and actions render.
7. Queue GitHub jobs with mocked GitHub.
8. Queue BrightData jobs with mocked BrightData.
9. Run jobs and confirm statuses update.
10. Dry-run approve and reject batches.
11. Attempt real apply with writes disabled and confirm it is blocked.
12. Enable writes in test env and confirm only mocked Luma update client records calls.
13. Send invites with email disabled and confirm no Resend call.
14. Enable email in test env and confirm only mocked Resend records calls.
15. Send webhook fixture and confirm mocked Luma read refresh happens.

## Test Implementation Backlog

1. Add test framework and scripts.
2. Add global network and mutation tripwire helpers.
3. Add external API fixture files.
4. Add module mocks for Luma, GitHub, BrightData, Supabase, Resend, and email.
5. Add local test database setup and teardown.
6. Add unit tests for normalization, scoring, permissions, auth, crypto, CSV, and event display helpers.
7. Add route/action tests for protected API endpoints.
8. Add integration tests for import, jobs, webhook, and batch apply with mocked clients.
9. Add Playwright tests for login, onboarding, event list, event detail, answer columns, and history pills.
10. Add CI command that runs check, unit tests, integration tests, and UI smoke tests against only stubs.
