// utils/keyword.js
(function(global){
  const STOPWORDS = new Set([
    "the","is","at","which","on","a","an","and","or","of","in","to","for","how","what","why","when","do","does","can"
  ]);

  // simple synonyms map (extend as needed)
  const SYNONYMS = {
    "ai": ["artificial intelligence","machine intelligence"],
    "ml": ["machine learning"],
    "cv": ["computer vision"],
    "resume": ["cv","curriculum vitae"],
    "networking": ["networks","network"],
    "cake": ["cakes","bake","baking"]
  };

  function normalizeTokens(text){
    return (text||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean)
      .filter(w => !STOPWORDS.has(w));
  }

  function expandSynonyms(tokens){
    const set = new Set(tokens);
    tokens.forEach(t => {
      for (const key in SYNONYMS){
        if (key === t || SYNONYMS[key].includes(t)) {
          set.add(key);
          SYNONYMS[key].forEach(s => set.add(s));
        }
      }
    });
    return Array.from(set);
  }

  function phraseMatches(query, text) {
    // check longer phrases first (3-grams)
    const q = query.toLowerCase();
    const phrases = [];
    const toks = q.split(/\s+/).filter(Boolean);
    for (let len = Math.min(3,toks.length); len>=1; len--) {
      for (let i=0;i+len<=toks.length;i++){
        phrases.push(toks.slice(i,i+len).join(" "));
      }
    }
    // prefer multi-word phrase matches
    let score=0;
    for (const p of phrases) if (p.length>1 && text.toLowerCase().includes(p)) score += (p.split(" ").length);
    return score;
  }

  function keywordSearch(query, docs, topK=3){
    const tokens = normalizeTokens(query);
    const expanded = expandSynonyms(tokens);
    // compute weighted score: phrase matches + word matches
    const scored = docs.map(doc => {
      const lower = doc.toLowerCase();
      let wordMatches=0;
      expanded.forEach(w => { if (w && lower.includes(w)) wordMatches += 1; });
      const phraseScore = phraseMatches(query, doc);
      // weight phrases higher, synonyms slight boost
      const raw = (wordMatches * 1.0) + (phraseScore * 1.8);
      return { text: doc, raw, wordMatches, phraseScore };
    });
    const maxRaw = Math.max(...scored.map(s=>s.raw),1);
    const normed = scored.map(s => ({ text: s.text, score: +(s.raw / maxRaw).toFixed(6) }));
    normed.sort((a,b)=> b.score - a.score);
    return normed.slice(0, topK);
  }

  global.KeywordUtil = { keywordSearch };
})(this);
