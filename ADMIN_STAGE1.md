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

Выпуск установлен на Spaceship 12 ноября 2026 года (Europe/Berlin).
Рабочая сборка: `7be8262647ff80edcdbdc30751ccb285f9fa38ec`.

| Проверка | Результат |
| --- | --- |
| TypeScript и production build | Пройдены локально и в Docker-сборке |
| Локальные тесты | 11 пройдены; тест PostgreSQL без подключения пропущен локально |
| PostgreSQL integration на VPS | Пройден отдельно на тестовой базе: параллельные начисления, идемпотентность, rollback и сохранение |
| Административный API | Пройден на 137 тестовых игроках и одной записи с некорректными полями |
| Авторизация | Анонимный запрос: 401; обычный игрок: 403; тестовый владелец: доступ разрешён |
| Заметки и настройки | Сохраняются с журналом одной транзакцией; устаревшая версия получает 409 |
| Безопасность настроек | Изменение финансовых флагов, экономики, бота и стороннего URL отклоняется |
| Полный игровой цикл | Регистрация, один приветственный бонус, бот/PvP, скрытые ходы, повторный ход и сохранение после перезапуска — пройдены |
| Игровой код | Сверены 23 обработчика игрового и TON API: без изменений |
| Рабочие данные | Контрольные суммы игроков, матчей и финансовых записей до/после обновления совпали |
| Публичный сервер | HTTPS readiness: 200, контейнеры приложения и PostgreSQL healthy |
| Загрузка админки | Отдельный JS-файл AdminPanel возвращает HTTP 200 |
| Telegram | Меню и webhook на play.cyberduel.app, очередь 0, ошибок webhook нет |
| TON | FINANCIAL_ACTIONS_ENABLED=false, оба финансовых worker-флага false, все три emergency pause=true |

Перед обновлением создан и проверен приватный дамп PostgreSQL на сервере.
Тестовые пользователи и финансовые записи для этого выпуска создавались только в отдельных проверочных базах. Рабочие записи не редактировались тестами.

Журнал фиксирует новые действия с момента установки этой версии. Отправка объявлений и закрепление сообщений в Telegram в проверках не выполнялись.

Остаётся проверка внешнего вида на устройстве владельца: полностью закрыть Mini App, открыть заново, затем Профиль → «Открыть управление игрой». Проверки API выполнялись через подписанные изолированные сессии; визуальный проход внутри реального Telegram-сеанса владельца не выполнялся.

