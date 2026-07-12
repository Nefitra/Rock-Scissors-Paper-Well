import fs from 'fs';
import path from 'path';

async function run() {
  const treasury = "UQDvEOIDuulW4RuzJsF6LAUixTPorfnU_EaT_mk9JL5K7Uzd";
  const apiKey = process.env.TONCENTER_API_KEY || "";
  console.log("TONCENTER_API_KEY present:", !!apiKey);
  console.log("Treasury address:", treasury);

  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };
  // We will NOT send the X-API-Key header to test anonymous access
  // if (apiKey) {
  //   headers['X-API-Key'] = apiKey;
  // }

  // Test API v3
  const host = "toncenter.com";
  const urlV3 = `https://${host}/api/v3/transactions?account=${treasury}&limit=50`;
  console.log(`\n--- Fetching V3: ${urlV3} ---`);
  try {
    const res = await fetch(urlV3, { headers });
    console.log("V3 Status:", res.status);
    const data = await res.json();
    console.log("V3 response keys:", Object.keys(data));
    if (data.transactions) {
      console.log(`V3 transactions count: ${data.transactions.length}`);
      for (const tx of data.transactions) {
        let comment = "";
        if (tx.in_msg) {
          if (tx.in_msg.message) {
            try {
              comment = Buffer.from(tx.in_msg.message, 'base64').toString('utf-8');
            } catch {
              comment = tx.in_msg.message;
            }
          } else if (tx.in_msg.decoded_body && tx.in_msg.decoded_body.text) {
            comment = tx.in_msg.decoded_body.text;
          }
          console.log(`[V3] Hash: ${tx.hash}, Comment: "${comment}", Source: ${tx.in_msg.source}, Value: ${tx.in_msg.value}`);
        }
      }
    } else {
      console.log("No transactions in V3 response:", JSON.stringify(data).substring(0, 500));
    }
  } catch (err: any) {
    console.error("V3 Error:", err);
  }

  // Test API v2
  const urlV2 = `https://${host}/api/v2/getTransactions?address=${treasury}&limit=50`;
  console.log(`\n--- Fetching V2: ${urlV2} ---`);
  try {
    const res = await fetch(urlV2, { headers });
    console.log("V2 Status:", res.status);
    const data = await res.json();
    console.log("V2 response keys:", Object.keys(data));
    if (data.ok && data.result) {
      console.log(`V2 transactions count: ${data.result.length}`);
      for (const tx of data.result) {
        let comment = "";
        const msg = tx.in_msg;
        if (msg) {
          if (msg.message) {
            comment = msg.message;
          } else if (msg.decoded_body && msg.decoded_body.text) {
            comment = msg.decoded_body.text;
          } else if (msg.msg_data && msg.msg_data.text) {
            comment = msg.msg_data.text;
          }
          console.log(`[V2] Hash: ${tx.transaction_id?.hash}, Comment: "${comment}", Source: ${msg.source}, Value: ${msg.value}`);
        }
      }
    } else {
      console.log("V2 Response is not OK or has no result:", JSON.stringify(data).substring(0, 500));
    }
  } catch (err: any) {
    console.error("V2 Error:", err);
  }
}

run();
