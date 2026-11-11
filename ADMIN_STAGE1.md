# CyberDuel Lite — administration, stage 1

## Changes

- Administration uses the existing verified numeric Telegram owner allowlist.
- Overview counts all PostgreSQL rows, rather than a 100-row sample. Real matches are counted separately from compatibility search placeholders; referrals count referred players, not the sum of overlapping L1/L2 counters.
- Players: name/ID search, bounded pagination, profile/balance inspection, links to that player's matches and transactions, and private administrator notes.
- Transactions: separate vVIRAL receipts, TON ledger transactions, deposit intents and withdrawal requests. Filters cover player, currency, collection, status and UTC date range. Nanoton amounts remain strings, including values larger than JavaScript's safe integer range. There are no adjustment, deposit, approval or withdrawal controls.
- Match inspection masks unfinished moves even for administrators. No settlement or matchmaking rules are changed.
- Settings: validated display name; existing bot and HTTPS deployment URL are preserved. Economic parameters and financial pauses are displayed read-only. The application header uses the configured display name.
- Notes and settings updates commit atomically with actor ID, timestamp, target and before/after audit values. Version checks reject concurrent stale edits with HTTP 409. The journal has no edit/delete API.
- Existing community tools remain in a collapsed section. Legacy administrative writes record an audit intent before side effects and a separate completion/failure event afterward. An interruption can leave an intent without completion; those entries must be investigated rather than assumed successful. Tests do not send Telegram announcements or pins.
- Administrative queue cleanup skips TON entries while financial operations are disabled.
- The panel loads on demand; loading, empty, error and retry states are explicit.

## Validation commands

Local: `npm run lint`, `npm test`, `npm run build`.

Server staging: build the application image while the running production container remains unchanged. Create the separate `cyberduel_admin_validation` database, then mount and run `scripts/validate-admin.cjs` in a one-off container. The script overrides the bot token with a synthetic token and disables the Telegram worker. It never authenticates as the production owner or modifies production records.

The admin suite checks 137-player totals, pagination/search, rejected injection filters, owner/non-owner/anonymous access, exact TON amounts, hidden moves, atomic notes/audit, edit conflicts, settings preservation, public-settings cache invalidation, restart persistence and paused TON. It also compares player, game and financial rows before/after administrative changes.

Run the existing `scripts/validate-game.cjs` regression suite against `cyberduel_validation` and the PostgreSQL integration suite before production cutover. Take a private database backup first.

## Scope

Balances, player bans, economic rules, TON wallet provisioning and real financial operations are outside this stage. A ban mechanism would alter gameplay authorization and needs a separate change. Historical admin actions cannot be reconstructed retroactively; the audit journal starts recording with this release.

Inside Telegram: Profile → «Открыть управление игрой». The cloud browser has no owner's Telegram Mini App session; final owner-device appearance must be checked inside Telegram.

## Deployment results

Pending server validation and cutover.
