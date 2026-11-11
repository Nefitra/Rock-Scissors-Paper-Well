# Cyber Duel: fresh Spaceship deployment

The owner chose a new empty database. No old Firestore records are imported or deleted. Historical TON transfers remain historical transfers and are not recreated as credits.

## Runtime

- URL: https://play.cyberduel.app (nginx / HTTPS / automatic certificate renewal).
- One application instance with a private PostgreSQL 17 service and a persistent Docker volume. No public database port. Application port binds to host loopback.
- DATABASE_PROVIDER=postgres prevents initialization of the old Firebase connection. Document-shaped records are stored durably in JSONB; there is no in-memory storage fallback.
- Database transactions serialize writers with a PostgreSQL advisory lock. Point ledger receipts and balances commit together; deterministic receipt IDs reject duplicate credits. This coarse lock deliberately favors correctness over throughput for the initial release.
- PostgreSQL outage opens the storage circuit; failed operations are not reported as successful.
- Telegram HMAC verification validates identity and auth_date; webhook requests require a separate secret. Admin access requires explicit numeric ADMIN_TELEGRAM_IDS, empty by default.
- Removed the demo admin allowlist. Disabled the legacy client-supplied win reward and production database test endpoint. Daily reward date comes from the server.
- APP_WRITES_ENABLED controls registration and game writes separately from FINANCIAL_ACTIONS_ENABLED. Real TON deposits, withdrawals and games remain paused with all financial workers disabled.

## Deploy

1. Generate PG_PASSWORD and TELEGRAM_WEBHOOK_SECRET on the server. Set DATABASE_URL to the private postgres service, APP_URL to the HTTPS URL and TELEGRAM_BOT_TOKEN to the existing authorized bot token. Store only in server .env with mode 0600; never commit secrets.
2. Keep APP_WRITES_ENABLED=false and TELEGRAM_BOT_ENABLED=false for the initial build. Keep all TON enable flags false and emergency pauses true.
3. Run docker compose up -d --build. PostgreSQL must be healthy and /health/ready must return 200.
4. Run the real database integration suite inside the application container with DATABASE_TEST_URL set to DATABASE_URL. It creates isolated temporary records and removes them afterward. Verify concurrent duplicate credits, rollback, persistence across separate connections, filters, merge and batch rollback.
5. Set APP_WRITES_ENABLED=true and TELEGRAM_BOT_ENABLED=true only after those checks pass, then recreate the app container. Verify the bot menu and webhook point to this deployment.
6. Assign the owner's verified numeric Telegram ID in ADMIN_TELEGRAM_IDS. Never infer privileges from usernames or grant them to the first public visitor.

## Validation and limits

TypeScript, storage circuit tests, Telegram signature tests and production build run during Docker build. The database integration test is skipped without DATABASE_TEST_URL; it must also pass against the real server database before writes are enabled.

This is a fresh game launch, not a completed financial audit. Keep real TON actions disabled until treasury/wallet configuration, settlement/withdrawal concurrency, chain reconciliation and deposit notification idempotency have been verified. No production funds are moved by this migration.

Run a single app instance. Matchmaking and reward paths beyond the atomic point ledger still need concurrency review before wider public release. Preserve a database dump before further upgrades; local snapshots alone do not protect against loss of the VPS.
