import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  limit,
  memoryLocalCache
} from 'firebase/firestore';
import crypto from 'crypto';

// Initialize Express
const app = express();
app.use(express.json());

const PORT = 3000;

// Load Firebase configuration
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error("Missing firebase-applet-config.json. Please run set_up_firebase first.");
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const firebaseApp = initializeApp(firebaseConfig);
const firestoreInstance = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true,
  localCache: memoryLocalCache()
}, firebaseConfig.firestoreDatabaseId);

// Simple compatibility shim so we do not have to rewrite all DB queries across the codebase:
class DocumentReferenceShim {
  constructor(private fInstance: any, private collectionPath: string, private docId: string) {}

  get id() {
    return this.docId;
  }

  async get() {
    const r = doc(this.fInstance, this.collectionPath, this.docId);
    const snap = await getDoc(r);
    return {
      exists: snap.exists(),
      data: () => snap.data()
    };
  }

  async set(data: any) {
    const r = doc(this.fInstance, this.collectionPath, this.docId);
    return await setDoc(r, data);
  }

  async update(data: any) {
    const r = doc(this.fInstance, this.collectionPath, this.docId);
    return await updateDoc(r, data);
  }
}

class CollectionReferenceShim {
  private conditions: any[] = [];
  private limitCount: number | null = null;

  constructor(private fInstance: any, private collectionPath: string) {}

  doc(docId?: string) {
    const finalId = docId || doc(collection(this.fInstance, this.collectionPath)).id;
    return new DocumentReferenceShim(this.fInstance, this.collectionPath, finalId);
  }

  where(field: string, op: any, value: any) {
    const q = new CollectionReferenceShim(this.fInstance, this.collectionPath);
    q.conditions = [...this.conditions, where(field, op, value)];
    q.limitCount = this.limitCount;
    return q;
  }

  limit(count: number) {
    const q = new CollectionReferenceShim(this.fInstance, this.collectionPath);
    q.conditions = [...this.conditions];
    q.limitCount = count;
    return q;
  }

  async get() {
    let q = query(collection(this.fInstance, this.collectionPath), ...this.conditions);
    if (this.limitCount !== null) {
      q = query(q, limit(this.limitCount));
    }
    const snap = await getDocs(q);
    return {
      docs: snap.docs.map(d => ({
        id: d.id,
        data: () => d.data()
      })),
      forEach: (callback: (d: any) => void) => {
        snap.docs.forEach(d => {
          callback({
            id: d.id,
            data: () => d.data()
          });
        });
      }
    };
  }
}

const db = {
  collection: (path: string) => new CollectionReferenceShim(firestoreInstance, path)
};

// Test firestore connection on boot
async function testConnection() {
  try {
    console.log("Testing Firestore connection on database ID:", firebaseConfig.firestoreDatabaseId);
    // Attempt to read from the users collection
    const testDoc = doc(firestoreInstance, 'users', '_connection_test_doc');
    await getDoc(testDoc);
    console.log("Firestore connection test: SUCCESS! (Read permission verified)");
  } catch (error: any) {
    console.error("Firestore connection test: FAILED.", error);
  }
}
testConnection();

// Load locales for bot i18n
const locales: Record<string, any> = {};
const localesDir = path.join(process.cwd(), 'locales');
if (fs.existsSync(localesDir)) {
  const files = fs.readdirSync(localesDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const lang = file.replace('.json', '');
      try {
        locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
      } catch (err) {
        console.error(`Failed to parse locale ${file}:`, err);
      }
    }
  }
}

function tBot(lang: string, key: string, params: Record<string, any> = {}): string {
  const targetLang = locales[lang] ? lang : 'en';
  const dictionary = locales[targetLang] || locales['en'] || {};
  
  const parts = key.split('.');
  let value: any = dictionary;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      value = undefined;
      break;
    }
  }
  
  // Fallback to English if value is missing
  if (value === undefined && targetLang !== 'en') {
    const enDict = locales['en'] || {};
    let enValue: any = enDict;
    for (const part of parts) {
      if (enValue && typeof enValue === 'object' && part in enValue) {
        enValue = enValue[part];
      } else {
        enValue = undefined;
        break;
      }
    }
    value = enValue;
  }
  
  if (value === undefined) {
    return key;
  }
  
  let result = String(value);
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${k}}`, 'g'), String(v));
  }
  return result;
}

async function detectUserLanguage(tgId: string, telegramLangCode?: string): Promise<string> {
  try {
    const uSnap = await db.collection('users').doc(tgId).get();
    if (uSnap.exists) {
      const ud = uSnap.data() || {};
      if (ud.lang) return ud.lang;
      if (ud.language) return ud.language;
    }
  } catch (err) {
    console.error("Failed to fetch user lang from DB:", err);
  }
  
  if (telegramLangCode) {
    const supported = ['zh-CN', 'fr', 'ja', 'pt', 'hi', 'tr', 'id', 'ru', 'ar', 'de', 'es', 'en'];
    let code = telegramLangCode.toLowerCase();
    if (code.startsWith('zh')) return 'zh-CN';
    const found = supported.find(s => s.toLowerCase() === code || s.toLowerCase().startsWith(code));
    if (found) return found;
  }
  
  return 'en';
}

// Admin Telegram IDs (user can edit these or we auto-include Besker/Boris and other testers)
const ADMIN_TELEGRAM_IDS = ["beskerboris", "admin", "123456789", "711279376", "525364261"];

// Cryptographical Telegram Mini App InitData validator
function verifyTelegramWebAppData(initData: string, botToken: string): { verified: boolean; user?: any } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { verified: false };

    // Sort all key-value pairs alphabetically, excluding 'hash'
    const keys = Array.from(params.keys()).filter(k => k !== 'hash').sort();
    const dataCheckArr = keys.map(k => `${k}=${params.get(k)}`);
    const dataCheckString = dataCheckArr.join('\n');

    // Create a SHA-256 HMAC of 'WebAppData' string using bot token as key
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    // Compute HMAC with SHA-256 using that secret
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash === hash) {
      const userStr = params.get('user');
      const user = userStr ? JSON.parse(userStr) : null;
      return { verified: true, user };
    }
    return { verified: false };
  } catch (err) {
    console.error("Telegram WebApp Signature verification failed:", err);
    return { verified: false };
  }
}

// Helper to normalize the user identifier for case-insensitive lookup safety (string-based usernames are converted to lowercase)
function sanitizeUserId(id: string): string {
  if (!id) return "";
  const trimmed = String(id).trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.toLowerCase();
}

// Helper to extract the authenticated user identity
// Enforces cryptographic verification if TELEGRAM_BOT_TOKEN is configured in environment
// Falls back graciously (with warnings) for external and dev sandbox clients
function getRequestUser(req: express.Request): { userId: string; username?: string; isVerified: boolean } {
  const initDataHeader = req.headers['x-telegram-init-data'];
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (initDataHeader && typeof initDataHeader === 'string') {
    if (botToken) {
      const verification = verifyTelegramWebAppData(initDataHeader, botToken);
      if (verification.verified && verification.user) {
        return {
          userId: sanitizeUserId(String(verification.user.id)),
          username: String(verification.user.username || verification.user.first_name || ""),
          isVerified: true
        };
      } else {
        console.warn("Incoming request failed Telegram cryptographic verification.");
      }
    } else {
      // Parse without verification in Sandbox development environments
      try {
        const params = new URLSearchParams(initDataHeader);
        const userStr = params.get('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          return {
            userId: sanitizeUserId(String(user.id)),
            username: String(user.username || user.first_name || ""),
            isVerified: false
          };
        }
      } catch (err) {
        // failed parse
      }
    }
  }

  // Fallback to body or query params for local sandbox play-tester
  const requestorId = (req.body?.userId || req.body?.telegramId || req.query?.requestorId || "");
  const requestorUsername = (req.body?.username || "");
  return {
    userId: sanitizeUserId(String(requestorId)),
    username: String(requestorUsername),
    isVerified: false
  };
}

function getLaunchButton(text: string, startappParam: string, isPrivate: boolean) {
  if (isPrivate) {
    return {
      text,
      web_app: {
        url: `https://rock-scissors-paper-well-52536426129.us-west1.run.app?startapp=${startappParam}`
      }
    };
  } else {
    return {
      text,
      url: `https://t.me/CyberDuellitebot?startapp=${startappParam}`
    };
  }
}

async function sendProfileNotFound(chatId: any, isPrivate: boolean, userLang: string = 'en', username: string = '') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const text = tBot(userLang, 'bot.profileNotFound', { username: username || 'User' });
  const button = getLaunchButton(tBot(userLang, 'home.playNow').toUpperCase(), "arena", isPrivate);

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[button]]
      }
    })
  });
}

// Masks opponent move from client until game is completed to prevent cheating
function sanitizeGameForUser(game: any, userId: string): any {
  if (!game) return null;
  const sanitized = { ...game };
  if (sanitized.status !== 'completed') {
    if (sanitized.player1Id === userId) {
      if (sanitized.player2Id !== 'bot') {
        sanitized.player2Move = sanitized.player2Move ? "secret" : "";
      }
    } else if (sanitized.player2Id === userId) {
      sanitized.player1Move = sanitized.player1Move ? "secret" : "";
    } else {
      sanitized.player1Move = sanitized.player1Move ? "secret" : "";
      sanitized.player2Move = sanitized.player2Move ? "secret" : "";
    }
  }
  return sanitized;
}

// Helper to determine game outcome
// Rules:
// - Rock beats Scissors
// - Scissors beats Paper
// - Paper beats Rock
// - Well beats Rock and Scissors
// - Paper beats Well
function getWinner(move1: string, move2: string, p1Id: string, p2Id: string): string {
  if (move1 === move2) return "draw";

  // Player 1 wins conditions
  if (
    (move1 === "rock" && move2 === "scissors") ||
    (move1 === "scissors" && move2 === "paper") ||
    (move1 === "paper" && move2 === "rock") ||
    (move1 === "well" && (move2 === "rock" || move2 === "scissors")) ||
    (move1 === "paper" && move2 === "well")
  ) {
    return p1Id;
  }

  // Otherwise Player 2 wins
  return p2Id;
}

// Centralized VIRAL ARENA Economy Configuration
const ECONOMY_CONFIG = {
  freeMatchWinReward: 20,
  freeMatchParticipationReward: 5,
  freeMatchDrawReward: 10,
  dailyRewardCap: 500,
  referralReward: 100,
  referredReward: 50,
  friendChallengeWinReward: 50,
  stakePresets: [50, 100, 250, 500, 1000],
  platformFeePercent: 10, // 10% platform fee on staked matches
  minBalanceForStaking: 50,
  welcomeBonus: 500 // Start with 500 vVIRAL to play stake matches immediately
};

// Centralized Duel / Challenge Configuration
const DUEL_CONFIG = {
  allowedStakes: [0, 50, 100, 250, 500, 1000],
  defaultStake: 0,
  expirationMinutes: 10,
  maxPendingChallengesPerChat: 3,
  platformFeePercent: 10
};

// Atomic Transaction-Safe Helper: Reserve User Stake
async function reserveUserStake(userId: string, stake: number, challengeId: string, idempotencyKey: string) {
  if (stake <= 0) return { success: true };
  const userRefReal = doc(firestoreInstance, 'users', userId);
  const { runTransaction } = await import('firebase/firestore');
  return await runTransaction(firestoreInstance, async (transaction) => {
    const uSnap = await transaction.get(userRefReal);
    if (!uSnap.exists()) {
      throw new Error("user_not_found");
    }
    const uData = uSnap.data() || {};
    const currentBalance = uData.vViral !== undefined ? uData.vViral : 0;
    const currentReserved = uData.vViralReserved !== undefined ? uData.vViralReserved : 0;

    // Check transaction idempotency first
    const txRef = doc(firestoreInstance, 'transactions', idempotencyKey);
    const txSnap = await transaction.get(txRef);
    if (txSnap.exists()) {
      return { success: true };
    }

    if (currentBalance < stake) {
      throw new Error("insufficient_balance");
    }

    const newBalance = currentBalance - stake;
    const newReserved = currentReserved + stake;

    const txRecord = {
      id: idempotencyKey,
      userId,
      type: 'debit',
      amount: -stake,
      prevBalance: currentBalance,
      newBalance: newBalance,
      source: 'stake_duel_reserve',
      referenceId: challengeId,
      timestamp: new Date().toISOString(),
      idempotencyKey,
      status: 'completed'
    };

    transaction.set(txRef, txRecord);
    transaction.update(userRefReal, {
      vViral: newBalance,
      vViralReserved: newReserved
    });

    return { success: true, newBalance, newReserved };
  });
}

// Atomic Transaction-Safe Helper: Release User Stake
async function releaseUserStake(userId: string, stake: number, challengeId: string, idempotencyKey: string) {
  if (stake <= 0) return { success: true };
  const userRefReal = doc(firestoreInstance, 'users', userId);
  const { runTransaction } = await import('firebase/firestore');
  return await runTransaction(firestoreInstance, async (transaction) => {
    const uSnap = await transaction.get(userRefReal);
    if (!uSnap.exists()) {
      throw new Error("user_not_found");
    }
    const uData = uSnap.data() || {};
    const currentBalance = uData.vViral !== undefined ? uData.vViral : 0;
    const currentReserved = uData.vViralReserved !== undefined ? uData.vViralReserved : 0;

    // Check transaction idempotency first
    const txRef = doc(firestoreInstance, 'transactions', idempotencyKey);
    const txSnap = await transaction.get(txRef);
    if (txSnap.exists()) {
      return { success: true };
    }

    const newBalance = currentBalance + stake;
    const newReserved = Math.max(0, currentReserved - stake);

    const txRecord = {
      id: idempotencyKey,
      userId,
      type: 'credit',
      amount: stake,
      prevBalance: currentBalance,
      newBalance: newBalance,
      source: 'stake_duel_refund',
      referenceId: challengeId,
      timestamp: new Date().toISOString(),
      idempotencyKey,
      status: 'completed'
    };

    transaction.set(txRef, txRecord);
    transaction.update(userRefReal, {
      vViral: newBalance,
      vViralReserved: newReserved
    });

    return { success: true, newBalance, newReserved };
  });
}

// Atomic Transaction-Safe Helper: Settle and Clear Reserved Challenge Stakes upon Match Completion
async function settleChallengeReservations(challengeId: string, winnerId: string, player1Id: string, player2Id: string, stake: number, matchId: string) {
  // Update the challenge status to completed
  await db.collection('challenges').doc(challengeId).update({
    status: 'completed',
    completedAt: new Date().toISOString(),
    matchId: matchId
  });

  if (stake <= 0) return;

  const { runTransaction } = await import('firebase/firestore');
  const p1RefReal = doc(firestoreInstance, 'users', player1Id);
  const p2RefReal = doc(firestoreInstance, 'users', player2Id);

  await runTransaction(firestoreInstance, async (transaction) => {
    const p1Snap = await transaction.get(p1RefReal);
    const p2Snap = await transaction.get(p2RefReal);

    const p1Data = p1Snap.data() || {};
    const p2Data = p2Snap.data() || {};

    const p1Reserved = p1Data.vViralReserved !== undefined ? p1Data.vViralReserved : 0;
    const p2Reserved = p2Data.vViralReserved !== undefined ? p2Data.vViralReserved : 0;

    const newP1Reserved = Math.max(0, p1Reserved - stake);
    const newP2Reserved = Math.max(0, p2Reserved - stake);

    transaction.update(p1RefReal, { vViralReserved: newP1Reserved });
    transaction.update(p2RefReal, { vViralReserved: newP2Reserved });

    const txIdP1 = `settle_clear_p1_${challengeId}`;
    const txIdP2 = `settle_clear_p2_${challengeId}`;

    const txRefP1 = doc(firestoreInstance, 'transactions', txIdP1);
    const txRefP2 = doc(firestoreInstance, 'transactions', txIdP2);

    transaction.set(txRefP1, {
      id: txIdP1,
      userId: player1Id,
      type: 'debit',
      amount: -stake,
      prevBalance: p1Data.vViral || 0,
      newBalance: p1Data.vViral || 0,
      source: 'stake_duel_clear_reserve',
      referenceId: challengeId,
      timestamp: new Date().toISOString(),
      idempotencyKey: txIdP1,
      status: 'completed'
    });

    transaction.set(txRefP2, {
      id: txIdP2,
      userId: player2Id,
      type: 'debit',
      amount: -stake,
      prevBalance: p2Data.vViral || 0,
      newBalance: p2Data.vViral || 0,
      source: 'stake_duel_clear_reserve',
      referenceId: challengeId,
      timestamp: new Date().toISOString(),
      idempotencyKey: txIdP2,
      status: 'completed'
    });
  });
}

// Reusable Atomic Transaction Ledger Helper
async function adjustUserVViral(
  userId: string,
  amount: number,
  type: string,
  source: string,
  referenceId?: string,
  idempotencyKey?: string
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new Error("User not found");
    }

    const userData = userSnap.data() || {};
    const currentBalance = userData.vViral !== undefined ? userData.vViral : 0;

    // Check idempotency if a key is provided
    if (idempotencyKey) {
      const existingTx = await db.collection('transactions')
        .where('idempotencyKey', '==', idempotencyKey)
        .get();
      if (existingTx.docs.length > 0) {
        return { success: true, newBalance: currentBalance };
      }
    }

    const newBalance = Math.max(0, currentBalance + amount);

    // Record immutable ledger entry
    const txId = db.collection('transactions').doc().id;
    const txRecord = {
      id: txId,
      userId,
      type, // 'credit' | 'debit'
      amount,
      prevBalance: currentBalance,
      newBalance,
      source, // e.g. 'welcome_bonus', 'free_duel_win', 'stake_duel_win', 'stake_duel_entry', 'daily_mission', 'referral', etc.
      referenceId: referenceId || "",
      timestamp: new Date().toISOString(),
      status: 'completed',
      idempotencyKey: idempotencyKey || ""
    };

    await db.collection('transactions').doc(txId).set(txRecord);

    // Update player profile
    await userRef.update({
      vViral: newBalance
    });

    return { success: true, newBalance };
  } catch (err: any) {
    console.error(`Error adjusting vVIRAL balance for user ${userId}:`, err);
    throw err;
  }
}

// Daily Mission progress helper
const MISSION_CONFIGS: Record<string, { maxProgress: number; reward: number; title: string; desc: string }> = {
  play_1_duel: { maxProgress: 1, reward: 50, title: "Play 1 Duel", desc: "Complete 1 match in any arena mode" },
  play_3_duels: { maxProgress: 3, reward: 100, title: "Play 3 Duels", desc: "Complete 3 matches in any arena mode" },
  win_1_duel: { maxProgress: 1, reward: 50, title: "Win 1 Duel", desc: "Defeat any opponent in the arena" },
  win_3_duels: { maxProgress: 3, reward: 150, title: "Win 3 Duels", desc: "Settle 3 victories in the arena" },
  challenge_friend: { maxProgress: 1, reward: 50, title: "Challenge a Friend", desc: "Initiate or accept a Friend Duel" },
  share_result: { maxProgress: 1, reward: 50, title: "Share Duel Result", desc: "Broadcast your match results to Telegram" },
  visit_viral: { maxProgress: 1, reward: 30, title: "Visit VIRAL App", desc: "Explore the VIRAL ecosystem interface" },
  join_community: { maxProgress: 1, reward: 30, title: "Join VIRAL Community", desc: "Join our official chat group" }
};

async function updateMissionProgress(userId: string, missionId: string, increment: number) {
  try {
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) return;
    const userData = snap.data() || {};
    const missions = userData.missions || {};

    const config = MISSION_CONFIGS[missionId];
    if (!config) return;

    const mProgress = missions[missionId] || { progress: 0, completed: false, claimed: false };
    if (mProgress.claimed) return; // Already claimed, bypass

    const newProgress = Math.min(config.maxProgress, (mProgress.progress || 0) + increment);
    const completed = newProgress >= config.maxProgress;

    missions[missionId] = {
      progress: newProgress,
      completed,
      claimed: mProgress.claimed || false,
      lastUpdated: new Date().toISOString()
    };

    await userRef.update({ missions });
  } catch (err) {
    console.error(`Error updating mission progress for user ${userId}:`, err);
  }
}

// Boot-time user migration to the vVIRAL ecosystem
async function runUserMigration() {
  try {
    console.log("Running user migration to vVIRAL ecosystem...");
    const usersSnap = await db.collection('users').get();
    let migratedCount = 0;

    for (const d of usersSnap.docs) {
      const data = d.data() || {};
      if (data.vViral === undefined) {
        const oldBalance = data.points !== undefined ? data.points : (data.balance !== undefined ? data.balance : ECONOMY_CONFIG.welcomeBonus);
        const updates: any = {
          vViral: oldBalance
        };
        if (!data.missions) {
          updates.missions = {};
        }
        await db.collection('users').doc(d.id).update(updates);
        migratedCount++;
      }
    }

    console.log(`Migration completed successfully! Migrated ${migratedCount} users.`);
    await db.collection('reports').doc('migration_report').set({
      timestamp: new Date().toISOString(),
      migratedCount,
      status: 'success'
    });
  } catch (error) {
    console.error("Migration error:", error);
  }
}
setTimeout(runUserMigration, 2000);

// REST APIs
// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: "ok", service: "VIRAL ARENA Server", power: "Powered by VIRAL ARENA" });
});

// 2. User Sync & Registration (including referrers tracking L1 & L2)
app.post('/api/user/sync', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { telegramId, username, walletAddress, referredBy, lang } = req.body;

    let targetTgId = telegramId ? sanitizeUserId(telegramId) : "";
    let targetUsername = username;

    if (verifiedUser.userId) {
      targetTgId = verifiedUser.userId;
      if (verifiedUser.username) {
        targetUsername = verifiedUser.username;
      }
    }

    if (!targetTgId) {
      return res.status(400).json({ error: "telegramId is required" });
    }

    const userId = targetTgId; // Use normalized telegramId as document ID for simple direct mapping
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    const cleanReferredBy = referredBy ? sanitizeUserId(referredBy) : "";

    if (userSnap.exists) {
      // User already exists, update wallet address if changed
      const currentData = userSnap.data() || {};
      let updated = false;
      const upData: any = {};
      
      // Retroactive referral check if user doesn't have referredBy set yet
      if (!currentData.referredBy && cleanReferredBy && cleanReferredBy !== userId) {
        const referrerRef = db.collection('users').doc(cleanReferredBy);
        const referrerSnap = await referrerRef.get();
        if (referrerSnap.exists) {
          upData.referredBy = cleanReferredBy;
          updated = true;
          
          const referrerData = referrerSnap.data() || {};
          
          // Update Level 1 (direct) referral count
          const newL1Count = (referrerData.referralsCountL1 || 0) + 1;
          await referrerRef.update({ referralsCountL1: newL1Count });

          // Update Level 2 (indirect) referral count for grand referrer if exists
          if (referrerData.referredBy) {
            const grandRef = db.collection('users').doc(referrerData.referredBy);
            const grandSnap = await grandRef.get();
            if (grandSnap.exists) {
              const grandData = grandSnap.data() || {};
              const newL2Count = (grandData.referralsCountL2 || 0) + 1;
              await grandRef.update({ referralsCountL2: newL2Count });
            }
          }
        }
      }

      if (walletAddress && currentData.walletAddress !== walletAddress) {
        upData.walletAddress = walletAddress;
        updated = true;
      }
      if (username && currentData.username !== username) {
        upData.username = username;
        updated = true;
      }
      if (lang && currentData.lang !== lang) {
        upData.lang = lang;
        updated = true;
      }
      if (!currentData.welcomeRewardClaimed) {
        try {
          await adjustUserVViral(
            targetTgId,
            ECONOMY_CONFIG.welcomeBonus,
            'credit',
            'welcome_bonus',
            'welcome',
            `welcome_${targetTgId}`
          );
        } catch (e) {
          // ignore error if already credited or failed
        }
        upData.welcomeRewardClaimed = true;
        upData.vViral = (currentData.vViral !== undefined ? currentData.vViral : 0) + ECONOMY_CONFIG.welcomeBonus;
        updated = true;
      } else if (currentData.vViral === undefined) {
        upData.vViral = ECONOMY_CONFIG.welcomeBonus;
        updated = true;
      }
      if (!currentData.missions) {
        upData.missions = {};
        updated = true;
      }
      if (updated) {
        await userRef.update(upData);
      }
      return res.json({ profile: { ...currentData, ...upData } });
    }

    // New user signup
    let finalReferredBy = "";
    if (cleanReferredBy && cleanReferredBy !== userId) {
      // Check if referrer exists
      const referrerRef = db.collection('users').doc(cleanReferredBy);
      const referrerSnap = await referrerRef.get();
      if (referrerSnap.exists) {
        finalReferredBy = cleanReferredBy;
        const referrerData = referrerSnap.data() || {};
        
        // Update direct L1 count
        const newL1Count = (referrerData.referralsCountL1 || 0) + 1;
        await referrerRef.update({ referralsCountL1: newL1Count });

        // Update L2 count for grand referrer if exists
        if (referrerData.referredBy) {
          const grandRef = db.collection('users').doc(referrerData.referredBy);
          const grandSnap = await grandRef.get();
          if (grandSnap.exists) {
            const grandData = grandSnap.data() || {};
            const newL2Count = (grandData.referralsCountL2 || 0) + 1;
            await grandRef.update({ referralsCountL2: newL2Count });
          }
        }
      }
    }

    const newProfile = {
      telegramId: targetTgId,
      username: targetUsername || `telegram_${targetTgId}`,
      walletAddress: walletAddress || "",
      referredBy: finalReferredBy,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      referralsCountL1: 0,
      referralsCountL2: 0,
      streak: 0,
      xp: 0,
      vViral: ECONOMY_CONFIG.welcomeBonus,
      welcomeRewardClaimed: true,
      missions: {},
      lastLoginDate: "",
      lang: lang || "en",
      createdAt: new Date().toISOString()
    };

    await userRef.set(newProfile);

    // Record welcome bonus transaction in ledger
    await adjustUserVViral(
      targetTgId,
      ECONOMY_CONFIG.welcomeBonus,
      'credit',
      'welcome_bonus',
      'welcome',
      `welcome_${targetTgId}`
    );

    res.json({ profile: newProfile });
  } catch (error: any) {
    console.error("Sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. User statistics read
app.get('/api/user/:userId', async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userSnap.data() || {};
    if (userData.vViral === undefined) {
      userData.vViral = ECONOMY_CONFIG.welcomeBonus;
    }
    if (!userData.missions) {
      userData.missions = {};
    }
    res.json({ profile: userData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.1 Claim Daily Login Streak reward (XP + vVIRAL 7-day loop)
app.post('/api/user/claim-daily', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { telegramId, clientDateString } = req.body;

    let targetTgId = telegramId ? sanitizeUserId(telegramId) : "";
    if (verifiedUser.userId) {
      targetTgId = verifiedUser.userId;
    }

    if (!targetTgId) {
      return res.status(400).json({ error: "telegramId is required" });
    }

    const userRef = db.collection('users').doc(targetTgId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data() || {};
    const todayStr = clientDateString || new Date().toISOString().split('T')[0];
    const lastClaimDate = userData.lastLoginDate || "";

    if (lastClaimDate === todayStr) {
      return res.status(400).json({ error: "Daily login already claimed today!" });
    }

    let currentStreak = userData.streak || 0;

    // Calculate yesterday's date string
    const clientDate = new Date(todayStr);
    const tempDate = new Date(clientDate);
    tempDate.setDate(tempDate.getDate() - 1);
    const yesterdayStr = tempDate.toISOString().split('T')[0];

    if (lastClaimDate === yesterdayStr) {
      currentStreak += 1;
    } else {
      // Streak broken, or first claim
      currentStreak = 1;
    }

    // Determine vVIRAL reward based on 7-day sequence loop
    const dayIndex = ((currentStreak - 1) % 7) + 1; // 1 to 7
    const SEQUENCE_REWARDS = [50, 100, 150, 200, 250, 300, 500];
    const vViralReward = SEQUENCE_REWARDS[dayIndex - 1] || 50;

    // We award +100 XP as the experience boost.
    // Plus a dynamic streak multiplier bonus! (e.g. +10 XP per day of streak up to +50 XP)
    const streakBonus = Math.min(5, currentStreak) * 10;
    const baseReward = 100;
    const totalAwardedXp = baseReward + streakBonus;
    
    const newXp = (userData.xp || 0) + totalAwardedXp;

    const updates = {
      streak: currentStreak,
      lastLoginDate: todayStr,
      xp: newXp
    };

    await userRef.update(updates);

    // Credit vVIRAL balance and record transaction ledger
    const balanceResult = await adjustUserVViral(
      targetTgId,
      vViralReward,
      'credit',
      'daily_check_in',
      `day_${dayIndex}`,
      `idempotency_${targetTgId}_checkin_${todayStr}`
    );

    // Increment mission progress for daily check in
    await updateMissionProgress(targetTgId, 'visit_viral', 1);

    res.json({
      success: true,
      streak: currentStreak,
      xp: newXp,
      vViral: balanceResult.newBalance,
      lastLoginDate: todayStr,
      awardedXp: totalAwardedXp,
      awardedVViral: vViralReward,
      message: `Successfully claimed! Day ${dayIndex} reward: +${vViralReward} vVIRAL & +${totalAwardedXp} XP granted!`
    });
  } catch (error: any) {
    console.error("Daily claim error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3a. Global Leaderboard top 10 (returns extended metrics)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const usersList: any[] = [];
    usersSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.telegramId) {
        usersList.push({
          telegramId: data.telegramId,
          username: data.username || `User_${data.telegramId}`,
          wins: data.wins || 0,
          losses: data.losses || 0,
          gamesPlayed: data.gamesPlayed || 0,
          vViral: data.vViral !== undefined ? data.vViral : 500,
          streak: data.streak || 0
        });
      }
    });

    // Sort by wins desc, then gamesPlayed desc
    usersList.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.gamesPlayed - a.gamesPlayed;
    });

    const top10 = usersList.slice(0, 10);
    res.json({ leaderboard: top10 });
  } catch (error: any) {
    console.error("Leaderboard query error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3b. Reward authenticated user with wins (Multi-Window Game Achievement)
app.post('/api/user/reward-wins', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { amount, challengeId } = req.body;

    let targetTgId = verifiedUser.userId;
    if (!targetTgId) {
      targetTgId = req.body.telegramId;
    }

    if (!targetTgId) {
      return res.status(400).json({ error: "Authentication or telegramId required" });
    }

    const userRef = db.collection('users').doc(targetTgId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const currentData = userSnap.data() || {};
    const claimedRewards = currentData.claimedRewards || [];
    if (claimedRewards.includes(challengeId)) {
      return res.status(400).json({ error: "Reward already claimed" });
    }

    const updatedWins = (currentData.wins || 0) + (amount || 5);
    const newClaimed = [...claimedRewards, challengeId];

    // Award bonus incentive of +10 vVIRAL per window level achievement!
    const vViralBonus = (amount || 5) * 10;

    await userRef.update({
      wins: updatedWins,
      claimedRewards: newClaimed
    });

    const balanceResult = await adjustUserVViral(
      targetTgId,
      vViralBonus,
      'credit',
      'multi_window_achievement',
      challengeId,
      `idempotency_${targetTgId}_win_${challengeId}`
    );

    const finalProfile = { 
      ...currentData, 
      wins: updatedWins, 
      vViral: balanceResult.newBalance,
      claimedRewards: newClaimed 
    };
    res.json({ success: true, profile: finalProfile });
  } catch (error: any) {
    console.error("Reward wins error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3c. Daily Missions Claim endpoint
app.post('/api/mission/claim', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { userId, missionId } = req.body;
    let targetUserId = userId || verifiedUser.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const userRef = db.collection('users').doc(targetUserId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snap.data() || {};
    const missions = userData.missions || {};
    const mProgress = missions[missionId];

    if (!mProgress || !mProgress.completed) {
      return res.status(400).json({ error: "Mission is not completed or not found" });
    }

    if (mProgress.claimed) {
      return res.status(400).json({ error: "Mission reward already claimed" });
    }

    const config = MISSION_CONFIGS[missionId];
    if (!config) {
      return res.status(400).json({ error: "Invalid mission configuration" });
    }

    // Update status to claimed
    missions[missionId] = {
      ...mProgress,
      claimed: true
    };

    await userRef.update({ missions });

    // Credit reward
    const result = await adjustUserVViral(
      targetUserId,
      config.reward,
      'credit',
      `mission_${missionId}`,
      missionId,
      `idempotency_${targetUserId}_claim_${missionId}`
    );

    // Complete "Complete Daily Check-In" mission itself on claiming any mission or checkin
    await updateMissionProgress(targetUserId, 'visit_viral', 1);

    res.json({
      success: true,
      vViral: result.newBalance,
      reward: config.reward,
      missions
    });
  } catch (error: any) {
    console.error("Claim mission error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3d. Dynamic Mission Progress trigger (clicks, shares)
app.post('/api/mission/trigger', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { userId, missionId } = req.body;
    let targetUserId = userId || verifiedUser.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!['visit_viral', 'join_community', 'share_result'].includes(missionId)) {
      return res.status(400).json({ error: "Invalid dynamic mission" });
    }

    await updateMissionProgress(targetUserId, missionId, 1);
    
    const userRef = db.collection('users').doc(targetUserId);
    const snap = await userRef.get();
    res.json({ success: true, profile: snap.data() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Join matchmaking / Find Game (Supports free & staked duels securely)
app.post('/api/matchmaking/join', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { userId, username, playWithBot, mode, stake, challengeId } = req.body;

    let targetUserId = userId;
    let targetUsername = username;

    if (verifiedUser.userId) {
      targetUserId = verifiedUser.userId;
      if (verifiedUser.username) {
        targetUsername = verifiedUser.username;
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Direct Challenge Acceptance Flow
    if (challengeId) {
      // Check if this challenge exists in the new challenges collection
      let chalDoc = await db.collection('challenges').doc(challengeId).get();
      if (!chalDoc.exists && challengeId.startsWith('duel_')) {
        const cleanId = challengeId.replace('duel_', '');
        chalDoc = await db.collection('challenges').doc(cleanId).get();
      }

      if (chalDoc.exists) {
        const chalData = chalDoc.data() || {};
        const creatorId = chalData.creatorTelegramId;
        const opponentId = chalData.opponentTelegramId;

        // Requirement 9: Backend must validate challenge ID, current user identity, creator or accepted opponent, challenge status, and associated match ID
        if (targetUserId !== creatorId && targetUserId !== opponentId) {
          return res.status(403).json({ error: "Access denied. You are not a participant in this duel." });
        }

        if (chalData.status !== 'accepted' && chalData.status !== 'in_progress' && chalData.status !== 'completed') {
          return res.status(400).json({ error: `This duel challenge is currently ${chalData.status}.` });
        }

        const mId = chalData.matchId || challengeId;
        const matchSnap = await db.collection('games').doc(mId).get();
        if (!matchSnap.exists) {
          return res.status(404).json({ error: "Associated game match not found." });
        }

        const matchData = matchSnap.data();
        return res.json({ game: sanitizeGameForUser(matchData, targetUserId) });
      }

      const gameRef = db.collection('games').doc(challengeId);
      const gameSnap = await gameRef.get();
      if (!gameSnap.exists) {
        return res.status(404).json({ error: "Duel challenge not found." });
      }

      const gd = gameSnap.data() || {};
      
      // If user is already a participant of this game, return it directly
      if (gd.player1Id === targetUserId || gd.player2Id === targetUserId) {
        return res.json({ game: sanitizeGameForUser(gd, targetUserId) });
      }

      if (gd.status !== 'waiting') {
        return res.status(400).json({ error: "This challenge has already been accepted or is no longer waiting." });
      }

      if (gd.player1Id === targetUserId) {
        return res.status(400).json({ error: "You cannot accept your own challenge!" });
      }

      // Restrict restricted opponent challenge
      if (gd.allowedOpponent) {
        const checkTargetName = (targetUsername || "").toLowerCase().replace('@', '').trim();
        const checkTargetId = targetUserId.toLowerCase().trim();
        if (gd.allowedOpponent !== checkTargetName && gd.allowedOpponent !== checkTargetId) {
          return res.status(403).json({ error: `This private duel is reserved for @${gd.allowedOpponent}!` });
        }
      }

      // Read player document to check vVIRAL balance
      const targetUserSnap = await db.collection('users').doc(targetUserId).get();
      if (!targetUserSnap.exists) {
        return res.status(404).json({ error: "User profile not found. Please sync first." });
      }

      const userData = targetUserSnap.data() || {};
      const checkStake = gd.stake || 0;
      if (gd.mode === 'stake' && checkStake > 0) {
        const currentBalance = userData.vViral !== undefined ? userData.vViral : 0;
        if (currentBalance < checkStake) {
          return res.status(400).json({ 
            error: `Insufficient balance! You need at least ${checkStake} vVIRAL to accept this staked duel.` 
          });
        }

        // Deduct stake from the accepter
        const deductKey = `join_challenge_deduct_${targetUserId}_${challengeId}`;
        await adjustUserVViral(
          targetUserId,
          -checkStake,
          'debit',
          'stake_duel_entry',
          challengeId,
          deductKey
        );
      }

      // Match the game!
      const updatedFields = {
        player2Id: targetUserId,
        player2Username: targetUsername || `User_${targetUserId}`,
        status: "matched",
        matchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await gameRef.update(updatedFields);
      const matchedGame = { ...gd, ...updatedFields };

      // Edit Telegram group message if tgChatId & tgMessageId exist
      if (gd.tgChatId && gd.tgMessageId) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          const formattedStake = checkStake > 0 ? `${checkStake} vVIRAL` : "Free Match";
          const messageText = `⚔️ *DUEL MATCHED!*\n\n` +
                              `👤 *Host:* @${gd.player1Username || 'user'}\n` +
                              `👤 *Opponent:* @${targetUsername || 'user'}\n` +
                              `💰 *Stake:* ${formattedStake}\n` +
                              `⚡ *Status:* Match is live! Launch the Arena to play your moves!`;
          
          await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: gd.tgChatId,
              message_id: Number(gd.tgMessageId),
              text: messageText,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { "text": "⚔️ LAUNCH ARENA", "url": "https://t.me/CyberDuellitebot?startapp=arena" }
                  ]
                ]
              }
            })
          }).catch(e => console.error("Error editing Telegram accepted message:", e));
        }
      }

      // Complete Daily Mission "Challenge a Friend"
      await updateMissionProgress(gd.player1Id, 'challenge_friend', 1);
      await updateMissionProgress(targetUserId, 'challenge_friend', 1);

      return res.json({ game: sanitizeGameForUser(matchedGame, targetUserId) });
    }

    const targetMode = mode || "free";
    const targetStake = typeof stake === 'number' ? Math.max(0, stake) : 0;

    // Validate stake preset if mode is 'stake'
    if (targetMode === 'stake') {
      if (!ECONOMY_CONFIG.stakePresets.includes(targetStake)) {
        return res.status(400).json({ error: `Invalid stake amount. Allowed presets: ${ECONOMY_CONFIG.stakePresets.join(', ')} vVIRAL` });
      }
    }

    // Read player document to check vVIRAL balance and wallet status
    let targetWallet: string | null = null;
    const targetUserSnap = await db.collection('users').doc(targetUserId).get();
    if (!targetUserSnap.exists) {
      return res.status(404).json({ error: "User profile not found. Please sync first." });
    }

    const userData = targetUserSnap.data() || {};
    targetWallet = userData.walletAddress || null;

    // Check balance for stake modes
    if (targetMode === 'stake' && targetStake > 0) {
      const currentBalance = userData.vViral !== undefined ? userData.vViral : 0;
      if (currentBalance < targetStake) {
        return res.status(400).json({ 
          error: `Insufficient balance! You need at least ${targetStake} vVIRAL, but only have ${currentBalance} vVIRAL.` 
        });
      }
    }

    // Always clean up any existing uncompleted games created by this same user to avoid phantom matches
    try {
      const existingWaiting = await db.collection('games')
        .where('player1Id', '==', targetUserId)
        .where('status', 'in', ['searching', 'waiting', 'matched', 'countdown', 'move_selection', 'resolving'])
        .get();
      for (const doc of existingWaiting.docs) {
        const gd = doc.data() || {};
        // If it was a stake game, refund the player immediately!
        if (gd.status === 'searching' && gd.mode === 'stake' && gd.stake > 0) {
          await adjustUserVViral(
            targetUserId, 
            gd.stake, 
            'credit', 
            'stake_duel_refund', 
            doc.id, 
            `refund_cleanup_${doc.id}_${targetUserId}`
          );
        }
        await db.collection('games').doc(doc.id).update({
          status: 'canceled',
          updatedAt: new Date().toISOString()
        });
      }
      
      const existingWaiting2 = await db.collection('games')
        .where('player2Id', '==', targetUserId)
        .where('status', 'in', ['searching', 'waiting', 'matched', 'countdown', 'move_selection', 'resolving'])
        .get();
      for (const doc of existingWaiting2.docs) {
        await db.collection('games').doc(doc.id).update({
          status: 'canceled',
          updatedAt: new Date().toISOString()
        });
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up previous games:", cleanupErr);
    }

    // Deduct stake if playing stake mode
    if (targetMode === 'stake' && targetStake > 0) {
      const deductKey = `join_deduct_${targetUserId}_${Date.now()}`;
      await adjustUserVViral(
        targetUserId,
        -targetStake,
        'debit',
        'stake_duel_entry',
        'matchmaking_join',
        deductKey
      );
    }

    if (playWithBot) {
      // Create immediate custom bot game
      const botGameRef = db.collection('games').doc();
      const botGame = {
        id: botGameRef.id,
        player1Id: targetUserId,
        player1Username: targetUsername || "Player 1",
        player2Id: "bot",
        player2Username: "TonBot 🤖",
        player1Move: "",
        player2Move: "",
        winnerId: "",
        status: "matched",
        mode: targetMode,
        stake: targetStake,
        matchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await botGameRef.set(botGame);
      return res.json({ game: botGame });
    }

    // Look for a game waiting for active players (searching status or waiting status)
    const querySnapshot = await db.collection('games')
      .where('status', 'in', ['searching', 'waiting'])
      .get();

    let foundGame: any = null;
    const now = Date.now();
    for (const docSnap of querySnapshot.docs) {
      const gData = docSnap.data();
      
      // Prevent self matching on telegramId
      if (gData.player1Id === targetUserId) {
        continue;
      }

      // Match free with free, and stakes with matching stakes
      const opponentMode = gData.mode || "free";
      const opponentStake = gData.stake || 0;
      if (opponentMode !== targetMode || opponentStake !== targetStake) {
        continue;
      }

      // Only match if the game host is actively polling (updatedAt within the last 15 seconds)
      const lastUpdatedMs = gData.updatedAt ? new Date(gData.updatedAt).getTime() : 0;
      if (now - lastUpdatedMs > 15000) {
        continue; // This is a stale/abandoned matchmaking request, bypass it
      }

      // Prevent matching on same wallet address
      let opponentWallet: string | null = null;
      const opponentUserSnap = await db.collection('users').doc(gData.player1Id).get();
      if (opponentUserSnap.exists) {
        opponentWallet = opponentUserSnap.data()?.walletAddress || null;
      }

      if (targetWallet && opponentWallet && targetWallet.toLowerCase() === opponentWallet.toLowerCase()) {
        continue;
      }

      foundGame = gData;
      break;
    }

    if (foundGame) {
      try {
        const { runTransaction } = await import('firebase/firestore');
        const gameRefReal = doc(firestoreInstance, 'games', foundGame.id);
        const matchResult = await runTransaction(firestoreInstance, async (transaction) => {
          const freshSnap = await transaction.get(gameRefReal);
          if (!freshSnap.exists()) {
            throw new Error("game_not_found");
          }
          const freshData = freshSnap.data() || {};
          const currentStatus = freshData.status;
          const currentPlayer2Id = freshData.player2Id;
          
          if ((currentStatus !== 'searching' && currentStatus !== 'waiting') || currentPlayer2Id !== 'waiting') {
            throw new Error("already_matched");
          }
          
          const updatedFields = {
            player2Id: targetUserId,
            player2Username: targetUsername || "Player 2",
            status: "matched",
            matchedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          transaction.update(gameRefReal, updatedFields);
          return { ...freshData, ...updatedFields };
        });
        
        return res.json({ game: sanitizeGameForUser(matchResult, targetUserId) });
      } catch (transactionError: any) {
        if (transactionError.message === 'already_matched') {
          console.log(`Race condition avoided: game ${foundGame.id} was already matched.`);
        } else {
          console.error("Matchmaking transaction error:", transactionError);
        }
      }
    }

    // No existing waiting game, create a brand new lobby
    const newGameRef = db.collection('games').doc();
    const newGame = {
      id: newGameRef.id,
      player1Id: targetUserId,
      player1Username: targetUsername || "Player 1",
      player2Id: "waiting",
      player2Username: "Matchmaking Queue...",
      player1Move: "",
      player2Move: "",
      winnerId: "",
      status: "searching",
      mode: targetMode,
      stake: targetStake,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await newGameRef.set(newGame);
    res.json({ game: sanitizeGameForUser(newGame, targetUserId) });
  } catch (error: any) {
    console.error("Matchmaking error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4a. Cancel Matchmaking
app.post('/api/matchmaking/cancel', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { gameId, userId } = req.body;
    let targetUserId = userId || verifiedUser.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const gameRef = db.collection('games').doc(gameId);
    const snap = await gameRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gData = snap.data() || {};
    if (gData.player1Id !== targetUserId && gData.player2Id !== targetUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Refund stake if canceling a real pending search
    if (gData.status === 'searching' && gData.mode === 'stake' && gData.stake > 0) {
      const refundTarget = gData.player1Id;
      await adjustUserVViral(
        refundTarget, 
        gData.stake, 
        'credit', 
        'stake_duel_refund', 
        gameId, 
        `refund_cancel_${gameId}_${refundTarget}`
      );
    }

    await gameRef.update({
      status: "canceled",
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Cancel matchmaking error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4b. Forfeit / Leave Active Arena
app.post('/api/game/leave', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { gameId, userId } = req.body;
    let targetUserId = userId || verifiedUser.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const gameRef = db.collection('games').doc(gameId);
    const snap = await gameRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gData = snap.data() || {};
    if (gData.player1Id !== targetUserId && gData.player2Id !== targetUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (gData.status === 'completed' || gData.status === 'canceled' || gData.status === 'cancelled') {
      return res.json({ game: gData });
    }

    const amPlayer1 = gData.player1Id === targetUserId;
    const opponentId = amPlayer1 ? gData.player2Id : gData.player1Id;

    if (opponentId === 'bot' || opponentId === 'waiting') {
      // If host cancels a staked search game or forfeits a bot
      if (gData.status === 'searching' && gData.mode === 'stake' && gData.stake > 0) {
        await adjustUserVViral(
          targetUserId,
          gData.stake,
          'credit',
          'stake_duel_refund',
          gameId,
          `refund_botleave_${gameId}_${targetUserId}`
        );
      }
      await gameRef.update({
        status: "canceled",
        updatedAt: new Date().toISOString()
      });
      return res.json({ game: { ...gData, status: "canceled" } });
    }

    // Forfeit real PvP game: declare opponent as winner
    const updatedFields: any = {
      winnerId: opponentId,
      status: "completed",
      forfeitedBy: targetUserId,
      updatedAt: new Date().toISOString()
    };
    await gameRef.update(updatedFields);

    const isStaked = gData.mode === 'stake' && gData.stake > 0;
    const stakeAmount = gData.stake || 0;

    const p1Ref = db.collection('users').doc(gData.player1Id);
    const p2Ref = db.collection('users').doc(gData.player2Id);
    const [p1Snap, p2Snap] = await Promise.all([p1Ref.get(), p2Ref.get()]);

    const updatePromises: Promise<any>[] = [];

    if (p1Snap.exists) {
      const d1 = p1Snap.data() || {};
      const won = opponentId === gData.player1Id;
      updatePromises.push(p1Ref.update({
        gamesPlayed: (d1.gamesPlayed || 0) + 1,
        wins: won ? (d1.wins || 0) + 1 : (d1.wins || 0),
        losses: won ? (d1.losses || 0) : (d1.losses || 0) + 1,
        xp: (d1.xp || 0) + (won ? 100 : 50)
      }));

      // Adjust currency for winner and loser
      if (won) {
        if (isStaked) {
          const winPool = Math.floor(stakeAmount * (2 - ECONOMY_CONFIG.platformFeePercent / 100));
          await adjustUserVViral(gData.player1Id, winPool, 'credit', 'stake_duel_win', gameId, `win_forfeited_${gameId}_${gData.player1Id}`);
        } else {
          // Free win
          await adjustUserVViral(gData.player1Id, ECONOMY_CONFIG.freeMatchWinReward, 'credit', 'free_duel_win', gameId, `win_free_${gameId}_${gData.player1Id}`);
        }
        await updateMissionProgress(gData.player1Id, 'win_1_duel', 1);
        await updateMissionProgress(gData.player1Id, 'win_3_duels', 1);
      } else {
        // Loser (forfeiter) gets no refunds on staked mode
        if (!isStaked) {
          await adjustUserVViral(gData.player1Id, ECONOMY_CONFIG.freeMatchParticipationReward, 'credit', 'free_duel_loss', gameId, `loss_free_${gameId}_${gData.player1Id}`);
        }
      }
      await updateMissionProgress(gData.player1Id, 'play_1_duel', 1);
      await updateMissionProgress(gData.player1Id, 'play_3_duels', 1);
    }

    if (p2Snap.exists) {
      const d2 = p2Snap.data() || {};
      const won = opponentId === gData.player2Id;
      updatePromises.push(p2Ref.update({
        gamesPlayed: (d2.gamesPlayed || 0) + 1,
        wins: won ? (d2.wins || 0) + 1 : (d2.wins || 0),
        losses: won ? (d2.losses || 0) : (d2.losses || 0) + 1,
        xp: (d2.xp || 0) + (won ? 100 : 50)
      }));

      // Adjust currency for winner and loser
      if (won) {
        if (isStaked) {
          const winPool = Math.floor(stakeAmount * (2 - ECONOMY_CONFIG.platformFeePercent / 100));
          await adjustUserVViral(gData.player2Id, winPool, 'credit', 'stake_duel_win', gameId, `win_forfeited_${gameId}_${gData.player2Id}`);
        } else {
          // Free win
          await adjustUserVViral(gData.player2Id, ECONOMY_CONFIG.freeMatchWinReward, 'credit', 'free_duel_win', gameId, `win_free_${gameId}_${gData.player2Id}`);
        }
        await updateMissionProgress(gData.player2Id, 'win_1_duel', 1);
        await updateMissionProgress(gData.player2Id, 'win_3_duels', 1);
      } else {
        // Loser (forfeiter) gets no refunds on staked mode
        if (!isStaked) {
          await adjustUserVViral(gData.player2Id, ECONOMY_CONFIG.freeMatchParticipationReward, 'credit', 'free_duel_loss', gameId, `loss_free_${gameId}_${gData.player2Id}`);
        }
      }
      await updateMissionProgress(gData.player2Id, 'play_1_duel', 1);
      await updateMissionProgress(gData.player2Id, 'play_3_duels', 1);
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Settle challenge reservations if this match was generated by a persistent community challenge
    if (gData.challengeId) {
      await settleChallengeReservations(
        gData.challengeId,
        opponentId,
        gData.player1Id,
        gData.player2Id,
        stakeAmount,
        gameId
      ).catch(err => console.error("Error settling challenge reservations:", err));
    }

    const fullGame = { ...gData, ...updatedFields };
    res.json({ game: sanitizeGameForUser(fullGame, targetUserId) });
  } catch (error: any) {
    console.error("Forfeit match error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Submit Move
app.post('/api/game/move', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { gameId, userId, move } = req.body;

    let targetUserId = userId;
    if (verifiedUser.userId) {
      targetUserId = verifiedUser.userId;
    }

    if (!gameId || !targetUserId || !move) {
      return res.status(400).json({ error: "gameId, userId, and move are required" });
    }

    if (!["rock", "scissors", "paper", "well"].includes(move)) {
      return res.status(400).json({ error: "Invalid move" });
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameData = gameSnap.data() || {};
    
    // Check countdown constraint
    if (gameData.status === 'matched' && gameData.player2Id !== 'bot' && gameData.matchedAt) {
      const elapsed = Date.now() - new Date(gameData.matchedAt).getTime();
      if (elapsed < 3000) {
        return res.status(400).json({ error: "Choose move locked during active match countdown." });
      }
    }

    if (gameData.status !== "matched" && gameData.status !== "resolving" && gameData.status !== "move_selection") {
      return res.status(400).json({ error: "Game session is not in active playable state." });
    }

    const isPlayer1 = gameData.player1Id === targetUserId;
    const isPlayer2 = gameData.player2Id === targetUserId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: "You are not a participant in this game" });
    }

    const updatePlay: any = {};
    if (isPlayer1) {
      if (gameData.player1Move) {
        return res.status(400).json({ error: "Move already submitted" });
      }
      updatePlay.player1Move = move;
    } else {
      if (gameData.player2Move) {
        return res.status(400).json({ error: "Move already submitted" });
      }
      updatePlay.player2Move = move;
    }

    const finalP1Move = isPlayer1 ? move : gameData.player1Move;
    let finalP2Move = !isPlayer1 ? move : gameData.player2Move;

    // If opponent is a bot, pick a random move immediately
    if (gameData.player2Id === "bot") {
      const moves = ["rock", "scissors", "paper", "well"];
      finalP2Move = moves[Math.floor(Math.random() * moves.length)];
      updatePlay.player2Move = finalP2Move;
    }

    // Check if both moves are ready
    if (finalP1Move && finalP2Move) {
      const winnerId = getWinner(finalP1Move, finalP2Move, gameData.player1Id, gameData.player2Id);
      updatePlay.winnerId = winnerId;
      updatePlay.status = "completed";
      updatePlay.updatedAt = new Date().toISOString();

      const isStaked = gameData.mode === 'stake' && gameData.stake > 0;
      const stakeAmount = gameData.stake || 0;

      // Update player profile statistics concurrently to reduce database/network roundtrip latency
      const p1Ref = db.collection('users').doc(gameData.player1Id);
      const p2Ref = gameData.player2Id !== "bot" ? db.collection('users').doc(gameData.player2Id) : null;

      const [p1Snap, p2Snap] = await Promise.all([
        p1Ref.get(),
        p2Ref ? p2Ref.get() : Promise.resolve(null)
      ]);

      const updatePromises: Promise<any>[] = [];

      // Calculate Player 1 Reward updates
      if (p1Snap && p1Snap.exists) {
        const d1 = p1Snap.data() || {};
        const p1Wins = winnerId === gameData.player1Id ? (d1.wins || 0) + 1 : (d1.wins || 0);
        const p1Losses = (winnerId !== gameData.player1Id && winnerId !== "draw") ? (d1.losses || 0) + 1 : (d1.losses || 0);
        
        const xpReward = (winnerId === gameData.player1Id) ? 100 : 50;
        const currentXp = d1.xp || 0;
        
        updatePromises.push(p1Ref.update({
          gamesPlayed: (d1.gamesPlayed || 0) + 1,
          wins: p1Wins,
          losses: p1Losses,
          xp: currentXp + xpReward
        }));

        // Economy adjustment for player 1
        if (winnerId === "draw") {
          if (isStaked) {
            await adjustUserVViral(gameData.player1Id, stakeAmount, 'credit', 'stake_duel_refund', gameId, `refund_draw_${gameId}_p1`);
          } else {
            await adjustUserVViral(gameData.player1Id, ECONOMY_CONFIG.freeMatchDrawReward, 'credit', 'free_duel_draw', gameId, `draw_free_${gameId}_p1`);
          }
        } else if (winnerId === gameData.player1Id) {
          if (isStaked) {
            const winPool = Math.floor(stakeAmount * (2 - ECONOMY_CONFIG.platformFeePercent / 100));
            await adjustUserVViral(gameData.player1Id, winPool, 'credit', 'stake_duel_win', gameId, `win_stake_${gameId}_p1`);
          } else {
            await adjustUserVViral(gameData.player1Id, ECONOMY_CONFIG.freeMatchWinReward, 'credit', 'free_duel_win', gameId, `win_free_${gameId}_p1`);
          }
          await updateMissionProgress(gameData.player1Id, 'win_1_duel', 1);
          await updateMissionProgress(gameData.player1Id, 'win_3_duels', 1);
        } else {
          // Player 1 lost
          if (!isStaked) {
            await adjustUserVViral(gameData.player1Id, ECONOMY_CONFIG.freeMatchParticipationReward, 'credit', 'free_duel_loss', gameId, `loss_free_${gameId}_p1`);
          }
        }
        await updateMissionProgress(gameData.player1Id, 'play_1_duel', 1);
        await updateMissionProgress(gameData.player1Id, 'play_3_duels', 1);
      }

      // Calculate Player 2 Reward updates (if human)
      if (p2Snap && p2Snap.exists && p2Ref) {
        const d2 = p2Snap.data() || {};
        const p2Wins = winnerId === gameData.player2Id ? (d2.wins || 0) + 1 : (d2.wins || 0);
        const p2Losses = (winnerId !== gameData.player2Id && winnerId !== "draw") ? (d2.losses || 0) + 1 : (d2.losses || 0);
        
        const xpReward = (winnerId === gameData.player2Id) ? 100 : 50;
        const currentXp = d2.xp || 0;
        
        updatePromises.push(p2Ref.update({
          gamesPlayed: (d2.gamesPlayed || 0) + 1,
          wins: p2Wins,
          losses: p2Losses,
          xp: currentXp + xpReward
        }));

        // Economy adjustment for player 2
        if (winnerId === "draw") {
          if (isStaked) {
            await adjustUserVViral(gameData.player2Id, stakeAmount, 'credit', 'stake_duel_refund', gameId, `refund_draw_${gameId}_p2`);
          } else {
            await adjustUserVViral(gameData.player2Id, ECONOMY_CONFIG.freeMatchDrawReward, 'credit', 'free_duel_draw', gameId, `draw_free_${gameId}_p2`);
          }
        } else if (winnerId === gameData.player2Id) {
          if (isStaked) {
            const winPool = Math.floor(stakeAmount * (2 - ECONOMY_CONFIG.platformFeePercent / 100));
            await adjustUserVViral(gameData.player2Id, winPool, 'credit', 'stake_duel_win', gameId, `win_stake_${gameId}_p2`);
          } else {
            await adjustUserVViral(gameData.player2Id, ECONOMY_CONFIG.freeMatchWinReward, 'credit', 'free_duel_win', gameId, `win_free_${gameId}_p2`);
          }
          await updateMissionProgress(gameData.player2Id, 'win_1_duel', 1);
          await updateMissionProgress(gameData.player2Id, 'win_3_duels', 1);
        } else {
          // Player 2 lost
          if (!isStaked) {
            await adjustUserVViral(gameData.player2Id, ECONOMY_CONFIG.freeMatchParticipationReward, 'credit', 'free_duel_loss', gameId, `loss_free_${gameId}_p2`);
          }
        }
        await updateMissionProgress(gameData.player2Id, 'play_1_duel', 1);
        await updateMissionProgress(gameData.player2Id, 'play_3_duels', 1);
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      // Settle challenge reservations if this match was generated by a persistent community challenge
      if (gameData.challengeId) {
        await settleChallengeReservations(
          gameData.challengeId,
          winnerId,
          gameData.player1Id,
          gameData.player2Id,
          stakeAmount,
          gameId
        ).catch(err => console.error("Error settling challenge reservations:", err));
      }
    } else {
      // Only one player has moved
      updatePlay.status = "resolving";
      updatePlay.updatedAt = new Date().toISOString();
    }

    await gameRef.update(updatePlay);
    const fullGame = { ...gameData, ...updatePlay };
    res.json({ game: sanitizeGameForUser(fullGame, targetUserId) });
  } catch (error: any) {
    console.error("Submit move error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5a. Query Single Game Session State (Secure & Masked)
app.get('/api/game/:gameId', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { gameId } = req.params;
    if (!gameId) {
      return res.status(400).json({ error: "gameId is required" });
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameData = gameSnap.data() || {};

    // Dynamic heartbeat: if player 1 is actively on the matchmaking queue screen, we keep the updatedAt fresh 
    if (gameData.status === 'searching' && gameData.player1Id === verifiedUser.userId) {
      gameData.updatedAt = new Date().toISOString();
      await gameRef.update({ updatedAt: gameData.updatedAt });
    }
    
    // Dynamic status determination of countdown / move_selection for frontend polling symmetry
    let displayStatus = gameData.status;
    if (gameData.status === 'matched') {
      if (gameData.player2Id !== 'bot' && gameData.matchedAt) {
        const elapsed = Date.now() - new Date(gameData.matchedAt).getTime();
        if (elapsed >= 3000) {
          displayStatus = 'move_selection';
        } else {
          displayStatus = 'countdown';
        }
      } else {
        displayStatus = 'move_selection';
      }
    } else if (gameData.status === 'resolving') {
      // If resolving on server but player needs choosing move on client, we check moves
      const isP1 = gameData.player1Id === verifiedUser.userId;
      const ourMove = isP1 ? gameData.player1Move : gameData.player2Move;
      if (!ourMove) {
        displayStatus = 'move_selection';
      }
    }

    const fullGame = { ...gameData, status: displayStatus };
    const sanitized = sanitizeGameForUser(fullGame, verifiedUser.userId);
    res.json({ game: sanitized });
  } catch (error: any) {
    console.error("Get game error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Admin Panel data retrieval
app.get('/api/admin/metrics', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const requestorId = verifiedUser.userId || req.query.requestorId;

    if (!requestorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized admin identity." });
    }

    const idToCheck = String(requestorId).toLowerCase();
    const isApprovedAdmin = ADMIN_TELEGRAM_IDS.includes(idToCheck);

    if (!isApprovedAdmin) {
      return res.status(403).json({ error: `Access Denied. User @${requestorId} is not an approved Telegram Admin.` });
    }

    // Fetch all users
    const usersSnap = await db.collection('users').get();
    const usersList: any[] = [];
    usersSnap.forEach((d) => {
      usersList.push(d.data());
    });

    // Fetch games limit 100
    const gamesSnap = await db.collection('games').get();
    const gamesList: any[] = [];
    gamesSnap.forEach((d) => {
      gamesList.push(d.data());
    });

    // Sort games by date descending
    gamesList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aggregates
    const stats = {
      totalUsers: usersList.length,
      totalWallets: usersList.filter(u => u.walletAddress && u.walletAddress.length > 0).length,
      totalGames: gamesList.length,
      totalReferrals: usersList.reduce((acc, u) => acc + (u.referralsCountL1 || 0) + (u.referralsCountL2 || 0), 0)
    };

    res.json({
      authorized: true,
      stats,
      users: usersList,
      games: gamesList.slice(0, 50) // output last 50 games for high performance
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6a. Admin Custom Tournament/Announcement Broadcast
app.post('/api/admin/announcement', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const requestorId = verifiedUser.userId || req.body.requestorId;

    if (!requestorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }

    const idToCheck = String(requestorId).toLowerCase();
    if (!ADMIN_TELEGRAM_IDS.includes(idToCheck)) {
      return res.status(403).json({ error: "Access Denied. Admins only." });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Announcement text is required." });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN is not configured on the server." });
    }

    const settingsSnap = await db.collection('settings').doc('global_settings').get();
    const communityChatId = (settingsSnap.exists ? settingsSnap.data()?.communityChatId : null) || "@VIRAL_App_Community";

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: communityChatId,
        text: `📢 *VIRAL ARENA TOURNAMENT ANNOUNCEMENT*\n\n${text.trim()}\n\n_Fight in the Arena now! ⚔️_`,
        parse_mode: "Markdown"
      })
    });

    if (!tgRes.ok) {
      const tgErr = await tgRes.json();
      return res.status(500).json({ error: `Telegram delivery failed: ${JSON.stringify(tgErr)}` });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Announcement error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6b. Admin Post and Pin Leaderboard
app.post('/api/admin/pinned-message', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const requestorId = verifiedUser.userId || req.body.requestorId;

    if (!requestorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }

    const idToCheck = String(requestorId).toLowerCase();
    if (!ADMIN_TELEGRAM_IDS.includes(idToCheck)) {
      return res.status(403).json({ error: "Access Denied. Admins only." });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN is not configured." });
    }

    // Fetch and sort users to construct Leaderboard
    const usersSnap = await db.collection('users').get();
    const list: any[] = [];
    usersSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.telegramId) {
        list.push({
          username: data.username || `User_${data.telegramId}`,
          wins: data.wins || 0,
          vViral: data.vViral !== undefined ? data.vViral : 500
        });
      }
    });

    list.sort((a, b) => b.wins - a.wins);
    const top5 = list.slice(0, 5);

    let replyText = `🏆 *VIRAL ARENA OFFICIAL LEADERBOARD* 🏆\n\n` +
                    `Behold our ultimate active Gladiators fighting in the Arena:\n\n`;

    top5.forEach((player, idx) => {
      const medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : "⚔️"));
      replyText += `${medal} *#${idx + 1} @${player.username}* - ${player.wins} Wins | *${player.vViral}* vVIRAL\n`;
    });

    replyText += `\n🛡️ *How to play?*\n` +
                 `• Click the Menu button below or send \`/arena\` to launch the Web App!\n` +
                 `• Win matches in standard Rock-Paper-Scissors-Well Duel modes!\n` +
                 `• Create public group matches via \`/duel <stake>\` or invite friends using \`/challenge\`!\n\n` +
                 `_May the best duelist win! Powered by VIRAL Ecosystem_`;

    const settingsSnap = await db.collection('settings').doc('global_settings').get();
    const communityChatId = (settingsSnap.exists ? settingsSnap.data()?.communityChatId : null) || "@VIRAL_App_Community";

    // Send the message
    const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: communityChatId,
        text: replyText,
        parse_mode: "Markdown"
      })
    });

    if (!sendRes.ok) {
      const tgErr = await sendRes.json();
      return res.status(500).json({ error: `Leaderboard post failed: ${JSON.stringify(tgErr)}` });
    }

    const sentMsg = await sendRes.json();
    const sentMsgId = sentMsg.result?.message_id;

    if (sentMsgId) {
      // Pin the message
      await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: communityChatId,
          message_id: Number(sentMsgId),
          disable_notification: false
        })
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Pinned message generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6c. Admin Cancel/Manage active challenges
app.post('/api/admin/cancel-challenge', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const requestorId = verifiedUser.userId || req.body.requestorId;

    if (!requestorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }

    const idToCheck = String(requestorId).toLowerCase();
    if (!ADMIN_TELEGRAM_IDS.includes(idToCheck)) {
      return res.status(403).json({ error: "Access Denied. Admins only." });
    }

    const { challengeId } = req.body;
    if (!challengeId) {
      return res.status(400).json({ error: "challengeId is required." });
    }

    const gameRef = db.collection('games').doc(challengeId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      return res.status(404).json({ error: "Game not found." });
    }

    const gd = gameSnap.data() || {};
    
    // Refund creator if staked
    if (gd.mode === 'stake' && gd.stake > 0) {
      await adjustUserVViral(
        gd.player1Id,
        gd.stake,
        'credit',
        'stake_duel_refund',
        challengeId,
        `admin_cancel_refund_${challengeId}`
      );
    }

    await gameRef.update({
      status: 'canceled',
      updatedAt: new Date().toISOString()
    });

    // Edit Telegram group message if exists to clear buttons
    if (gd.tgChatId && gd.tgMessageId) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: gd.tgChatId,
            message_id: Number(gd.tgMessageId),
            text: `❌ *DUEL CHALLENGE CANCELLED BY ADMIN*\n\nThe challenge hosted by @${gd.player1Username || 'user'} was cancelled by an administrator. Any stakes have been refunded.`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [] }
          })
        }).catch(e => console.error("Error editing cancelled Telegram message:", e));
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin cancel challenge error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET global settings
app.get('/api/settings', async (req, res) => {
  try {
    const settingsDocName = 'global_settings';
    const settingsRef = db.collection('settings').doc(settingsDocName);
    const snap = await settingsRef.get();
    if (snap.exists) {
      res.json(snap.data());
    } else {
      // Default configurations
      res.json({
        botUsername: "RpsRockPaperBot",
        appName: "play",
        webUrl: ""
      });
    }
  } catch (error: any) {
    console.error("Error retrieving settings:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST global settings (restricted to approved admins)
app.post('/api/settings', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const requestorId = verifiedUser.userId || req.body.requestorId;
    if (!requestorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }
    const idToCheck = String(requestorId).toLowerCase();
    if (!ADMIN_TELEGRAM_IDS.includes(idToCheck)) {
      return res.status(403).json({ error: "Access Denied. Admins only." });
    }

    const { botUsername, appName, webUrl } = req.body;
    const settingsDocName = 'global_settings';
    await db.collection('settings').doc(settingsDocName).set({
      botUsername: botUsername || "",
      appName: appName || "",
      webUrl: webUrl || ""
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error saving settings:", error);
    res.status(500).json({ error: error.message });
  }
});

// Background Telegram Bot Worker Setup
const userCooldowns = new Map<string, number>();
const userDuelCooldowns = new Map<string, number>();
const userChallengeCooldowns = new Map<string, number>();

// Unified update handler for both Webhook and Fallback Long-Polling
async function handleTelegramUpdate(update: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const updateId = update.update_id || 0;
  const msg = update.message;

  let logChatId = "none";
  let logChatType = "none";
  let logChatUsername = "none";
  let logFromUserId = "none";
  let logMessageText = "none";

  if (msg) {
    logChatId = msg.chat ? String(msg.chat.id) : "none";
    logChatType = msg.chat ? String(msg.chat.type) : "none";
    logChatUsername = msg.chat?.username || "none";
    logFromUserId = msg.from ? String(msg.from.id) : "none";
    logMessageText = msg.text || "none";
  } else if (update.callback_query) {
    const cq = update.callback_query;
    logChatId = cq.message?.chat ? String(cq.message.chat.id) : "none";
    logChatType = cq.message?.chat ? String(cq.message.chat.type) : "none";
    logChatUsername = cq.message?.chat?.username || "none";
    logFromUserId = cq.from ? String(cq.from.id) : "none";
    logMessageText = `callback_query:${cq.data || ""}`;
  }

  // 11. Minimal structured logging
  console.log(
    `TELEGRAM_UPDATE_RECEIVED\n` +
    `update_id: ${updateId}\n` +
    `chat_id: ${logChatId}\n` +
    `chat_type: ${logChatType}\n` +
    `chat_username: ${logChatUsername}\n` +
    `from_user_id: ${logFromUserId}\n` +
    `message_text: ${logMessageText}`
  );

  // Handle Callback Queries (e.g. Accept Duel button press)
  if (update.callback_query) {
    const cq = update.callback_query;
    const cqId = cq.id;
    const cqUser = cq.from;
    const cqTgId = String(cqUser.id);
    const cqUsername = cqUser.username || `user_${cqUser.id}`;
    const cqData = cq.data || "";

    console.log(`[Telegram Callback Query] User ID: ${cqTgId}, Username: @${cqUsername}, Data: ${cqData}`);

    console.log(`[Telegram Callback Query] User ID: ${cqTgId}, Username: @${cqUsername}, Data: ${cqData}`);

    if (cqData.startsWith("cancel_duel:")) {
      const challengeId = cqData.substring("cancel_duel:".length);
      try {
        const chalRef = db.collection('challenges').doc(challengeId);
        const chalSnap = await chalRef.get();
        if (!chalSnap.exists) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ Challenge not found!",
              show_alert: true
            })
          });
          return;
        }

        const chalData = chalSnap.data() || {};
        const isAdminUser = ADMIN_TELEGRAM_IDS.includes(cqTgId) || ADMIN_TELEGRAM_IDS.includes(cqUsername.toLowerCase());

        // Verify identity: must be creator or approved admin (Requirement 11)
        if (cqTgId !== chalData.creatorTelegramId && !isAdminUser) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ Only the challenge creator or administrators can cancel this duel!",
              show_alert: true
            })
          });
          return;
        }

        // Confirm status is pending
        if (chalData.status !== 'pending') {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: `⚠️ This challenge is already ${chalData.status} and cannot be cancelled.`,
              show_alert: true
            })
          });
          return;
        }

        // Atomic transaction to mark as cancelled
        const { runTransaction } = await import('firebase/firestore');
        const chalRefReal = doc(firestoreInstance, 'challenges', challengeId);
        await runTransaction(firestoreInstance, async (transaction) => {
          const freshSnap = await transaction.get(chalRefReal);
          if (!freshSnap.exists()) throw new Error("not_found");
          const freshData = freshSnap.data() || {};
          if (freshData.status !== 'pending') throw new Error("status_changed");

          transaction.update(chalRefReal, {
            status: 'cancelled',
            completedAt: new Date().toISOString()
          });
        });

        // Release creator stake atomically if any (Requirement 11)
        if (chalData.stake > 0) {
          await releaseUserStake(
            chalData.creatorTelegramId,
            chalData.stake,
            challengeId,
            `cancel_refund_creator_${chalData.creatorTelegramId}_${challengeId}`
          );
        }

        // Edit Telegram group message
        if (cq.message) {
          const cancelMsg = `❌ *VIRAL DUEL CANCELLED*\n\nThe challenger left the Arena.`;
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: cancelMsg,
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [] }
            })
          });
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cqId,
            text: "❌ Duel challenge cancelled successfully.",
            show_alert: false
          })
        });

      } catch (err) {
        console.error("Cancel challenge callback error:", err);
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cqId,
            text: "⚠️ An error occurred while cancelling the challenge.",
            show_alert: true
          })
        });
      }
      return;
    }

    if (cqData.startsWith("accept_duel:")) {
      const challengeId = cqData.substring("accept_duel:".length);

      try {
        // Intercept if it exists in the challenges collection
        const chalRef = db.collection('challenges').doc(challengeId);
        const chalSnap = await chalRef.get();
        if (chalSnap.exists) {
          const chalData = chalSnap.data() || {};

          // Validate personal account (Requirement 6)
          const isAnonymous = !cqUser || !cqUser.id || String(cqUser.id) === "1087968824" || cqUsername.toLowerCase() === "groupanonymousbot" || !!cq.message?.sender_chat;
          if (isAnonymous) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ Personal account required. Please accept from your personal Telegram account.",
                show_alert: true
              })
            });
            return;
          }

          // Validate profiles
          const acceptorSnap = await db.collection('users').doc(cqTgId).get();
          if (!acceptorSnap.exists) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ Profile not initialized. Open the app to join first.",
                show_alert: true
              })
            });
            return;
          }

          const acceptorData = acceptorSnap.data() || {};
          if (acceptorData.blocked || acceptorData.isBlocked) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ Your account is blocked from participating in duels.",
                show_alert: true
              })
            });
            return;
          }

          // Validate not creator
          if (chalData.creatorTelegramId === cqTgId) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ You cannot accept your own duel challenge!",
                show_alert: true
              })
            });
            return;
          }

          // Validate status
          if (chalData.status !== 'pending') {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: `⚠️ This duel challenge is already ${chalData.status}!`,
                show_alert: true
              })
            });
            return;
          }

          // Validate expiration
          const expiresAtTime = new Date(chalData.expiresAt).getTime();
          if (Date.now() > expiresAtTime) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ This duel challenge has expired!",
                show_alert: true
              })
            });
            return;
          }

          // Validate dual participation (Requirement 13)
          const creatorActiveChals = await db.collection('challenges')
            .where('creatorTelegramId', '==', cqTgId)
            .where('status', 'in', ['pending', 'accepted', 'in_progress'])
            .get();
          const opponentActiveChals = await db.collection('challenges')
            .where('opponentTelegramId', '==', cqTgId)
            .where('status', 'in', ['accepted', 'in_progress'])
            .get();
          if (creatorActiveChals.docs.length > 0 || opponentActiveChals.docs.length > 0) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: "⚠️ You already have an active duel!",
                show_alert: true
              })
            });
            return;
          }

          // Validate balance
          const checkStake = chalData.stake || 0;
          if (checkStake > 0) {
            const availableBalance = acceptorData.vViral !== undefined ? acceptorData.vViral : 0;
            if (availableBalance < checkStake) {
              await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: cqId,
                  text: `⚠️ Insufficient balance! You need ${checkStake} vVIRAL.`,
                  show_alert: true
                })
              });
              return;
            }
          }

          // Run transaction to transition the challenge status and assign the match ID
          const chalRefReal = doc(firestoreInstance, 'challenges', challengeId);
          const { runTransaction } = await import('firebase/firestore');

          const txResult = await runTransaction(firestoreInstance, async (transaction) => {
            const freshSnap = await transaction.get(chalRefReal);
            if (!freshSnap.exists()) throw new Error("not_found");
            const freshData = freshSnap.data() || {};
            if (freshData.status !== 'pending') throw new Error("already_accepted");

            const matchId = db.collection('games').doc().id;
            transaction.update(chalRefReal, {
              status: 'accepted',
              opponentTelegramId: cqTgId,
              opponentUsername: cqUsername,
              acceptedAt: new Date().toISOString(),
              matchId: matchId
            });
            return { freshData, matchId };
          });

          // Reserve stakeholder balance for opponent
          if (checkStake > 0) {
            await reserveUserStake(
              cqTgId,
              checkStake,
              challengeId,
              `accept_reserve_opponent_${cqTgId}_${challengeId}`
            );
          }

          // Create the game match session
          const isPrivateChat = cq.message?.chat?.type === 'private';
          const newGame = {
            id: txResult.matchId,
            player1Id: chalData.creatorTelegramId,
            player1Username: chalData.creatorUsername,
            player2Id: cqTgId,
            player2Username: cqUsername,
            status: "matched",
            mode: checkStake > 0 ? "stake" : "free",
            stake: checkStake,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tgChatId: String(cq.message?.chat?.id || ""),
            tgMessageId: String(cq.message?.message_id || ""),
            challengeId: challengeId
          };
          await db.collection('games').doc(txResult.matchId).set(newGame);

          // Edit public Telegram group message (Requirement 8)
          if (cq.message) {
            const totalPrizePool = checkStake * 2;
            const prizePoolText = checkStake > 0 ? `${totalPrizePool} vVIRAL` : "Community Duel";
            const editMsgText = `⚔️ *DUEL ACCEPTED*\n\n` +
                                `@${chalData.creatorUsername}\n` +
                                `VS\n` +
                                `@${cqUsername}\n\n` +
                                `Prize Pool: ${prizePoolText}\n\n` +
                                `The battle is ready.`;

            const enterBtn = getLaunchButton("⚔️ ENTER BATTLE", "duel_" + challengeId, isPrivateChat);
            await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: cq.message.chat.id,
                message_id: cq.message.message_id,
                text: editMsgText,
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [enterBtn]
                  ]
                }
              })
            });
          }

          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚔️ Duel challenge accepted successfully! Press ENTER BATTLE to launch.",
              show_alert: false
            })
          });

          // Trigger mission achievements
          await updateMissionProgress(chalData.creatorTelegramId, 'challenge_friend', 1);
          await updateMissionProgress(cqTgId, 'challenge_friend', 1);
          return;
        }

        const gameRef = db.collection('games').doc(challengeId);
        const gameSnap = await gameRef.get();
        if (!gameSnap.exists) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ This duel challenge has expired or was not found!",
              show_alert: true
            })
          });
          return;
        }

        const gd = gameSnap.data() || {};
        if (gd.status !== 'waiting') {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ This duel challenge has already been matched or completed!",
              show_alert: true
            })
          });
          return;
        }

        if (gd.player1Id === cqTgId) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ You cannot accept your own duel challenge!",
              show_alert: true
            })
          });
          return;
        }

        // Check allowedOpponent restriction
        if (gd.allowedOpponent) {
          const checkName = cqUsername.toLowerCase().trim();
          const checkId = cqTgId.toLowerCase().trim();
          if (gd.allowedOpponent !== checkName && gd.allowedOpponent !== checkId) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: `⚠️ This private challenge is only for @${gd.allowedOpponent}!`,
                show_alert: true
              })
            });
            return;
          }
        }

        // Retrieve accepter profile
        const accepterSnap = await db.collection('users').doc(cqTgId).get();
        if (!accepterSnap.exists) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: cqId,
              text: "⚠️ Account not found! Launch the VIRAL Arena App once to initialize.",
              show_alert: true
            })
          });
          return;
        }

        const checkStake = gd.stake || 0;
        if (gd.mode === 'stake' && checkStake > 0) {
          const ud = accepterSnap.data() || {};
          const balance = ud.vViral !== undefined ? ud.vViral : 0;
          if (balance < checkStake) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: cqId,
                text: `⚠️ Insufficient vVIRAL! You need ${checkStake} vVIRAL to accept this challenge.`,
                show_alert: true
              })
            });
            return;
          }

          // Deduct stake from the accepter
          await adjustUserVViral(
            cqTgId,
            -checkStake,
            'debit',
            'stake_duel_entry',
            challengeId,
            `join_callback_deduct_${cqTgId}_${challengeId}`
          );
        }

        // Match and save
        const updatedFields = {
          player2Id: cqTgId,
          player2Username: cqUsername,
          status: "matched",
          matchedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await gameRef.update(updatedFields);

        // Edit group message to announce active match
        if (cq.message) {
          const editMsgText = `⚔️ *DUEL ACCEPTED*\n\n` +
                              `@${gd.player1Username || 'user'}\n` +
                              `VS\n` +
                              `@${cqUsername}`;

          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: editMsgText,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { "text": "⚔️ ENTER BATTLE", "url": `https://t.me/CyberDuellitebot?startapp=duel_${challengeId}` }
                  ]
                ]
              }
            })
          });
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cqId,
            text: "⚔️ Duel accepted! Open the app to play your move.",
            show_alert: false
          })
        });

        // Trigger mission achievements
        await updateMissionProgress(gd.player1Id, 'challenge_friend', 1);
        await updateMissionProgress(cqTgId, 'challenge_friend', 1);

      } catch (cqErr) {
        console.error("Callback query exception:", cqErr);
      }
    }
    return;
  }

  const message = update.message;
  if (!message || !message.text) return;

  const text = message.text.trim();
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const isPrivateChat = chatType === 'private';
  const user = message.from;

  // Command parser
  if (text.startsWith('/')) {
    // Support group command suffixes (e.g. /arena@CyberDuellitebot -> /arena)
    const command = text
      .split(/\s+/)[0]
      .split("@")[0]
      .toLowerCase();

    // 11. Structured logging for parsed command
    console.log(`TELEGRAM_COMMAND_PARSED\ncommand: ${command}`);

    // Detect if anonymous/invalid personal account (on personal commands)
    const personalCommands = ['/balance', '/myrank', '/missions', '/duel', '/challenge'];
    const isAnonymous = !user || !user.id || String(user.id) === "1087968824" || user.username?.toLowerCase() === "groupanonymousbot" || !!message.sender_chat;

    if (isAnonymous && personalCommands.includes(command)) {
      const replyText = `⚠️ *Personal account required*\n\nPlease send this command from your personal Telegram account, not anonymously or on behalf of the group.`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown"
        })
      });
      return;
    }

    // EXPLICIT BYPASS HANDLERS FOR PING AND ARENA - NO FIRESTORE AND NO RESTRICTIONS
    if (command === '/ping' || command === '/arena') {
      let success = false;
      try {
        if (command === '/ping') {
          const pingRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: "🏓 *VIRAL Arena bot is online.*",
              parse_mode: "Markdown"
            })
          });
          success = pingRes.ok;
          if (!pingRes.ok) {
            console.error(`[Telegram Bot] Error sending /ping response:`, await pingRes.text());
          }
        } else if (command === '/arena') {
          const arenaText = `⚔️ *VIRAL ARENA*\n\nPlay, challenge community members and earn vVIRAL.`;
          const arenaRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: arenaText,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    getLaunchButton("⚔️ PLAY VIRAL ARENA", "arena", isPrivateChat)
                  ]
                ]
              }
            })
          });
          success = arenaRes.ok;
          if (!arenaRes.ok) {
            console.error(`[Telegram Bot] Error sending /arena response:`, await arenaRes.text());
          }
        }
      } catch (err) {
        console.error(`Error handling ${command}:`, err);
      }
      // 11. Minimal structured logging
      console.log(`TELEGRAM_COMMAND_HANDLED\ncommand: ${command}\nsuccess: ${success}`);
      return;
    }

    if (!user) return;

    const username = user.username || `user_${user.id}`;
    const tgId = String(user.id);
    const userLang = await detectUserLanguage(tgId, user.language_code);

    console.log(`[Telegram Message] Chat ID: ${chatId}, User ID: ${tgId}, Username: @${username}, Text: "${text}"`);

    // Implement absolute anti-spam (3 second command cooldown)
    const now = Date.now();
    const lastTime = userCooldowns.get(tgId) || 0;
    if (now - lastTime < 3000) {
      console.log(`[Telegram Bot] Cooldown ignored command from @${username}`);
      return;
    }
    userCooldowns.set(tgId, now);

    // Check group access restrictions (Requirement 10)
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const chatUsername = message.chat.username || "";

    // Load settings for communityChatId
    const settingsSnap = await db.collection('settings').doc('global_settings').get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() : null;
    const communityChatId = settingsData?.communityChatId || "";

    // Determine if official group
    let isOfficialGroup = false;
    if (chatUsername.toLowerCase() === 'viral_app_community') {
      isOfficialGroup = true;
    }
    if (communityChatId && String(chatId) === String(communityChatId)) {
      isOfficialGroup = true;
    }
    if (process.env.VIRAL_COMMUNITY_CHAT_ID && String(chatId) === String(process.env.VIRAL_COMMUNITY_CHAT_ID)) {
      isOfficialGroup = true;
    }

    // Auto-save numeric chat ID if it matches the group handle but not yet stored
    if (chatUsername.toLowerCase() === 'viral_app_community' && String(chatId) !== String(communityChatId)) {
      console.log(`[Telegram Bot] Auto-updating communityChatId to: ${chatId}`);
      if (settingsSnap.exists) {
        await db.collection('settings').doc('global_settings').update({
          communityChatId: String(chatId)
        }).catch(err => console.error("Error updating communityChatId settings:", err));
      } else {
        await db.collection('settings').doc('global_settings').set({
          communityChatId: String(chatId)
        }).catch(err => console.error("Error setting communityChatId settings:", err));
      }
    }

    const isAuthorizedChat = isPrivateChat || isOfficialGroup;

    const isAdminUser = ADMIN_TELEGRAM_IDS.includes(String(tgId)) || ADMIN_TELEGRAM_IDS.includes(username.toLowerCase());

    // Bypass the official-chat restriction for these diagnostic commands: /ping and /arena
    const isDiagnosticCommand = command === '/ping' || command === '/arena';

    if (!isAuthorizedChat) {
      if (!isDiagnosticCommand) {
        // Log unauthorized blocked command. Do not silently discard blocked commands.
        console.log(`[UNAUTHORIZED_CHAT_BLOCKED] chat_id: ${chatId}, chat_type: ${chatType}, chat_username: ${chatUsername || 'none'}, command: ${command}, user_id: ${tgId}`);

        // Controlled response for approved admins, standard block for others
        if (isAdminUser) {
          const diagText = `⚠️ *VIRAL Arena Bot (Admin Diagnostic):*\n\n` +
                           `This command was blocked because this group is not configured as the official community chat.\n\n` +
                           `• *This Chat ID:* \`${chatId}\`\n` +
                           `• *This Chat Type:* \`${chatType}\`\n` +
                           `• *This Chat Username:* \`@${chatUsername || 'none'}\`\n` +
                           `• *Configured Env Chat ID:* \`${process.env.VIRAL_COMMUNITY_CHAT_ID || 'none'}\`\n` +
                           `• *Configured DB Chat ID:* \`${communityChatId || 'none'}\`\n\n` +
                           `_To authorize this group, send a command in this group with handle @VIRAL_App_Community or configure it in settings._`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: diagText,
              parse_mode: "Markdown"
            })
          });
        } else {
          const blockedText = `⚠️ *VIRAL Arena Bot:* Active group commands can only be used inside the official community group *@VIRAL_App_Community*!`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: blockedText,
              parse_mode: "Markdown"
            })
          });
        }
        return;
      } else {
        // If it is a diagnostic command, allow bypass but log it
        console.log(`[DIAGNOSTIC_COMMAND_BYPASS] chat_id: ${chatId}, chat_type: ${chatType}, chat_username: ${chatUsername || 'none'}, command: ${command}, user_id: ${tgId}`);
      }
    }

    let replyText = "";

    const getPlayerRankLocal = (wins: number): string => {
      const RANKS_LIST = [
        { name: "Bronze Novice", minWins: 0 },
        { name: "Silver Gladiator", minWins: 5 },
        { name: "Gold Elite", minWins: 15 },
        { name: "Platinum Legend", minWins: 30 },
        { name: "RSPW Grand Master", minWins: 50 }
      ];
      let matchedRank = RANKS_LIST[0].name;
      for (const rank of RANKS_LIST) {
        if (wins >= rank.minWins) {
          matchedRank = rank.name;
        }
      }
      return matchedRank;
    };

    // 5. Add /ping diagnostic command
    if (command === '/ping') {
      replyText = `🏓 *VIRAL Arena bot is online.*`;
    } 
    // 6. Implement /start
    else if (command === '/start') {
      const args = text.split(' ').slice(1);
      const startParam = args.length > 0 ? args[0] : "";
      
      replyText = tBot(userLang, 'bot.welcome');

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                getLaunchButton(tBot(userLang, 'home.playNow').toUpperCase(), startParam || 'arena', isPrivateChat)
              ]
            ]
          }
        })
      });
      return;
    } 
    // 7. Implement /arena
    else if (command === '/arena') {
      replyText = `⚔️ *VIRAL ARENA*\n\n` +
                  `*${tBot(userLang, 'bot.welcome').split('\n\n')[1] || 'Play, challenge other community members and earn vVIRAL.'}*\n\n` +
                  `👊 *${tBot(userLang, 'play.rock')}* · 📄 *${tBot(userLang, 'play.paper')}* · ✂️ *${tBot(userLang, 'play.scissors')}* · 🕳 *${userLang === 'zh-CN' ? '井' : userLang === 'es' ? 'Pozo' : userLang === 'ru' ? 'Колодец' : userLang === 'de' ? 'Brunnen' : userLang === 'fr' ? 'Puits' : userLang === 'pt' ? 'Poço' : userLang === 'ja' ? '井' : userLang === 'hi' ? 'कुआँ' : userLang === 'tr' ? 'Kuyu' : userLang === 'id' ? 'Sumur' : userLang === 'ar' ? 'البئر' : 'Well'}*\n\n` +
                  `_${tBot(userLang, 'home.subtitle')}_`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                getLaunchButton(tBot(userLang, 'home.playNow').toUpperCase(), "arena", isPrivateChat)
              ]
            ]
          }
        })
      });
      return;
    } 
    else if (command === '/help') {
      replyText = tBot(userLang, 'bot.help');
    } 
    else if (command === '/myrank') {
      const uSnap = await db.collection('users').doc(tgId).get();
      if (uSnap.exists) {
        const ud = uSnap.data() || {};
        const balance = ud.vViral !== undefined ? ud.vViral : 500;
        const wins = ud.wins || 0;
        const losses = ud.losses || 0;
        const gamesPlayed = ud.gamesPlayed || (wins + losses);
        const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
        const rankName = getPlayerRankLocal(wins);

        replyText = tBot(userLang, 'bot.rankReply', { username, rank: rankName, wins, rate: winRate });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  getLaunchButton(tBot(userLang, 'profile.title').toUpperCase(), "profile", isPrivateChat)
                ]
              ]
            }
          })
        });
        return;
      } else {
        await sendProfileNotFound(chatId, isPrivateChat, userLang, username);
        return;
      }
    } 
    else if (command === '/balance') {
      const uSnap = await db.collection('users').doc(tgId).get();
      if (!uSnap.exists) {
        await sendProfileNotFound(chatId, isPrivateChat, userLang, username);
        return;
      }
      const balance = uSnap.data()?.vViral !== undefined ? uSnap.data()?.vViral : 500;
      replyText = tBot(userLang, 'bot.balanceReply', { username, vViral: balance.toLocaleString(), reserved: "0" });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                getLaunchButton(tBot(userLang, 'home.playNow'), "arena", isPrivateChat)
              ]
            ]
          }
        })
      });
      return;
    } 
    else if (command === '/top' || command === '/leaderboard') {
      try {
        const usersSnap = await db.collection('users').get();
        const list: any[] = [];
        usersSnap.forEach((d) => {
          const data = d.data() || {};
          if (data.username) {
            list.push({
              username: data.username,
              wins: data.wins || 0
            });
          }
        });

        list.sort((a, b) => b.wins - a.wins);
        const activeList = list.filter(p => p.wins > 0);

        const title = tBot(userLang, 'leaderboard.title').toUpperCase();
        if (activeList.length === 0) {
          replyText = `🏆 *${title}*\n\n${userLang === 'zh-CN' ? '竞技场赛季刚刚开始。' : userLang === 'es' ? 'La temporada de la Arena acaba de comenzar.' : userLang === 'ru' ? 'Сезон Арены только начинается.' : 'The Arena season is just beginning.'}`;
        } else {
          replyText = `🏆 *${title}*\n\n`;
          const top3 = activeList.slice(0, 3);
          top3.forEach((player, idx) => {
            const medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : "🥉");
            replyText += `${medal} *@${player.username}* — ${player.wins} ${tBot(userLang, 'leaderboard.wins').toLowerCase()}\n`;
          });
        }
      } catch (err) {
        const title = tBot(userLang, 'leaderboard.title').toUpperCase();
        replyText = `🏆 *${title}*\n\n${userLang === 'zh-CN' ? '竞技场赛季刚刚开始。' : userLang === 'es' ? 'La temporada de la Arena acaba de comenzar.' : userLang === 'ru' ? 'Сезон Арены только начинается.' : 'The Arena season is just beginning.'}`;
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                getLaunchButton(tBot(userLang, 'leaderboard.title').toUpperCase(), "leaderboard", isPrivateChat)
              ]
            ]
          }
        })
      });
      return;
    } 
    else if (command === '/missions') {
      replyText = tBot(userLang, 'bot.missionsTitle');
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                getLaunchButton(tBot(userLang, 'missions.title').toUpperCase() || "MISSIONS", "missions", isPrivateChat)
              ]
            ]
          }
        })
      });
      return;
    } 
    else if (command === '/duel') {
      let stake = DUEL_CONFIG.defaultStake; // Default 0
      const args = text.trim().split(/\s+/).slice(1);
      if (args.length > 0) {
        const parsed = parseInt(args[0], 10);
        if (isNaN(parsed)) {
          const replyText = `⚠️ *Invalid duel stake.*\n\nAvailable stakes: 0, 50, 100, 250, 500, 1000 vVIRAL.`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "Markdown"
            })
          });
          return;
        }
        stake = parsed;
      }

      // Check allowed stakes (Requirement 3)
      if (!DUEL_CONFIG.allowedStakes.includes(stake)) {
        const replyText = `⚠️ *${userLang === 'zh-CN' ? '无效的对决金额。' : userLang === 'es' ? 'Apuesta de duelo no válida.' : userLang === 'ru' ? 'Неверная ставка дуэли.' : 'Invalid duel stake.'}*\n\n${userLang === 'zh-CN' ? '可用金额' : userLang === 'es' ? 'Apuestas disponibles' : userLang === 'ru' ? 'Доступные ставки' : 'Available stakes'}: 0, 50, 100, 250, 500, 1000 vVIRAL.`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }

      // Cooldown (Requirement 13)
      const now = Date.now();
      const lastDuel = userDuelCooldowns.get(tgId) || 0;
      if (now - lastDuel < 30000) {
        const remaining = Math.ceil((30000 - (now - lastDuel)) / 1000);
        replyText = tBot(userLang, 'bot.cooldown', { seconds: remaining, username });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }

      // Check profile exists (Requirement 2)
      const uSnap = await db.collection('users').doc(tgId).get();
      if (!uSnap.exists) {
        await sendProfileNotFound(chatId, isPrivateChat, userLang, username);
        return;
      }

      const uData = uSnap.data() || {};
      if (uData.blocked || uData.isBlocked) {
        const replyText = `⚠️ *Account Blocked*\n\nYour account is currently blocked from participating in duels.`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }

      // Check active pending or in-progress challenges (Requirement 13)
      const creatorActive = await db.collection('challenges')
        .where('creatorTelegramId', '==', tgId)
        .where('status', 'in', ['pending', 'accepted', 'in_progress'])
        .get();

      const opponentActive = await db.collection('challenges')
        .where('opponentTelegramId', '==', tgId)
        .where('status', 'in', ['accepted', 'in_progress'])
        .get();

      if (creatorActive.docs.length > 0 || opponentActive.docs.length > 0) {
        const replyText = tBot(userLang, 'bot.activeDuelError', { username });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }

      // Check balance (Requirement 2)
      if (stake > 0) {
        const balance = uData.vViral !== undefined ? uData.vViral : 0;
        if (balance < stake) {
          const replyText = tBot(userLang, 'bot.insufficientBalance', { username, stake });
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "Markdown"
            })
          });
          return;
        }
      }

      // Check maximum pending challenges per chat (Requirement 13)
      if (!isPrivateChat) {
        const chatPending = await db.collection('challenges')
          .where('chatId', '==', String(chatId))
          .where('status', '==', 'pending')
          .get();
        if (chatPending.docs.length >= DUEL_CONFIG.maxPendingChallengesPerChat) {
          const replyText = `⚠️ *Arena Full*\n\nThere are already ${DUEL_CONFIG.maxPendingChallengesPerChat} pending challenges in this community. Settle or let them expire first!`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "Markdown"
            })
          });
          return;
        }
      }

      // Generate Challenge
      const challengeId = db.collection('challenges').doc().id;

      // Reserve creator's stake atomically (Requirement 7)
      if (stake > 0) {
        try {
          await reserveUserStake(
            tgId,
            stake,
            challengeId,
            `create_reserve_creator_${tgId}_${challengeId}`
          );
        } catch (err) {
          const replyText = `⚠️ *Reservation Failure*\n\nCould not lock stake funds. Please try again.`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "Markdown"
            })
          });
          return;
        }
      }

      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + DUEL_CONFIG.expirationMinutes * 60 * 1000).toISOString();

      const newChallenge = {
        challengeId,
        chatId: String(chatId),
        messageId: "",
        creatorTelegramId: tgId,
        creatorUsername: username,
        opponentTelegramId: "",
        opponentUsername: "",
        stake,
        status: 'pending',
        createdAt,
        expiresAt,
        acceptedAt: "",
        completedAt: "",
        matchId: "",
        idempotencyKey: `create_${tgId}_${challengeId}`
      };

      await db.collection('challenges').doc(challengeId).set(newChallenge);

      // Lock cooldown on successful challenge initiation
      userDuelCooldowns.set(tgId, now);

      const displayStake = stake > 0 ? `${stake} vVIRAL` : (userLang === 'zh-CN' ? '免费对决' : userLang === 'es' ? 'Duelo gratis' : userLang === 'ru' ? 'Бесплатная дуэль' : 'Free Duel');
      const duelMsg = tBot(userLang, 'bot.challengeCreated', { username, stake: displayStake });

      const responseTg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: duelMsg,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { "text": `🔥 ${userLang === 'zh-CN' ? '接受对决' : userLang === 'es' ? 'ACEPTAR DUELO' : userLang === 'ru' ? 'ПРИНЯТЬ ДУЭЛЬ' : 'ACCEPT DUEL'}`, "callback_data": `accept_duel:${challengeId}` },
                { "text": `❌ ${userLang === 'zh-CN' ? '取消' : userLang === 'es' ? 'CANCELAR' : userLang === 'ru' ? 'ОТМЕНА' : 'CANCEL'}`, "callback_data": `cancel_duel:${challengeId}` }
              ]
            ]
          }
        })
      });

      if (responseTg.ok) {
        const sentData = await responseTg.json();
        const msgId = sentData.result?.message_id;
        if (msgId) {
          await db.collection('challenges').doc(challengeId).update({
            messageId: String(msgId)
          });
        }
      }
      return;
    } 
    else if (command === '/challenge') {
      // 12. Implement 10s Cooldown
      const now = Date.now();
      const lastChallenge = userChallengeCooldowns.get(tgId) || 0;
      if (now - lastChallenge < 10000) {
        const remaining = Math.ceil((10000 - (now - lastChallenge)) / 1000);
        replyText = tBot(userLang, 'bot.cooldown', { seconds: remaining, username });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }
      userChallengeCooldowns.set(tgId, now);

      // Check maximum active challenges: 1 per user
      const activeSnap = await db.collection('games')
        .where('player1Id', '==', tgId)
        .where('status', '==', 'waiting')
        .get();

      if (activeSnap.docs.length > 0) {
        replyText = tBot(userLang, 'bot.activeDuelError', { username });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown"
          })
        });
        return;
      }

      // Check user profile exists
      const uSnap = await db.collection('users').doc(tgId).get();
      if (!uSnap.exists) {
        await sendProfileNotFound(chatId, isPrivateChat, userLang, username);
        return;
      }

      // Generate challenge ID
      const gameId = db.collection('games').doc().id;
      const newGame = {
        id: gameId,
        player1Id: tgId,
        player1Username: username,
        player2Id: "waiting",
        player2Username: "waiting",
        status: "waiting",
        mode: "free",
        stake: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tgChatId: String(chatId),
        tgMessageId: ""
      };

      await db.collection('games').doc(gameId).set(newGame);

      replyText = `⚔️ *VIRAL PRIVATE CHALLENGE*\n\n` +
                  `Your battle invitation is ready.\n\n` +
                  `Send it to a friend.`;

      const responseTg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { "text": `📨 ${userLang === 'zh-CN' ? '分享对决' : userLang === 'es' ? 'COMPARTIR DUELO' : userLang === 'ru' ? 'ПОДЕЛИТЬСЯ ДУЭЛЬЮ' : 'SHARE CHALLENGE'}`, "url": `https://t.me/CyberDuellitebot?startapp=duel_${gameId}` }
              ]
            ]
          }
        })
      });

      if (responseTg.ok) {
        const sentData = await responseTg.json();
        const msgId = sentData.result?.message_id;
        if (msgId) {
          await db.collection('games').doc(gameId).update({
            tgMessageId: String(msgId)
          });
        }
      }
      return;
    } 
    else {
      replyText = `❓ *Unknown Command!*\n\nUse /help to see available options.`;
    }

    // Send telegram reply if set
    if (replyText) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown"
        })
      });
    }
  }
}

// Public API endpoint for Telegram Webhook integration (Requirement 3)
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    if (update) {
      await handleTelegramUpdate(update).catch(err => {
        console.error("[Telegram Webhook] Error processing update:", err);
      });
    }
  } catch (err) {
    console.error("[Telegram Webhook] Handler error:", err);
  }
  // Return HTTP 200 immediately to prevent retries (Requirement 3)
  res.status(200).json({ ok: true });
});

// GET telegram health check endpoint
app.get('/api/telegram-health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: "VIRAL Arena Telegram Bot"
  });
});

// GET telegram diagnostic endpoint
app.get('/api/telegram-diag', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "No TELEGRAM_BOT_TOKEN in environment" });
  }
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    
    const hookInfoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const hookInfoData = await hookInfoRes.json();

    res.status(200).json({
      ok: true,
      env_app_url: process.env.APP_URL || "not_set",
      getMe: meData,
      getWebhookInfo: hookInfoData
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Configure and start background Telegram Bot worker (Webhook primary with fallback Polling)
async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("No TELEGRAM_BOT_TOKEN found in environment. Telegram Bot is inactive.");
    return;
  }
  console.log("Telegram Bot Token is present! Initializing Telegram Bot...");

  // 1. Verify token using getMe (Requirement 5)
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (meData.ok) {
      const username = meData.result.username;
      console.log(`[Telegram Bot getMe] SUCCESS! Username: @${username}`);
      if (username !== "CyberDuellitebot") {
        console.error(`[Telegram Bot Setup ERROR] Verification failed: Username returned by getMe is @${username}, but expected exactly CyberDuellitebot. Aborting bot initialization.`);
        return;
      }
    } else {
      console.error(`[Telegram Bot Setup ERROR] FAILED to verify token via getMe. Aborting bot initialization. Response:`, JSON.stringify(meData));
      return;
    }
  } catch (err) {
    console.error(`[Telegram Bot Setup ERROR] Exception verifying token via getMe. Aborting bot initialization:`, err);
    return;
  }

  // 2. Configure Bot Menu & Commands on startup (Requirement 6)
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: "duel", description: "Challenge a player" },
          { command: "challenge", description: "Create a private duel invite" },
          { command: "top", description: "VIRAL Arena leaderboard" },
          { command: "myrank", description: "View your rank" },
          { command: "balance", description: "View vVIRAL balance" },
          { command: "missions", description: "Daily VIRAL missions" },
          { command: "help", description: "VIRAL Arena help" },
          { command: "ping", description: "Check bot status" },
          { command: "arena", description: "Open VIRAL Arena" }
        ]
      })
    });

    await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "⚔️ PLAY ARENA",
          web_app: {
            url: "https://rock-scissors-paper-well-52536426129.us-west1.run.app?startapp=arena"
          }
        }
      })
    });
    console.log("Bot Menu and Menu Button successfully initialized!");
  } catch (err) {
    console.error("Failed to initialize bot commands/menu button:", err);
  }

  // 3. Setup active challenge expiration background monitor (polls every 30 seconds)
  setInterval(async () => {
    try {
      // (a) Handle legacy game challenges (backward compatibility)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const expiredGames = await db.collection('games')
        .where('status', '==', 'waiting')
        .get();

      for (const doc of expiredGames.docs) {
        const gd = doc.data() || {};
        const isExpired = gd.createdAt && gd.createdAt < tenMinutesAgo;
        if (isExpired) {
          if (gd.mode === 'stake' && gd.stake > 0) {
            await adjustUserVViral(
              gd.player1Id,
              gd.stake,
              'credit',
              'stake_duel_refund',
              doc.id,
              `refund_expire_${doc.id}_${gd.player1Id}`
            );
          }
          await db.collection('games').doc(doc.id).update({
            status: 'expired',
            updatedAt: new Date().toISOString()
          });

          if (gd.tgChatId && gd.tgMessageId) {
            await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: gd.tgChatId,
                message_id: Number(gd.tgMessageId),
                text: `❌ *DUEL CHALLENGE EXPIRED*\n\nThe challenge hosted by @${gd.player1Username || 'user'} has expired. Any stakes have been refunded.`,
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [] }
              })
            }).catch(e => console.error("Error editing expired Telegram message:", e));
          }
        }
      }

      // (b) Handle new custom challenges expiration (Requirement 11)
      const expiredChallenges = await db.collection('challenges')
        .where('status', '==', 'pending')
        .get();

      for (const chDoc of expiredChallenges.docs) {
        const chalData = chDoc.data() || {};
        const isExpired = chalData.expiresAt && new Date(chalData.expiresAt).getTime() < Date.now();
        if (isExpired) {
          try {
            const { runTransaction } = await import('firebase/firestore');
            const chalRefReal = doc(firestoreInstance, 'challenges', chDoc.id);
            await runTransaction(firestoreInstance, async (transaction) => {
              const freshSnap = await transaction.get(chalRefReal);
              if (!freshSnap.exists()) throw new Error("not_found");
              const freshData = freshSnap.data() || {};
              if (freshData.status !== 'pending') throw new Error("already_handled");

              transaction.update(chalRefReal, {
                status: 'expired',
                completedAt: new Date().toISOString()
              });
            });

            // Release creator's stake if any
            if (chalData.stake > 0) {
              await releaseUserStake(
                chalData.creatorTelegramId,
                chalData.stake,
                chDoc.id,
                `expire_refund_creator_${chalData.creatorTelegramId}_${chDoc.id}`
              );
            }

            // Edit Telegram group message
            if (chalData.chatId && chalData.messageId) {
              await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chalData.chatId,
                  message_id: Number(chalData.messageId),
                  text: `❌ *DUEL CHALLENGE EXPIRED*\n\nThe challenge hosted by @${chalData.creatorUsername || 'user'} has expired. Any stakes have been refunded.`,
                  parse_mode: "Markdown",
                  reply_markup: { inline_keyboard: [] }
                })
              }).catch(e => console.error("Error editing expired Telegram message:", e));
            }
          } catch (txErr: any) {
            console.error(`Error processing expired challenge ${chDoc.id}:`, txErr);
          }
        }
      }
    } catch (err) {
      console.error("Background challenge expiration checker error:", err);
    }
  }, 30000);

  // 4. Configure webhook or fallback polling (Requirement 3 & 9)
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    const webhookUrl = `${appUrl}/api/telegram-webhook`;
    console.log(`[Telegram Bot Setup] Configuring Webhook URL: ${webhookUrl}`);
    try {
      // Diagnostic check before setting
      const initialInfoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const initialInfoData = await initialInfoRes.json();
      if (initialInfoData.ok) {
        console.log(`[Telegram Bot Setup] Webhook Info BEFORE setWebhook:`, JSON.stringify(initialInfoData.result));
      }

      const setHookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query", "my_chat_member"]
        })
      });
      const setHookData = await setHookRes.json();
      console.log(`[Telegram Bot Setup] setWebhook result:`, JSON.stringify(setHookData));

      // Fetch and verify current webhook info (Requirement 3)
      const hookInfoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const hookInfoData = await hookInfoRes.json();
      if (hookInfoData.ok) {
        const info = hookInfoData.result;
        console.log(`[Telegram Bot Webhook Info]`);
        console.log(`  webhook_url: ${info.url}`);
        console.log(`  pending_update_count: ${info.pending_update_count}`);
        console.log(`  last_error_message: ${info.last_error_message || 'none'}`);
        console.log(`  last_error_date: ${info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : 'none'}`);
        console.log(`  allowed_updates: ${JSON.stringify(info.allowed_updates || [])}`);
      } else {
        console.error(`[Telegram Bot Setup] Failed to fetch webhook info:`, JSON.stringify(hookInfoData));
      }
    } catch (err) {
      console.error(`[Telegram Bot Setup] Error registering webhook:`, err);
    }
  } else {
    console.log(`[Telegram Bot Setup] APP_URL not found in environment. Deleting webhook and falling back to Long Polling...`);
    try {
      const delHookRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
      const delHookData = await delHookRes.json();
      console.log(`[Telegram Bot Setup] deleteWebhook result:`, JSON.stringify(delHookData));
    } catch (err) {
      console.error(`[Telegram Bot Setup] Error deleting webhook:`, err);
    }

    // Start long polling fallback loop (Requirement 3)
    let offset = 0;
    (async () => {
      console.log(`[Telegram Bot Setup] Fallback Long Polling worker has started.`);
      while (true) {
        try {
          const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=15`);
          if (!response.ok) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          }

          const data = await response.json();
          if (data && data.ok && data.result && data.result.length > 0) {
            for (const update of data.result) {
              offset = update.update_id + 1;
              await handleTelegramUpdate(update).catch(err => {
                console.error(`[Telegram Bot Poller] Error processing update ${update.update_id}:`, err);
              });
            }
          }
        } catch (err) {
          console.error("Telegram long-poll error:", err);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    })();
  }
}

// Configure Vite integration inside main async bootstrapper
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Launch background Telegram Bot poller if token configured
  startTelegramBot();

  // Binds to 0.0.0.0:3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server launched on http://0.0.0.0:${PORT}`);
  });
}

startServer();
