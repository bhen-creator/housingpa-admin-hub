# What changed from the AI Studio version

The original prototype had the right idea — split screen, live document, one-click
share — but it stored everything in `localStorage`, shipped with three invented
HOAs, and produced a document that read like a screen dump. Here is what is
different.

## Made it real

| Before | Now |
|---|---|
| Minutes lived in one browser's `localStorage` | SQLite on the server; survives cache clears, works across devices |
| No sign-in — anyone with the URL could edit | Hashed access codes, sessions, per-person codes, throttled sign-in |
| No sharing beyond a `mailto:` that cannot attach a PDF | Read-only share links, server-generated PDF, and email with the PDF attached |
| Three fictional associations baked into the code | Empty on first run; you add your communities in Settings |
| Broke silently if the connection dropped | Keeps recording offline, shows it, syncs when the connection returns, and offers to recover a newer local copy |

## Made the minutes read like minutes

- The document is organised into the standard sections — call to order and
  quorum, prior minutes, reports, unfinished business, new business, open forum,
  executive session, adjournment — instead of one flat list. Selecting an agenda
  item decides where an entry files itself.
- Motions read in parliamentary form: *"Upon motion duly made by X and seconded
  by Y, it was moved to …"*, followed by how the vote fell. Roll-call votes
  record each director's ballot by name.
- Quorum is computed from the association's actual rule (majority, two-thirds,
  or a fixed number) against voting seats only, and the app warns before binding
  action is recorded without it.
- Non-voting attendees (management staff) are excluded from quorum and vote
  arithmetic.
- Late arrivals and early departures are timestamped into the record.
- Executive session in and out is recorded without its substance.
- Action items are collected into a register at the end.
- Any line can be edited, reordered or deleted, with undo.

## Made the output usable

- The PDF is generated on the server by a purpose-built writer: letter size,
  proper typography, page breaks that do not orphan headings, page numbers, a
  DRAFT watermark until the board approves, and signature blocks. The old one
  was a jsPDF sketch that ran only in the browser.
- Printing from the browser produces the same document — the controls disappear.
- Draft minutes are visibly marked as drafts everywhere: on screen, in the PDF,
  on the share page, and in the email.

## Made it safe to put on the internet

- Security headers including a content security policy; no server fingerprint.
- Every field is validated server-side before it reaches the database.
- Board email addresses are stripped from anything served over a public link.
- Finalized minutes are locked; only an administrator can reopen them.
- A community with recorded minutes is archived rather than deleted.
- Audit trail of sign-ins and record changes.

## Made it cheap and simple to run

- **No runtime dependencies.** The server uses only Node built-ins — no Express,
  no better-sqlite3, no nodemailer, no jsPDF. `npm install` pulls esbuild and
  TypeScript for the build only.
- The AI is optional. Without a key the app still writes up notes and summaries
  using a built-in formatter, so nothing is gated behind an API bill.
- Email goes over provider HTTPS APIs (Resend, Postmark, SendGrid, Mailgun) —
  free tiers work, and there are no SMTP ports to open.
- One Docker container and one volume.

## Verified

The build was exercised end to end in a real browser: sign in, add a community,
attach an agenda PDF, take the roll, call to order, record reports, notes,
a roll-call motion, a homeowner comment, an action item, executive session,
adjourn, summarise, share, and finalize — plus the public share page signed out,
the mobile layout, the print view, and an offline-then-reconnect run. 27 API and
security checks pass, including path traversal, authentication, validation, and
sign-in throttling.
