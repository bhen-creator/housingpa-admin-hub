# Board Meeting Minutes

Records the minutes of a community association board meeting **as the meeting
happens**. The screen is split: the meeting controls are on the right, and the
minutes document is on the left. Every action taken on the right — the call to
order, a motion and its vote, a report, a homeowner comment — writes a line into
the document on the left. By the time the board adjourns the minutes are already
written, and can be reviewed, exported as a PDF, shared by link, and emailed to
the board without leaving the page.

---

## Running it

Requires **Node 24 or newer** (Node 22.5+ works with `npm run start:node22`).
There are no runtime dependencies — the server uses only Node built-ins.

```bash
cp .env.example .env        # set ACCESS_CODE at minimum
npm install                 # installs esbuild + typescript for the build only
npm run build
npm start                   # http://localhost:8080
```

Or with Docker:

```bash
cp .env.example .env
docker compose up -d --build
```

On first boot the server creates an administrator access code from
`ACCESS_CODE`. If you did not set one, it generates a code and prints it to the
log once — copy it before the log scrolls away.

### Development

```bash
npm run dev        # rebuild on change and restart the server
npm run typecheck  # tsc --noEmit
```

---

## How a meeting runs

1. **Settings → Communities.** Add the association once: name, address, board
   roster with emails, and the quorum its bylaws require (majority, two-thirds,
   or a fixed number). Untick *votes* for management staff so they are excluded
   from quorum and vote arithmetic.
2. **Start a meeting.** Choose regular, special, annual, organizational or
   executive session, set the date and location.
3. **Take the roll.** Mark each director present, remote or absent. The quorum
   bar turns green when the board can transact business. Attach the published
   agenda PDF if you have one.
4. **Call to order.** One click stamps the exact minute, names the presiding
   officer, records the quorum, and writes line 1.
5. **Work the agenda.** Selecting an agenda item tells the app which section new
   entries belong to, so the document organises itself into the standard
   sections rather than one long list.
   - **Motion & vote** — type the motion, click the mover then the seconder,
     pick how the vote was taken (unanimous, voice, roll call, unanimous
     consent), and the outcome is computed from the tally. Roll-call votes
     record each director's ballot by name.
   - **Report / homeowner comment / action item** — short forms that file
     themselves in the right section.
   - **Executive session** — records entering and returning to open session.
   - **Notes as they happen** — type shorthand and it becomes a minute
     paragraph, with follow-ups lifted out as action items.
6. **Adjourn.** The adjournment time is stamped and the review panel opens:
   write a summary, download the PDF, create a read-only link, and send it to
   the board.
7. **Finalize** once the board approves the minutes. Finalized minutes are
   locked; an administrator can reopen them if a correction is needed.

Any line in the document can be edited, reordered or deleted while the minutes
are still open — hover over it in the left pane.

---

## What is stored where

Everything lives in one SQLite file under `DATA_DIR` (`/data` in Docker), along
with any uploaded agenda PDFs. **Back that directory up.** Nothing is stored in
a third-party service.

The browser also keeps a copy of the meeting in progress. If the connection
drops mid-meeting the app keeps recording, shows an *offline* indicator, and
sends everything to the server as soon as it is reachable again.

---

## Access

Everyone signs in with an access code. There are two roles:

| | Manager | Administrator |
|---|---|---|
| Record minutes, edit, export, share, email | ✅ | ✅ |
| Add and edit communities and rosters | ✅ | ✅ |
| Delete a community, delete a meeting, reopen finalized minutes | — | ✅ |
| Create and revoke access codes | — | ✅ |

Give each person their own code so one can be revoked without disturbing the
rest. Codes are stored hashed (scrypt) and cannot be read back — if someone
forgets theirs, issue a new one. Sign-in attempts are throttled after eight
failures from one address.

---

## Optional integrations

Both are off by default and the app is fully usable without either.

**AI write-up** (`GEMINI_API_KEY`) turns shorthand into minute prose and drafts
the meeting summary. Without a key the built-in formatter does the same job more
plainly — it tidies, classifies and extracts action items, but does not rewrite.
The AI is instructed never to invent a figure, date, vendor or name that was not
in the note; it is a writing aid, not a source of facts. Review before sending.

**Email** (`MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`) sends the minutes with
the PDF attached, through Resend, Postmark, SendGrid or Mailgun — plain HTTPS,
no SMTP ports to open. Without it, the Send step opens a pre-filled draft in the
manager's own mail client instead.

---

## Sharing minutes

A share link is a long random token that renders the minutes read-only and
offers the PDF. Board member email addresses are stripped from anything served
over that link. Links can be revoked at any time. Set `SHARING_ENABLED=false` to
remove the feature.

---

## Putting it on your website

The app serves its own front end, so a reverse proxy is all that is needed:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Serve it over HTTPS — session cookies are marked `Secure` on an HTTPS origin.
Set `APP_URL` to the public address so share links and emails point to the right
place. Keep `BEHIND_PROXY=true` so the sign-in throttle sees real client
addresses.

To match your site's colours, edit the `:root` block at the top of
`client/app.css` and rebuild; `BRAND_NAME`, `BRAND_SHORT` and `BRAND_TAGLINE`
change the wording without a rebuild.

---

## Layout

```
shared/     types, domain logic, the built-in note formatter — used by both sides
server/     HTTP server, SQLite storage, auth, AI and email adapters, PDF writer
client/     React front end (no framework beyond React; plain CSS)
build.mjs   esbuild bundling for both halves
```

The PDF is generated server-side by a small self-contained writer
(`server/pdf/`), so the same document can be downloaded, attached to an email,
or served from a share link without a browser being involved.

---

## A note on what minutes should contain

Minutes are a legal record of what the board *did*, not a transcript of what was
said. The app nudges toward that: motions record who moved, who seconded and how
the vote fell; discussion is summarised rather than quoted; and matters
discussed in executive session are recorded as having occurred without their
substance. Draft minutes are watermarked until the board approves them.

This software does not give legal advice. Pennsylvania associations should
follow their own governing documents and counsel on what must be recorded,
what may be discussed in executive session, and what owners are entitled to see.
