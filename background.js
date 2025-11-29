// background.js
console.log("Aish's AI Agent background worker started");

importScripts("utils/embeddings.js","utils/similarity.js","utils/keyword.js","agent.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.query) {
    sendResponse({ error: "missing query" });
    return;
  }
  (async ()=>{
    try {
      const out = await runAgent(message.query);
      sendResponse(out);
    } catch(err){
      console.error("Agent error:", err);
      sendResponse({ error: String(err) });
    }
  })();
  return true;
});
