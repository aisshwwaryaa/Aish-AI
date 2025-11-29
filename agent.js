(function(global){
  let DOCS = null;
  let VOCAB = null, DF = null, N_DOCS = 0;

  async function loadDocs(){
    if (DOCS) return DOCS;
    const res = await fetch(chrome.runtime.getURL("data/docs.json"));
    DOCS = await res.json();
    const docsTexts = DOCS.map(d => d.answer || d.question || d);
    const built = EmbeddingsUtil.buildVocab(docsTexts);
    VOCAB = built.vocab; DF = built.df; N_DOCS = docsTexts.length;
    global.__DOC_TEXTS = docsTexts;
    return DOCS;
  }

  function isDefinition(query){
    return /^\s*(what is|define|who is)/i.test(query);
  }
  function isHowTo(query){
    return /^\s*(how to|how do i|how can i|steps to)/i.test(query);
  }
  function mentionsTime(query){
    return /\b(today|tomorrow|tonight|yesterday|next|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|at)\b/i.test(query);
  }
  function isMath(query){
    return /(^\s*\d+\s*[\+\-\*\/]\s*\d+)|(\b(sum|add|subtract|multiply|divide)\b)/i.test(query);
  }
  function isTask(query){
    return /\b(plan|schedule|todo|tasks|steps|checklist)\b/i.test(query);
  }
  function runSemanticSearch(query, topK=3){
    const qvec = EmbeddingsUtil.vectorize(query, VOCAB, DF, N_DOCS);
    const scores = global.__DOC_TEXTS.map(text=> {
      const dvec = EmbeddingsUtil.vectorize(text, VOCAB, DF, N_DOCS);
      const sc = SimilarityUtil.cosineSimilarity(qvec, dvec);
      return { text, score: Number(sc.toFixed(6)), source: "local" };
    });
    scores.sort((a,b)=> b.score - a.score);
    return scores.slice(0, topK);
  }

  function runKeywordSearch(query, topK=3){
    return KeywordUtil.keywordSearch(query, global.__DOC_TEXTS, topK);
  }

 
  function pineconeStub(query, topK=3){
    const base = runSemanticSearch(query, topK);
    return base.map((r,i)=> ({ text: r.text, score: Number(Math.min(1, r.score + (i===0?0.08:0.03)).toFixed(6)), source: "pinecone" }));
  }

  function plannerRule(query, semTop, keyTop){
    const tokens = EmbeddingsUtil.tokenize(query);
    if (isMath(query)) return "math";
    if (isDefinition(query)) return "definition";
    if (isHowTo(query)) return "howto";
    if (mentionsTime(query)) return "calendar";
    if (isTask(query)) return "task";
    
    if (tokens.length > 6 && !keyTop.some(k=>k.score>0)) return "semantic_search";

    if (keyTop.some(k=>k.score>0.0) && tokens.length <= 6) return "keyword_search";
    
    const sBest = semTop[0]?.score||0;
    const kBest = keyTop[0]?.score||0;
    if (Math.abs(sBest-kBest) < 0.10) return "hybrid";
    return sBest >= kBest ? "semantic_search" : "keyword_search";
  }

  
  function handleDefinition(query, semTop, keyTop){
    
    const cand = semTop[0] && semTop[0].score>=keyTop[0].score ? semTop[0] : keyTop[0];
    return { planner_decision: "definition", best: cand || { text:"", score:0, source:"local" } };
  }

  function handleHowTo(query, semTop, keyTop){
    const top = semTop[0] || keyTop[0];
    const text = top ? top.text : "";
    const steps = text.split(/[.!?\n]/).map(s=>s.trim()).filter(Boolean);
    // take up to 5 step-like sentences
    const topSteps = steps.slice(0,5).filter(s => s.toLowerCase().includes("mix") || s.toLowerCase().includes("add") || s.toLowerCase().includes("bake") || s.length>30);
    return { planner_decision: "howto", best: { text: top.text || "", score: top.score || 0, source:top.source||"local" }, extra_steps: topSteps };
  }

  function handleCalendar(query){
    const now = new Date();
    let suggested = null;
    if (/\btomorrow\b/i.test(query)) {
      suggested = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    } else if (/\btoday\b/i.test(query)) {
      suggested = now;
    } else {
      // detect weekday
      const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
      for (let i=0;i<days.length;i++){
        if (new RegExp("\\b"+days[i]+"\\b","i").test(query)){
          // pick next occurrence of that weekday
          const target = i;
          const diff = (target + 7 - now.getDay()) % 7 || 7;
          suggested = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
          break;
        }
      }
    }
    const timeMatch = query.match(/(\d{1,2})(?:[: ]?)(\d{2})?\s*(am|pm)?/i);
    let timeStr = null;
    if (timeMatch){
      let h = parseInt(timeMatch[1],10);
      const mm = timeMatch[2] ? parseInt(timeMatch[2],10) : 0;
      const ampm = timeMatch[3];
      if (ampm && /pm/i.test(ampm) && h<12) h+=12;
      if (ampm && /am/i.test(ampm) && h===12) h=0;
      timeStr = `${("0"+h).slice(-2)}:${("0"+mm).slice(-2)}`;
    }
    return { planner_decision:"calendar", suggested_date: suggested ? suggested.toISOString().split("T")[0] : null, suggested_time: timeStr, note:"This is a scheduler suggestion only (no calendar write)." };
  }

  function handleMath(query){
    try {
      const safe = query.replace(/[^\d\+\-\*\/\.\(\)\s]/g,"");
      const value = Function(`return (${safe})`)();
      return { planner_decision:"math", best: { text: `${value}` , score:1, source:"local" } };
    } catch(e){
      return { planner_decision:"math", best: { text: "Could not compute", score:0, source:"local" } };
    }
  }

  function handleTask(query, semTop, keyTop){
    const top = semTop[0] || keyTop[0];
    // generate a checklist by splitting text into steps heuristically
    const parts = (top.text || "").split(/[.!?\n]/).map(s=>s.trim()).filter(Boolean);
    const steps = parts.slice(0,6);
    return { planner_decision:"task", best: { text: top.text||"", score:top.score||0, source:top.source||"local" }, steps };
  }

  // main runAgent
  async function runAgent(query){
    const t0 = performance.now();
    await loadDocs();
    const semTop = runSemanticSearch(query,3);
    const keyTop = runKeywordSearch(query,3);
    let decision = plannerRule(query, semTop, keyTop);

    // handle special planners
    let bestMatch = null;
    let usedFallback = false;
    let trace = { reasoning:"", semantic_top_k_scores:semTop, keyword_top_k_scores:keyTop, latency_ms:0 };

    if (decision === "definition") {
      const out = handleDefinition(query, semTop, keyTop);
      bestMatch = out.best;
    } else if (decision === "howto") {
      const out = handleHowTo(query, semTop, keyTop);
      bestMatch = out.best;
      trace.extra_steps = out.extra_steps || [];
    } else if (decision === "calendar") {
      const out = handleCalendar(query);
      bestMatch = { text: `Calendar suggestion: ${out.suggested_date || "date not found"} ${out.suggested_time || ""}`, score: 0.9, source: "local" };
      trace.calendar = out;
    } else if (decision === "math") {
      const out = handleMath(query);
      bestMatch = out.best;
    } else if (decision === "task") {
      const out = handleTask(query, semTop, keyTop);
      bestMatch = out.best;
      trace.task_steps = out.steps || [];
    } else {
      // semantic/keyword/hybrid selection
      if (decision === "semantic_search") bestMatch = semTop[0] || { text:"", score:0, source:"local" };
      else if (decision === "keyword_search") bestMatch = keyTop[0] || { text:"", score:0, source:"local" };
      else { // hybrid: combine
        const union = {};
        semTop.concat(keyTop).forEach(item => {
          if (!union[item.text]) union[item.text] = { s:0, k:0, text:item.text };
          const s = semTop.find(x=>x.text===item.text); if (s) union[item.text].s = s.score;
          const k = keyTop.find(x=>x.text===item.text); if (k) union[item.text].k = k.score;
        });
        const combined = Object.values(union).map(u=> ({ text:u.text, score: Number(( (u.s||0)*0.6 + (u.k||0)*0.4 ).toFixed(6)), source:"local" }) );
        combined.sort((a,b)=> b.score - a.score);
        bestMatch = combined[0] || { text:"", score:0, source:"local" };
      }
    }

    // fallback to pinecone stub if needed
    if ((bestMatch.score||0) < 0.75) {
      usedFallback = true;
      const pine = pineconeStub(query,3);
      bestMatch = pine[0] || bestMatch;
    }

    const t1 = performance.now();
    trace.latency_ms = Math.round(t1-t0);
    trace.reasoning = `tokens=${EmbeddingsUtil.tokenize(query).length}; planner=${decision}; fallback=${usedFallback}`;

    const result = {
      planner_decision: decision,
      used_fallback_tool: usedFallback,
      best_match: { text: bestMatch.text||"", score: Number((bestMatch.score||0).toFixed(6)), source: bestMatch.source || "local" },
      trace
    };
    return result;
  }

  global.runAgent = runAgent;
})(this);
