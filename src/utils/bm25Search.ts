/**
 * BM25 search implementation for chat history
 * Simplified version of BM25 ranking algorithm
 */

export interface SearchableItem {
  metadata: {
    title: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export function bm25Search<T extends SearchableItem>(
  query: string,
  items: T[],
  field: string = 'title'
): T[] {
  if (!query.trim()) {
    return items;
  }

  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
  
  if (queryTerms.length === 0) {
    return items;
  }

  // BM25 parameters
  const k1 = 1.5;
  const b = 0.75;
  
  // Calculate average field length
  const avgFieldLength = items.reduce((sum, item) => {
    const fieldValue = String(item.metadata[field] || '');
    return sum + fieldValue.length;
  }, 0) / (items.length || 1);

  // Calculate scores for each item
  const scores = items.map(item => {
    const fieldValue = String(item.metadata[field] || '').toLowerCase();
    const fieldLength = fieldValue.length;
    
    let score = 0;
    
    for (const term of queryTerms) {
      const termMatches = fieldValue.match(new RegExp(term, 'g'));
      const termFrequency = termMatches ? termMatches.length : 0;
      
      if (termFrequency > 0) {
        // Calculate IDF (Inverse Document Frequency)
        const documentsWithTerm = items.filter(item => {
          const itemFieldValue = String(item.metadata[field] || '').toLowerCase();
          return itemFieldValue.includes(term);
        }).length;
        
        const idf = Math.log((items.length + 1) / (documentsWithTerm + 1));
        
        // Calculate BM25 score component
        const numerator = termFrequency * (k1 + 1);
        const denominator = termFrequency + k1 * (1 - b + b * (fieldLength / avgFieldLength));
        
        score += idf * (numerator / denominator);
      }
    }
    
    return { item, score };
  });

  // Filter out zero scores and sort by score descending
  return scores
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.item);
}
