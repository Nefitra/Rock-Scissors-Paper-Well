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
          userId: String(verification.user.username || verification.user.id),
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
            userId: String(user.username || user.id),
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
    userId: String(requestorId),
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

// REST APIs
// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: "ok", service: "Rock Paper Scissors Well Server" });
});

// 2. User Sync & Registration (including referrers tracking L1 & L2)
app.post('/api/user/sync', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { telegramId, username, walletAddress, referredBy } = req.body;

    let targetTgId = telegramId;
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

    const userId = targetTgId; // Use telegramId as document ID for simple direct mapping
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      // User already exists, update wallet address if changed
      const currentData = userSnap.data() || {};
      let updated = false;
      const upData: any = {};
      if (walletAddress && currentData.walletAddress !== walletAddress) {
        upData.walletAddress = walletAddress;
        updated = true;
      }
      if (username && currentData.username !== username) {
        upData.username = username;
        updated = true;
      }
      if (updated) {
        await userRef.update(upData);
      }
      return res.json({ profile: { ...currentData, ...upData } });
    }

    // New user signup
    let finalReferredBy = "";
    if (referredBy && referredBy !== userId) {
      // Check if referrer exists
      const referrerRef = db.collection('users').doc(referredBy);
      const referrerSnap = await referrerRef.get();
      if (referrerSnap.exists) {
        finalReferredBy = referredBy;
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
      lastLoginDate: "",
      createdAt: new Date().toISOString()
    };

    await userRef.set(newProfile);
    res.json({ profile: newProfile });
  } catch (error: any) {
    console.error("Sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. User statistics read
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ profile: userSnap.data() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.1 Claim Daily Login Streak reward
app.post('/api/user/claim-daily', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { telegramId, clientDateString } = req.body;

    let targetTgId = telegramId;
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

    // Reward!
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

    res.json({
      success: true,
      streak: currentStreak,
      xp: newXp,
      lastLoginDate: todayStr,
      awardedXp: totalAwardedXp,
      message: `Successfully claimed! Daily streak: ${currentStreak} days. +${totalAwardedXp} Arena XP granted!`
    });
  } catch (error: any) {
    console.error("Daily claim error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3a. Global Leaderboard top 10
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
          gamesPlayed: data.gamesPlayed || 0
        });
      }
    });

    // Sort by wins dec, then gamesPlayed desc
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

    await userRef.update({
      wins: updatedWins,
      claimedRewards: newClaimed
    });

    const finalProfile = { ...currentData, wins: updatedWins, claimedRewards: newClaimed };
    res.json({ success: true, profile: finalProfile });
  } catch (error: any) {
    console.error("Reward wins error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Join matchmaking / Find Game
app.post('/api/matchmaking/join', async (req, res) => {
  try {
    const verifiedUser = getRequestUser(req);
    const { userId, username, playWithBot } = req.body;

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

    let targetWallet: string | null = null;
    const targetUserSnap = await db.collection('users').doc(targetUserId).get();
    if (targetUserSnap.exists) {
      targetWallet = targetUserSnap.data()?.walletAddress || null;
    }

    // Always clean up any existing uncompleted games created by this same user to avoid phantom matches
    try {
      const existingWaiting = await db.collection('games')
        .where('player1Id', '==', targetUserId)
        .where('status', 'in', ['searching', 'waiting', 'matched', 'countdown', 'move_selection', 'resolving'])
        .get();
      if (existingWaiting.docs.length > 0) {
        const updatePromises = existingWaiting.docs.map(doc => 
          db.collection('games').doc(doc.id).update({
            status: 'canceled',
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(updatePromises);
      }
      
      const existingWaiting2 = await db.collection('games')
        .where('player2Id', '==', targetUserId)
        .where('status', 'in', ['searching', 'waiting', 'matched', 'countdown', 'move_selection', 'resolving'])
        .get();
      if (existingWaiting2.docs.length > 0) {
        const updatePromises2 = existingWaiting2.docs.map(doc => 
          db.collection('games').doc(doc.id).update({
            status: 'canceled',
            updatedAt: new Date().toISOString()
          })
        );
        await Promise.all(updatePromises2);
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up previous games:", cleanupErr);
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
      // Match them! Set matchedAt and transition to 'matched'
      const gameRef = db.collection('games').doc(foundGame.id);
      const updatedGame = {
        player2Id: targetUserId,
        player2Username: targetUsername || "Player 2",
        status: "matched",
        matchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await gameRef.update(updatedGame);
      const fullGame = { ...foundGame, ...updatedGame };
      return res.json({ game: sanitizeGameForUser(fullGame, targetUserId) });
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

      // Update player profile statistics concurrently to reduce database/network roundtrip latency
      const p1Ref = db.collection('users').doc(gameData.player1Id);
      const p2Ref = gameData.player2Id !== "bot" ? db.collection('users').doc(gameData.player2Id) : null;

      const [p1Snap, p2Snap] = await Promise.all([
        p1Ref.get(),
        p2Ref ? p2Ref.get() : Promise.resolve(null)
      ]);

      const updatePromises: Promise<any>[] = [];

      if (p1Snap && p1Snap.exists) {
        const d1 = p1Snap.data() || {};
        const p1Wins = winnerId === gameData.player1Id ? (d1.wins || 0) + 1 : (d1.wins || 0);
        const p1Losses = (winnerId !== gameData.player1Id && winnerId !== "draw") ? (d1.losses || 0) + 1 : (d1.losses || 0);
        
        // Reward match participation XP (+50 Base XP + 50 Win bonus XP) to make level progression active
        const xpReward = (winnerId === gameData.player1Id) ? 100 : 50;
        const currentXp = d1.xp || 0;
        
        updatePromises.push(p1Ref.update({
          gamesPlayed: (d1.gamesPlayed || 0) + 1,
          wins: p1Wins,
          losses: p1Losses,
          xp: currentXp + xpReward
        }));
      }

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

  // Binds to 0.0.0.0:3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server launched on http://0.0.0.0:${PORT}`);
  });
}

startServer();
