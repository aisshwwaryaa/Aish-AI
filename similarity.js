// utils/similarity.js
(function(global){
  function dot(a,b){ let s=0; for (let i=0;i<a.length;i++) s+= (a[i]||0)*(b[i]||0); return s; }
  function norm(a){ let s=0; for (let i=0;i<a.length;i++) s+= (a[i]||0)*(a[i]||0); return Math.sqrt(s); }
  function cosineSimilarity(a,b){ const na = norm(a), nb = norm(b); if (na===0||nb===0) return 0; return dot(a,b)/(na*nb); }
  global.SimilarityUtil = { cosineSimilarity };
})(this);
