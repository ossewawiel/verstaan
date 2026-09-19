# Issue 19 — tokeniser design and test cases

This note is the design the implementer codes from, and the source of truth for the test table:
issue 19's own acceptance criteria put the fifteen-plus-fifteen fixture inside a GoogleTest fixture
directly, so the token lists below are that fixture's source of truth, transcribed here by hand
from `data/languages/eng/corpus/ugoa1.yaml` and `data/languages/afr/corpus/ugoa1.yaml` (verified
against those files, not guessed).

## Token shape

A token is `{surface, offset, pos_guess}`. `surface` is a `std::string_view` slice of the caller's
input text — zero-copy, case preserved, no normalisation. `offset` is a **byte** offset (not a
codepoint offset) from the start of the input `std::string_view` passed to the tokeniser, to the
first byte of the token's surface form. Byte offset over codepoint offset for three reasons: it
needs no allocation to compute (a running byte counter as the scanner advances), it plugs directly
into `string_view::substr(offset, length)` if a caller ever needs to re-slice, and issue 20's
dictionary lookup matches surface strings, not codepoint positions, so it never needs a codepoint
index built from this one. `pos_guess` is an optional POS value; see the last section — this issue
always emits `none` there.

## Split algorithm

The scanner reads the input one byte at a time and classifies each byte into one of three sets:
whitespace (`0x20`, `0x09`, `0x0A`, `0x0D`), the six split-punctuation marks (`.` `,` `!` `?` `;`
`:`), and the apostrophe (`'`, `0x27`). Every other byte — every ASCII letter and digit, and every
UTF-8 continuation or lead byte of a multi-byte character such as `è` — is a **word-character**
byte by exclusion. This is why a multi-byte character never gets split: none of its bytes can equal
any of the fixed ASCII values the scanner tests against, so the whole sequence just accumulates as
word-character content inside one token, without the scanner needing to know UTF-8 encoding rules
at all.

Rules, applied left to right:

1. **Whitespace.** A run of one or more whitespace bytes closes the token in progress (if any) and
   is itself consumed without producing a token. It is a boundary, nothing more.
2. **Punctuation.** Any of `. , ! ? ; :` closes the token in progress (if any), then that single
   byte is emitted as its own one-character token, regardless of what sits on either side of it —
   directly against a word with no separating space (`car,`), already separated by whitespace, or
   sentence-final. There is no abbreviation exception at this issue's scope: a period gets the same
   treatment whether it ends the sentence or sits mid-word.
3. **Apostrophe.** Classify the byte immediately before the apostrophe (`L`) and the byte
   immediately after it (`R`) as either `word` (a word-character byte) or `boundary` (start/end of
   text, whitespace, or one of the six punctuation marks).
   - `L=word, R=word` — apostrophe is content: append it to the token in progress and keep scanning
     word-character bytes into that same token (`don't`, `foto's`).
   - `L=word, R=boundary` — apostrophe is a trailing, boundary-facing mark: close the current token
     *without* the apostrophe, then emit the apostrophe as its own one-character token (`James'`
     followed by whitespace or end of text → tokens `James` and `'`).
   - `L=boundary, R=word` — apostrophe is leading and attaches to what follows: open a new token
     whose first byte is the apostrophe, then keep appending word-character bytes into it (`'n`).
     This is the general rule that produces `'n` as one token: it never special-cases the letter
     `n`, only the byte pattern boundary-apostrophe-word.
   - `L=boundary, R=boundary` — an isolated apostrophe: emit it as its own one-character token.
     Does not occur in the fixed set; stated so the rule is total, not partial.
4. **Word character.** Any other byte extends the token in progress, opening one first if none is
   open.
5. **End of text.** Close whatever token is open, if any, and stop.

## Expected tokens — English (A01–A15, `data/languages/eng/corpus/ugoa1.yaml`)

Plain space-separated sentences (single-word split — whitespace is the only boundary present, no
punctuation or apostrophe rule exercised): corpus lines 1, 10 (single-word), and 2, 31, 35, 209
(space-only multi-word).

| line | input | tokens |
|---|---|---|
| 1 | `book` | `book` |
| 2 | `the book` | `the` · `book` |
| 3 | `a book` | `a` · `book` |
| 10 | `books` | `books` |
| 31 | `the books` | `the` · `books` |
| 35 | `all the books` | `all` · `the` · `books` |
| 91 | `a book in a box` | `a` · `book` · `in` · `a` · `box` |
| 121 | `a beautiful book` | `a` · `beautiful` · `book` |
| 128 | `a book about Geneva` | `a` · `book` · `about` · `Geneva` |
| 143 | `some days before the summer` | `some` · `days` · `before` · `the` · `summer` |
| 209 | `the beautiful car` | `the` · `beautiful` · `car` |
| 210 | `a very beautiful car` | `a` · `very` · `beautiful` · `car` |
| 219 | `John and Mary` | `John` · `and` · `Mary` |
| 230 | `a car, a book and a mug` | `a` · `car` · `,` · `a` · `book` · `and` · `a` · `mug` |
| 248 | `the beautiful book about the city of Paris without pictures and photos on the table` | `the` · `beautiful` · `book` · `about` · `the` · `city` · `of` · `Paris` · `without` · `pictures` · `and` · `photos` · `on` · `the` · `table` |

None of the fifteen English rows has an apostrophe (SPEC's own acceptance criteria flags this,
hence the synthetic fixtures below). Line 230's comma is rule 2 fired directly against `car` with
no separating space: token `car` closes, `,` emits alone, then whitespace before the next `a` is
consumed by rule 1.

## Expected tokens — Afrikaans (matching `source.line` in `data/languages/afr/corpus/ugoa1.yaml`)

Plain (single-word split, same lines as above): 1, 10, 2, 31, 35, 209.

| line | input | tokens |
|---|---|---|
| 1 | `boek` | `boek` |
| 2 | `die boek` | `die` · `boek` |
| 3 | `'n boek` | `'n` · `boek` |
| 10 | `boeke` | `boeke` |
| 31 | `die boeke` | `die` · `boeke` |
| 35 | `al die boeke` | `al` · `die` · `boeke` |
| 91 | `'n boek in 'n doos` | `'n` · `boek` · `in` · `'n` · `doos` |
| 121 | `'n mooi boek` | `'n` · `mooi` · `boek` |
| 128 | `'n boek oor Genève` | `'n` · `boek` · `oor` · `Genève` |
| 143 | `'n paar dae voor die somer` | `'n` · `paar` · `dae` · `voor` · `die` · `somer` |
| 209 | `die mooi kar` | `die` · `mooi` · `kar` |
| 210 | `'n baie mooi kar` | `'n` · `baie` · `mooi` · `kar` |
| 219 | `John en Mary` | `John` · `en` · `Mary` |
| 230 | `'n kar, 'n boek en 'n beker` | `'n` · `kar` · `,` · `'n` · `boek` · `en` · `'n` · `beker` |
| 248 | `die mooi boek op die tafel oor Parys die stad sonder prente en foto's` | `die` · `mooi` · `boek` · `op` · `die` · `tafel` · `oor` · `Parys` · `die` · `stad` · `sonder` · `prente` · `en` · `foto's` |

Worked walk-throughs (per-byte reasoning), the ones that actually exercise apostrophe/punctuation:

- **Line 3, `'n boek`** — byte 0 is `'`. `L` = start-of-text = `boundary`. `R` = `n` = `word`. Rule
  3, `L=boundary, R=word`: open a token on the apostrophe, keep consuming `n` into it → token `'n`.
  Whitespace closes it (rule 1). Then `boek` accumulates as one word-character run → token `boek`.
- **Line 91 / 143 / 121 / 210**, every `'n` — identical byte pattern to line 3, applied once or
  twice per line; no new case, the same `L=boundary, R=word` branch fires each time.
- **Line 128, `'n boek oor Genève`** — `'n` as above. `Genève`: `G`, `e`, `n`, `è` (two continuation
  bytes, both `word` by exclusion since neither equals a whitespace/punctuation/apostrophe byte),
  `v`, `e` all accumulate into one token, `Genève`, with no split inside the accented letter.
- **Line 230 (both languages)** — walked above for English; Afrikaans is byte-identical in shape:
  `'n` (rule 3c) · `kar` · `,` (rule 2, no preceding space) · `'n` · `boek` · `en` · `'n` · `beker`.
- **Line 248, `...en foto's`** — scanning `foto's`: `f o t o` accumulate, then `'`: `L` = `o`
  (`word`), `R` = `s` (`word`). Rule 3a: apostrophe is content, stays in the same token, `s`
  continues it → one token, `foto's`. No split.

## Synthetic English apostrophe fixtures

None of the fifteen fixed English sentences has an apostrophe. Two short synthetic sentences cover
both branches the acceptance criteria name, apostrophe-inside-word and apostrophe-at-boundary:

- **S1**: `I don't have the book.`
  Tokens, in order: `I` · `don't` · `have` · `the` · `book` · `.`
  (`don't`: `L=n` word, `R=t` word → rule 3a, kept whole. Trailing `.` on `book` with no space →
  rule 2, its own token.)
- **S2**: `This is James' book.`
  Tokens, in order: `This` · `is` · `James` · `'` · `book` · `.`
  (`James'`: `L=s` word, `R`=the space before `book` = boundary → rule 3b: `James` closes without
  the apostrophe, then `'` emits alone. This is the "possessive `'s` on a proper noun" boundary
  case the acceptance criteria names, written with the trailing apostrophe a plural proper noun
  possessive actually takes in English, `James'`, not `James's`.)

## `pos_guess`

The tokeniser always sets `pos_guess = none` for every token in this issue. The struct carries the
field now, per the issue's stated token shape, so issue 20's dictionary lookup can populate it
later without changing the shape token consumers already depend on. No guessing logic — of any
kind — belongs in `engine/src/tokeniser.cpp` for issue 19.
