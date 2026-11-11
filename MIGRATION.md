# Spaceship migration checkpoint

Source: user-supplied GitHub archive, matching main commit 93b47cbd4aca155710087caac1e1be73fc8e3fa9.

This is a restricted migration deployment, not a verified financial release.

## Implemented

- Native Firebase Admin SDK only. Removed the client-SDK and in-memory store adapters.
- Quota/access/availability errors block storage operations instead of simulating success.
- One controlled health probe per process; 1-minute, 5-minute, then 15-minute retry delay with jitter.
- No boot-time user migration, test connection query or withdrawal reset.
- Workers start after Admin preflight; process registry prevents duplicate/overlapping timer runs.
- Financial writes, bot configuration and financial workers are disabled by default.
- Server bundle is separate from public web assets.
- Container runs as non-root; host binding is loopback-only, with no public database port.

## Deploy the restricted checkpoint

1. Copy `.env.example` to `.env`. Keep all enable flags false. Set APP_URL only after choosing the HTTPS domain.
2. Create `secrets/` (outside git). An authorized Firebase Admin credential can be mounted here; set GOOGLE_APPLICATION_CREDENTIALS to its container path only after provisioning it. Never commit credentials or TON mnemonic.
3. Run `docker compose up -d --build`.
4. `/health/live` must return HTTP 200. `/health/ready` returns HTTP 503 until Admin access to the configured Firestore database succeeds. `/api/*` returns a safe 503 while the circuit is open. With FINANCIAL_ACTIONS_ENABLED=false, non-read API methods remain blocked even after database recovery.
5. Inspect `docker compose logs --tail=100 arena` and `docker compose ps`.

## Required before public cutover

- Verify the actual current AI Studio source if it has changes newer than this archive.
- Obtain a consistent export of users, balances, deposits, withdrawals, ledger entries, processed-transaction guards and idempotency records. Reconcile them against on-chain records before importing or enabling workers.
- Provide authorized Admin credentials for the exact project/database. Moving the server does not migrate Firestore.
- Audit authentication and admin permissions, settlement and withdrawal concurrency, amounts, worker indexes, profile deduplication and full financial flows. The regression tests here verify storage failure handling, not the game economy.
- Single-start guards are process-local. Run one application instance until distributed worker ownership is implemented.
- Configure a domain, HTTPS reverse proxy, origin policy, backups and recovery procedure.
- Stop old financial workers before enabling the new ones. Switch Telegram menu/webhook and TON Connect manifest only after the new URL is verified.
- Reboot the fresh VPS for the pending Ubuntu kernel update before public launch, then verify services again.

PostgreSQL conversion is not implemented in this checkpoint. Firestore remains the authoritative store until a separately verified data migration.

## Validation

Local TypeScript check, eight storage/worker regression tests and production build pass. Vite reports an existing large frontend bundle warning. No production funds were moved or tested.
