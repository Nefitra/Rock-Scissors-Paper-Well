# Telegram identity, owner access and avatars

Released 12 November 2026 (Europe/Berlin).

- Telegram display name and username are separate. A zero-day streak no longer renders a stray `0` beside the name.
- The backend reads username, display name and photo URL from HMAC-verified Telegram initData. Client-submitted replacement names or photo URLs do not override these verified fields.
- Profile shows the current Telegram ID and server-approved role. The owner administration button is directly below the profile card.
- Two previously authorized owner accounts are enabled by numeric ID in the server environment. The access restoration was recorded as a deployment action in `adminAudit`; usernames are not authorization identifiers.
- The actual community is the supergroup `@VIRAL_App_Community`, ID `-1004402362755`. Telegram Bot API confirmed the game bot is an administrator with pin permissions. This verified ID is set as VIRAL_COMMUNITY_CHAT_ID, so membership verification does not use the obsolete numeric fallback.
- Home and Profile display the Telegram photo. When initData omits it or the direct image fails, the authenticated `/api/telegram/avatar` endpoint retrieves only the caller's available profile photo through the Bot API. The token and Telegram bot/file URL stay on the server.
- Avatar responses are private, vary by initData header and are size-limited. Telegram's application/octet-stream responses are accepted only when bytes identify JPEG, PNG or WebP. Missing/private photos use initials.

Validation: TypeScript, production builds, 15 local unit tests (one additional PostgreSQL test requires a database), isolated game/profile and admin API suites passed. The game suite checks that forged client profile fields are ignored and an unsigned avatar request is rejected. A live read of the owner's actual Telegram photo using the deployed loader returned `image/jpeg`, 10824 bytes, after reproducing and fixing Telegram's binary MIME response.

Matchmaking, game settlement and TON handlers remain unchanged. Financial actions and both financial workers stay disabled. No Telegram announcement or pin was sent during these checks.

To load the new interface, fully close the Mini App and reopen it, then select Profile. Actual rendering within the owner's Telegram client still requires checking on that device.
