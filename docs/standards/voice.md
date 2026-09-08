<!-- Copied from the house-style skill (~/.claude-private/skills/house-style/) on 2026-09-08 so the voice travels with the repo. Update both when one changes. -->

# Voice

The voice is Simplified Technical English (ASD-STE100, the aerospace maintenance-manual
standard) with two allowances: room to explain the mechanism, and room to paint the moment
where it fails or succeeds. Think of a good incident write-up read aloud by a calm engineer.
Short sentences, real nouns, no decoration — but the reader finishes each card knowing *how*
something happens, not only *that* it does.

The developer approved this voice on 2026-09-07 with the words "this is perfect" and asked
that it stay. `voice-sample.md` holds the approved text. Read it before writing; match it.
The first draft of the first report was terser than the sample and was sent back as "a bit too
concise". Do not drift terser. Do not drift ornate.

## Sentence shape (from STE, keep strictly)

- Procedural sentences: 20 words or fewer. Descriptive sentences: 25 or fewer. Split at the join.
- Active voice, present tense, named actor. "The poller re-selects the row", not "the row may
  be re-selected".
- One instruction or one fact per sentence. Keep the articles. Noun clusters of three words
  or fewer: "the lookup for tax codes", not "tax code lookup table logic".
- One term, one meaning, for the whole document. The project glossary wins over your synonym.
- Numbers, counts, and durations go in tiles, tables, or the mono face — not in running prose.

## Explanation (the first allowance)

- Every evidence block opens with one sentence of orientation: where in the flow this sits and
  what the code, or the option, is trying to do there. Then the evidence, with lines or URLs.
- State the mechanism, not the label. Not "the write swallows its exception" but "the write
  catches the exception, logs it, and returns normally, so the caller cannot tell it failed".
- Define a pattern or product name in the same sentence you first use it: "an idempotency key,
  a token the gateway uses to recognise a repeated request".
- Each option ends with what the reader would notice after choosing it: a log line, a column,
  a bill, a test, a team habit.

## Colour (the second allowance)

- Colour is a concrete scene, never an adjective. "A service restart lands at 02:10, between
  the POST and the status write" beats "a critical race condition".
- One image per card at most, and only where it makes the mechanism easier to hold in mind.
- Verbs carry the weight: "parks", "burns", "hammers", "drifts". Adjectives of judgement do
  not appear: no "robust", "elegant", "clean", "powerful", "modern", "critical" as intensifier.

## Slop, never

- Filler: "it is worth noting", "in order to", "leverage", "ensure", "seamless", "crucial",
  "delve", "holistic", "great question". Rhetorical questions. Emoji. Exclamation marks.
- Hedging stacks. Confidence is stated once, as a chip or one word.
- The praise sandwich inside a finding or an option. Strengths have their own section.
- A title that is a topic. A finding title is a **claim** a developer can dispute in one
  reading: "Retries have no upper bound". An option title is a **name**, three words or fewer.
- Recaps of what the page just said. Closing offers.

## Order inside a card

Finding: what we saw → why it matters → options → why this one → anchor.
Option: what it is → pros → cons → fit here → afterwards you would notice.
Question (interrogation): the question → why it matters → which options it eliminates.
Never the reverse.

## A short example

Too terse: *"markInvoiceAsSent swallows its exception."*

Slop: *"Crucially, the persistence layer's error handling is insufficiently robust, potentially
leading to duplicate submissions."*

Right: *"After a gateway 202, `markInvoiceAsSent` runs the UPDATE inside a try block that logs
the failure and returns normally. The caller sees no return value, so it reports success and
tells Optimus the invoice is registered. The row still says `cf_sent=false`, and the next cycle
sends it again."*
