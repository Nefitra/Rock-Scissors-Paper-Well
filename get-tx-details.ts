const host = "toncenter.com";
const treasury = "UQDvEOIDuulW4RuzJsF6LAUixTPorfnU_EaT_mk9JL5K7Uzd";
const urlV2 = `https://${host}/api/v2/getTransactions?address=${treasury}&limit=50`;

async function run() {
  const res = await fetch(urlV2, { headers: { 'Accept': 'application/json' } });
  const data = await res.json();
  if (data.ok && data.result) {
    for (const tx of data.result) {
      const comment = tx.in_msg?.message || tx.in_msg?.decoded_body?.text || tx.in_msg?.msg_data?.text || "";
      if (comment.trim().toUpperCase() === "VIRAL_ARENA_DEP_53DB90") {
        console.log("MATCHED TRANSACTION DETAILS:");
        console.log(JSON.stringify(tx, null, 2));
      }
    }
  }
}

run();
