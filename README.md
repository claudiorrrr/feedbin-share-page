# feedbin-share-page

Reads your Feedbin Pages, shows them in a clean reader, and shares each one
through a link that expires and can be revoked.

- `/` admin list
- `/a/:id` admin preview. Select text and press "Highlight"; click a
  highlight to remove it.
- `/s/:token` public reader (Open Graph tags, read-only highlights).

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
- Highlights belong to the article, not to a link.
- Back up `data/`. Restart after editing its files by hand.
- Lists are cached 60 s. Max 100 latest pages.
