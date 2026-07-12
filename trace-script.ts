import { initializeApp as initializeClientApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, memoryLocalCache } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function run() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error("Missing firebase-applet-config.json");
    return;
  }
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log("Config:", firebaseConfig);

  const clientApp = initializeClientApp(firebaseConfig);
  const clientDb = initializeFirestore(clientApp, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    localCache: memoryLocalCache()
  } as any, firebaseConfig.firestoreDatabaseId);

  // 1. Fetch deposit from Firestore
  const depId = "VIRAL_ARENA_DEP_53DB90";
  const docRef = doc(clientDb, 'tonDeposits', depId);
  console.log(`\n=== Fetching Firestore Doc: tonDeposits/${depId} ===`);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log("Deposit Doc Data:", snap.data());
    const tgUserId = snap.data().telegramUserId;
    if (tgUserId) {
      console.log(`\n=== Fetching User Doc: users/${tgUserId} ===`);
      const userSnap = await getDoc(doc(clientDb, 'users', String(tgUserId)));
      if (userSnap.exists()) {
        console.log("User Doc Data:", userSnap.data());
      } else {
        console.log("User Doc NOT FOUND");
      }
    }
  } else {
    console.log("Deposit Doc NOT FOUND in Firestore");
  }

  // 2. Query Ledger Transactions
  const ledgerId = `TON_DEPOSIT_CREDIT:${depId}`;
  console.log(`\n=== Fetching Ledger Transaction: ledgerTransactions/${ledgerId} ===`);
  const ledgerSnap = await getDoc(doc(clientDb, 'ledgerTransactions', ledgerId));
  if (ledgerSnap.exists()) {
    console.log("Ledger Doc Data:", ledgerSnap.data());
  } else {
    console.log("Ledger Doc NOT FOUND in Firestore");
  }

  // 3. Fetch live transactions from Toncenter
  console.log("\n=== Fetching Live On-Chain Transactions ===");
  const treasury = "UQDvEOIDuulW4RuzJsF6LAUixTPorfnU_EaT_mk9JL5K7Uzd";
  const apiKey = process.env.TONCENTER_API_KEY || "";
  const host = "toncenter.com";
  const url = `https://${host}/api/v3/transactions?account=${treasury}&limit=50`;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log(`Fetched ${data.transactions?.length || 0} transactions from Toncenter.`);
    const transactions = data.transactions || [];
    let matchedTx: any = null;
    for (const tx of transactions) {
      if (!tx.in_msg) continue;
      // Decode comment
      let comment = "";
      const msg = tx.in_msg;
      if (msg.message) {
        try {
          comment = Buffer.from(msg.message, 'base64').toString('utf-8');
        } catch {
          comment = msg.message;
        }
      } else if (msg.decoded_body && msg.decoded_body.text) {
        comment = msg.decoded_body.text;
      }

      console.log(`Tx Hash: ${tx.hash}, Comment: "${comment}", Source: ${msg.source}, Dest: ${msg.destination}, Value: ${msg.value}`);

      if (comment.trim().toUpperCase() === depId) {
        matchedTx = tx;
        console.log("\n>>> MATCHED ON-CHAIN TRANSACTION! <<<");
        console.log(JSON.stringify(tx, null, 2));
        console.log(`Decoded comment: ${comment}`);
      }
    }
  } catch (err: any) {
    console.error("Error fetching transactions:", err);
  }
}

run();
