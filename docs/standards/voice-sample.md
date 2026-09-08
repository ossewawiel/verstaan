<!-- Copied from the house-style skill (~/.claude-private/skills/house-style/) on 2026-09-08 so the voice travels with the repo. Update both when one changes. -->

# Voice sample — approved, do not drift

The developer read the 2026-09-07 report and said: "this is perfect." The two cards below are
taken from it verbatim. They are the calibration target for every future run. Before writing
any prose in either artifact, read them once. Match their rhythm, their density, and the
amount they explain. Do not go terser (the first draft was, and it was "a bit too concise").
Do not go more ornate (that is slop). If a new card would not sit comfortably next to these
two, rewrite it until it does.

The rules that produce this voice are in `report-design.md § Voice`. This file exists because
a rule can be read many ways and a sample can be read only one.

---

## Sample A — a Critical finding

**01 · A crash or lost write after the gateway's 202 sends the invoice again** · Critical · Confidence ●●●
Axis: Idempotency · Resilience

**What we saw**
This is the last leg of the flow: the XML is built, the POST goes out, and the verdict comes
back to be written on the row. The POST returns at `InvoiceXmlGenerationService.kt:647`. The
status write runs some milliseconds later, at `SubmissionResultHandler.kt:98`. Between those
two lines the row still says `cf_sent=false`, and nothing records that a request is in flight.
The write itself runs inside a try block that logs the failure and returns normally
(`InvoicePersistenceService.kt:172-174`). The caller gets no return value, so it reports
success and tells Optimus the invoice is registered. The request carries only `Content-Type`
and Basic auth (`WebConnector.kt:152-161`). There is no idempotency key, the token a gateway
uses to recognise a repeated request. The selection query claims nothing before it reads
(`InvoicePersistenceService.kt:91-112`).

**Why it matters**
Picture the base profile, where the socket timeout is 5 seconds (`application.properties:26`).
mStart accepts the invoice and starts fiscalising it. The reply takes 6 seconds. The client
gives up at 5, throws `ResourceAccessException`, and the handler files the result as transient.
The row stays selectable. Sixty seconds later the poller builds the same XML and sends it
again, and mStart fiscalises a second copy. A service restart in the same window produces the
same outcome without any timeout at all. Two fiscalised copies of one invoice is a compliance
incident. Nothing in the system records that the first request was ever made, so nothing can
notice.

**Options**
★ Recommended — **Intent state + reconcile** · M
Write `cf_sending_at` and an attempt id before the POST. On restart, or on any ambiguous
reply, park the row as *unknown* and reconcile with mStart before any re-send. Afterwards a
stuck row shows a timestamp in `cf_sending_at` and one ERRO audit line, instead of a second
fiscalisation.
Trade-off: needs one new column and an mStart status lookup, or a manual queue when none exists.

**Fail loudly, park** · S
Make `markInvoiceAsSent` return a boolean like `markInvoiceAsFailed` does. On a lost write, set
`cf_failed` with a distinct code instead of retrying.
Trade-off: closes the lost-write case only. A JVM crash between the two calls is still a duplicate.

**Outbox table + relay** · L
A separate outbox row written in the same transaction as the intent, and a relay that owns
the POST.
Trade-off: a second table and a second loop for a pipeline that already uses `cf_inv` as its queue.

**Why this one:** the row is already the queue, so a pre-send state on it gives the outbox
guarantee at a fraction of the cost.

**Anchor.** Idempotency key with a recovery point — brandur.org, Stripe — applies because the
ambiguous-reply case is exactly a timeout after acceptance.

---

## Sample B — a Medium finding

**05 · The backoff is a five-minute cooldown, not a circuit breaker** · Medium · Confidence ●●●
Axis: Resilience · Configurability

**What we saw**
The connector does have a protective pause, and it is worth being exact about what it
protects. `BackoffTracker` holds one timestamp: the moment of the last connection failure
(`BackoffTracker.kt:40-72`). While that timestamp is younger than five minutes, the poller
skips the whole batch. The five minutes is a constant, `BACKOFF_MINUTES = 5`
(`WebConnector.kt:52`), while the e-invoice side reads the same idea from a property
(`application.properties:28`). The tracker arms on `ResourceAccessException` only
(`WebConnector.kt:124`), which means a refused connection or a timeout. An HTTP 503 from the
gateway does not arm it. A circuit breaker, in the usual sense, counts consecutive failures
and lengthens the pause; this one counts nothing and always pauses the same five minutes.

**Why it matters**
Two evenings. On the first, the gateway's front end returns 503 for an hour. The pause never
arms, so every cycle POSTs every pending invoice into the outage, sixty times over. On the
second, the network drops instead. Now every database pauses exactly five minutes, wakes,
fails once, and pauses five minutes again, and no operator can lengthen that pause without a
rebuild.

**Options**
★ Recommended — **Arm on 5xx, make it a property** · S
Arm the cooldown on 5xx and timeouts. Read the duration from `eracun.web.backoff-minutes`.
Double it on consecutive failures up to a cap. Afterwards an hour of 503s costs one POST per
pause instead of sixty per invoice, and the log shows the pause growing.
Trade-off: still a hand-rolled breaker.

**Resilience4j CircuitBreaker** · M
Replace `BackoffTracker` with a library breaker. Metrics come free.
Trade-off: a new dependency for one call site.

**Anchor.** Circuit breaker so a dead gateway does not burn every row's budget — AWS REL05-BP03
— applies once finding 2 introduces a budget.

---

## Sample C — the verdict line and a plan opening

Findings verdict:
> When mStart says no, the pipeline stops cleanly and tells Optimus why. When mStart says
> nothing, or says yes too late, the pipeline has no memory of having asked. That gap is where
> a live fiscalisation system sends the same invoice twice.

Plan verdict:
> After this plan the row remembers that it asked. An invoice is submitted at most once, and a
> doubtful one is parked, not re-sent. A failing gateway costs a bounded number of attempts,
> and the pause grows while it fails. An operator sees the backlog, its age, and each
> database's pulse from one health endpoint, without a SQL client.

## What makes these work

- The first sentence of "What we saw" places the reader in the flow before any line number.
- Every mechanism is spelled out as cause → effect → what the caller sees.
- The scene in "Why it matters" has a time, an actor, and a consequence, and nothing else.
- Verbs carry the judgement: "files the result as transient", "burns", "parks". No adjectives do.
- The recommended option says what the developer will see afterwards.
- Nothing is hedged, nothing is praised inside the card, nothing is filler.
