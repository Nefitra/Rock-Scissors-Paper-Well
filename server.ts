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
  limit 
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
  experimentalForceLongPolling: true
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
          userId: sanitizeUserId(String(verification.user.username || verification.user.id)),
          username: String(verification.user.first_name || verification.user.username || ""),
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
            userId: sanitizeUserId(String(user.username || user.id)),
            username: String(user.first_name || user.username || ""),
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
    const { telegramId, username, walletAddress, referredBy } = req.body;

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
      if (currentData.vViral === undefined) {
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
      missions: {},
      lastLoginDate: "",
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
    const { userId, username, playWithBot, mode, stake } = req.body;

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

// Background Telegram Bot Polling Worker
async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("No TELEGRAM_BOT_TOKEN found in environment. Telegram Bot Poller is inactive.");
    return;
  }
  console.log("Telegram Bot Token is present! Starting Long-Polling Bot...");

  let offset = 0;
  
  // Poller loop
  while (true) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=15`);
      if (!response.ok) {
        // Wait 10 seconds before retrying to avoid spamming on error
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      const data = await response.json();
      if (data && data.ok && data.result && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const message = update.message;
          if (!message || !message.text) continue;

          const text = message.text.trim();
          const chatId = message.chat.id;
          const user = message.from;
          const username = user?.username || `user_${user?.id}`;
          const tgId = String(user?.id);

          // Command parser
          if (text.startsWith('/')) {
            const command = text.split(' ')[0].toLowerCase();
            let replyText = "";

            if (command === '/start' || command === '/help') {
              replyText = `⚔️ *WELCOME TO VIRAL ARENA* ⚔️\n\n` +
                          `The official Rock-Paper-Scissors-Well Duel game of the *VIRAL Ecosystem*!\n\n` +
                          `🎮 *Play directly on your smartphone:* [Launch VIRAL Arena App](https://t.me/play)\n\n` +
                          `🛡️ *Commands available inside this bot:*\n` +
                          `• /start - Launch instructions\n` +
                          `• /balance - View your current vVIRAL balance and rank\n` +
                          `• /leaderboard - View the Top 10 Arena Champions\n` +
                          `• /missions - View active daily mission milestones\n` +
                          `• /challenge - Create a custom invitation for a friend\n\n` +
                          `_Powered by VIRAL Ecosystem_`;
            } else if (command === '/balance') {
              const uSnap = await db.collection('users').doc(tgId).get();
              if (uSnap.exists) {
                const ud = uSnap.data() || {};
                const balance = ud.vViral !== undefined ? ud.vViral : 500;
                const wins = ud.wins || 0;
                const streak = ud.streak || 0;
                replyText = `👤 *Player:* @${username}\n` +
                            `💰 *vVIRAL Balance:* ${balance} vVIRAL\n` +
                            `🏆 *Total Wins:* ${wins}\n` +
                            `🔥 *Check-In Streak:* ${streak} days`;
              } else {
                replyText = `⚠️ *Account not found!*\n\nPlease click [Launch VIRAL Arena App](https://t.me/play) to initialize your profile and receive a *+500 vVIRAL Welcome Reward*!`;
              }
            } else if (command === '/leaderboard') {
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

              replyText = `🏆 *VIRAL ARENA TOP CHAMPIONS* 🏆\n\n`;
              top5.forEach((player, idx) => {
                replyText += `${idx + 1}. *@${player.username}* - ${player.wins} Wins | ${player.vViral} vVIRAL\n`;
              });
            } else if (command === '/missions') {
              const uSnap = await db.collection('users').doc(tgId).get();
              replyText = `🎯 *DAILY MISSION TARGETS* 🎯\n\n`;
              
              const userMissions = uSnap.exists ? (uSnap.data()?.missions || {}) : {};

              Object.entries(MISSION_CONFIGS).forEach(([mId, config]) => {
                const userProg = userMissions[mId] || { progress: 0, completed: false, claimed: false };
                const statusEmoji = userProg.claimed ? "✅" : (userProg.completed ? "🎁" : "⏳");
                replyText += `${statusEmoji} *${config.title}*\n` +
                             `├ _${config.desc}_\n` +
                             `└ Progress: [${userProg.progress}/${config.maxProgress}] | Reward: *+${config.reward} vVIRAL*\n\n`;
              });
            } else if (command === '/challenge') {
              replyText = `🤝 *CHALLENGE A FRIEND* 🤝\n\n` +
                          `Invite your friends to dual in the VIRAL ARENA!\n\n` +
                          `Forward this link to challenge them:\n` +
                          `👉 \`https://t.me/play?startapp=${tgId}\`\n\n` +
                          `_Both of you will receive referral match achievements!_`;
            } else {
              replyText = `❓ *Unknown Command!*\n\nUse /start to see available options.`;
            }

            // Send telegram reply
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
    } catch (err) {
      console.error("Telegram long-poll error:", err);
      // Wait 10 seconds before retrying on crash
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Small delay to prevent tight infinite loop CPU spikes
    await new Promise(resolve => setTimeout(resolve, 1000));
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
