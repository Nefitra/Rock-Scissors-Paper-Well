# CyberDuel TON Connect / native GRAM verification

Assessment date: 2026-11-12. Financial operations stay disabled.

## Current deployment prerequisites

The existing Spaceship deployment has no explicit treasury address, payout wallet address,
payout recovery phrase, or TON Center API key configured. Only presence flags were inspected;
no secret value was printed. The previous `enabled: true` config response was misleading.
No real deposit, withdrawal, wallet approval or blockchain transfer has been performed.

The blockchain is TON; its native coin is now Gram (GRAM), formerly Toncoin (TON).
The ledger retains `TON` and `*Nano` identifiers for compatibility. This is a label change,
not another jetton and not a balance conversion.

## Corrections in this branch

- Truthful financial readiness; no historical default treasury/payout addresses.
- Exact decimal parsing to integer nano units; checksum-aware addresses and network checks.
- Same-domain PNG icon and current app name in the public HTTPS TON Connect manifest.
- Wallet transaction binds `network`, `from`, amount and a verified comment BoC.
- Deposits require matching sender, recipient, comment, amount, invoice time window,
  successful execution, real transaction hash and masterchain inclusion.
- Provider normalization retains outgoing messages and success evidence. History caches
  are isolated by network and wallet. Missing evidence keeps a payment pending.
- A valid payment indexed after the invoice/browser session expires can still be credited.
- Duplicate deposit verification cannot credit twice or trigger repeated notification attempts.
- Withdrawal request, balance reservation and daily limit check share one database transaction.
  A stable request key deduplicates retries, including concurrent requests.
- Payout execution is serialized across PostgreSQL app processes. Ambiguous broadcasts are
  quarantined for reconciliation, never automatically resent/refunded or assigned fake hashes.
- Payout confirmation requires the exact finalized incoming receipt at the recipient wallet.
- Legacy financial admin mutations remain disabled; failed reserve lookups never invent funds.

## Verification

Run `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`.
`build/ton-payment-test.cjs` tests concurrency, daily limits, replay and transaction rollback
against a dedicated PostgreSQL database whose name ends in `_validation` or `_test`.
`scripts/validate-ton.cjs` runs the real HTTP deposit routes against the isolated validation
DB and controlled, finalized testnet provider fixtures. It has no signing key, disables all
workers/bot, and blocks external fetches except fixture history reads. Its fixtures are test
harness files, not production API hooks. Neither test sends or signs a chain transaction.

## Still required before accepting real funds

1. The owner chooses the treasury and a dedicated supported payout wallet; configure secrets
   directly on the server, outside Git and chat. Obtain reliable chain API access.
2. Test actual TON Connect approve/reject/disconnect/reconnect and wrong-network behavior
   in the owner's Telegram/Tonkeeper environment. Agent source/fixture checks cannot prove
   that a personal wallet approved the connection.
3. Fund an isolated testnet wallet and verify real deposit/withdrawal traces, fees and recovery.
   The owner performs any real-value approval; no production funds were used by these tests.
4. Implement and verify durable chain-history pagination/cursors and operator reconciliation
   for `queued`, `broadcasting` and `reconciliation_required` requests after process crashes.
   The current bounded history fetch fails closed and is not complete historical backfill.
5. Validate notification retry/outbox behavior. Current notification attempts are at most once;
   they are not guaranteed delivery. Verify supported wallet contract derivation.
6. Re-review the remaining TON game settlement/legacy finance code separately before enabling
   TON stakes. The running free/vVIRAL gameplay and balances are outside this change.

References: https://docs.ton.org/applications/payments/overview,
https://docs.ton.org/applications/ton-connect/get-started, https://ton.org/media/.
