const fs = require('fs');
let code = fs.readFileSync('src/services/productService.ts', 'utf8');

const replacement = `
  const tokenize = (str) => {
    return str.trim().toLowerCase().split(/\\s+/).filter(Boolean).map(t => {
      if (/(?:ss|is|us|as|os|yes|this|glass|dress|business|less|mass|boss|cross|furniture)$/i.test(t)) return t;
      if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
      return t;
    });
  };

  if (query && query.trim().length > 0) {
    const tokens = tokenize(query);
    if (tokens.length > 0) {
      filter.$and = tokens.map(token => {
        const tRegex = new RegExp(escapeRegex(token), "i");
        return {
          $or: [
            { name: tRegex },
            { description: tRegex },
            { category: tRegex },
            { tags: tRegex },
          ]
        };
      });
    }
  }

  // Fetch candidates from MongoDB
  let rawProducts = await Product.find(filter);

  // Requirements filtering
  if (requirements && typeof requirements === "object") {
    const reqEntries = Object.entries(requirements);
    if (reqEntries.length > 0) {
      rawProducts = rawProducts.filter((p) => {
        const fullText = \`\${p.name} \${p.description} \${(p.tags || []).join(" ")}\`.toLowerCase();
        return reqEntries.every(([key, value]) => {
          if (value === false) return true;
          if (value === true || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes") {
            const readableKey = key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
            return fullText.includes(readableKey);
          } else {
            const strVal = String(value).toLowerCase();
            return fullText.includes(strVal);
          }
        });
      });
    }
  }

  const total = rawProducts.length;

  // Sorting
  if (sortBy === "price_asc") {
    rawProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price_desc") {
    rawProducts.sort((a, b) => b.price - a.price);
  } else {
    // Relevance scoring
    const queryTokens = query ? tokenize(query) : [];
    const catStr = (category || "").trim().toLowerCase();
    const exactQuery = (query || "").trim().toLowerCase();

    const scored = rawProducts.map((p) => {
      let score = 0;
      const nameLower = p.name.toLowerCase();
      const descLower = p.description.toLowerCase();
      const catLower = p.category.toLowerCase();
      const tagsLower = (p.tags || []).map(t => t.toLowerCase());

      if (queryTokens.length > 0) {
        if (nameLower === exactQuery) score += 100;
        else if (nameLower.includes(exactQuery)) score += 80;

        let nameMatches = 0;
        let allMatches = 0;

        for (const token of queryTokens) {
          let matched = false;
          if (nameLower.includes(token)) { nameMatches++; matched = true; score += 20; }
          else if (catLower.includes(token)) { matched = true; score += 15; }
          else if (tagsLower.some(t => t.includes(token))) { matched = true; score += 15; }
          else if (descLower.includes(token)) { matched = true; score += 5; }
          
          if (matched) allMatches++;
        }
        if (nameMatches === queryTokens.length) score += 40;
        else if (allMatches === queryTokens.length) score += 20;
      }

      if (catStr && catLower.includes(catStr)) {
        score += 40;
      }

      if (p.inventory > 0) score += 5;

      return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score || b.product.createdAt.getTime() - a.product.createdAt.getTime());
    rawProducts = scored.map((s) => s.product);
  }
`;

const regexToReplace = /if \\(query && query\\.trim\\(\\)\\.length > 0\\) \\{[\\s\\S]*?rawProducts = scored\\.map\\(\\(s\\) => s\\.product\\);\\s*\\}/;
code = code.replace(regexToReplace, replacement);
fs.writeFileSync('src/services/productService.ts', code);
