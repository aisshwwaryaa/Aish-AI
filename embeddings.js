// utils/embeddings.js
(function(global){
  function tokenize(text){ return (text||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean); }

  function buildVocab(docs){
    const df = {};
    docs.forEach(d => {
      const seen = new Set();
      tokenize(d).forEach(t => {
        if (!seen.has(t)) { df[t] = (df[t]||0) + 1; seen.add(t); }
      });
    });
    const vocab = Object.keys(df);
    return { vocab, df };
  }

  function vectorize(text, vocab, df, N){
    const toks = tokenize(text);
    const tf = {};
    toks.forEach(t => tf[t] = (tf[t]||0) + 1);
    const vec = vocab.map(term => {
      const termTf = tf[term] || 0;
      const idf = Math.log((N+1) / ((df[term]||0)+1));
      return termTf * idf;
    });
    return vec;
  }

  global.EmbeddingsUtil = { tokenize, buildVocab, vectorize };
})(this);
