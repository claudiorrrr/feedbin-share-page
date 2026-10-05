# feedbin-share-page

Reads your Feedbin Pages, shows them in a clean reader, and shares each one
through a link that expires and can be revoked.

- `/` admin list. Share a page for 1, 7 or 30 days, copy or revoke its
  links, see how many times each was opened. "Add a URL" saves a page that
  is not in Feedbin.
- `/a/:id` admin preview. Select text, then "Highlight" or "Comment". Click
  a highlight to remove it, a commented phrase to read or delete the note.
- `/s/:token` public reader (Open Graph tags). Highlights and comments are
  read-only: hover or tap a commented phrase to see its note.
- `/import` target of the bookmarklet (below).

## Pages that block downloads

Some sites (NYTimes, for one) refuse server-side fetches, so neither Feedbin
nor "Add a URL" can read them. On the admin list, drag the "Save to pagina"
link to your bookmarks bar. Click it on the page you want, review the title
in the window that opens, and press Save. Your browser sends the page as it
rendered it, so logged-in and unlocked articles work. Saved pages live only
here (`data/manual.json`), not in Feedbin.

## Run

Needs [Bun](https://bun.sh).

    bun install
    cp .env.example .env    # fill it in
    bun run start

| Variable | Required | Meaning |
|---|---|---|
| `FEEDBIN_EMAIL`, `FEEDBIN_PASSWORD` | yes | Feedbin account |
| `SHARE_URL` | yes | Public origin used in copied links, e.g. `https://share.example.com` |
| `ADMIN_PASSWORD` | no | Basic-auth password (any username) for admin pages |
| `HOST` | no | Default `127.0.0.1`. `0.0.0.0` listens on the network |
| `PORT` | no | Default `3000` |
| `FEEDBIN_PAGES_FEED_ID` | no | Only if the Pages feed is not auto-detected |
| `LINKS_FILE`, `HIGHLIGHTS_FILE`, `COMMENTS_FILE`, `MANUAL_FILE` | no | Data file paths. Defaults: `data/links.json`, `data/highlights.json`, `data/comments.json`, `data/manual.json` |

## Expose it

Admin pages (everything except `/s/*` and `/robots.txt`) must be protected,
either by `ADMIN_PASSWORD` or by a reverse proxy with its own auth.
Basic auth sends the password in clear text: serve it over HTTPS.

Point your domain at the server, terminate TLS in a reverse proxy (Caddy
example), and set `SHARE_URL` to that domain:

    example.com {
    	reverse_proxy 127.0.0.1:3000
    }

To keep admin private while links stay public, split by hostname and
forward only `/s/*` and `/robots.txt` on the public one.

## Notes

- Revoke a link from the admin list. Revoke all: delete `data/links.json`.
- Highlights and comments belong to the article, not to a link: every link
  to that article shows them. They are stored as text quotes and found again
  by searching the text.
- A click is one successful load of `/s/:token`. Chat apps that fetch the
  link to draw a preview count too.
- "Add a URL" and the bookmarklet store a copy of the article, so a shared
  link keeps working if the original disappears. Remove one from the list.
- Back up `data/`. Restart after editing its files by hand.
- Lists are cached 60 s. Max 100 latest pages.
