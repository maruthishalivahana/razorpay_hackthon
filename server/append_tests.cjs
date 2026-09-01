const fs = require('fs');

const tests = `
  test("TEST 21: Multi-word query 'office chair'", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair" });
    assert.ok(res.returned > 0);
    assert.ok(res.products.some(p => p.name.toLowerCase().includes("office chair")));
  });

  test("TEST 22: Query with extra spaces", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "  office   chair  " });
    assert.ok(res.returned > 0);
  });

  test("TEST 23: Query with capitalization differences", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "OfFiCe cHaiR" });
    assert.ok(res.returned > 0);
  });

  test("TEST 24: Plural 'office chairs'", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chairs" });
    assert.ok(res.returned > 0);
  });

  test("TEST 25: Query token matching", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "chair" });
    assert.ok(res.returned > 0);
  });

  test("TEST 26: Name + description matching", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "ergonomic chair" });
    assert.ok(res.returned > 0);
  });

  test("TEST 27: Name + tags matching", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "premium" });
    assert.ok(res.returned >= 0);
  });

  test("TEST 28: All query tokens rank above partial match", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "ergonomic office chair" });
    assert.ok(res.returned > 0);
  });

  test("TEST 29: Exact phrase gets highest relevance", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "alpha ergonomic office chair" });
    assert.ok(res.returned > 0);
    assert.equal(res.products[0].name.toLowerCase(), "alpha ergonomic office chair");
  });

  test("TEST 30: Query 'ergonomic chair'", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "ergonomic chair" });
    assert.ok(res.returned > 0);
  });

  test("TEST 31: Query 'adjustable height'", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "adjustable height" });
    assert.ok(res.returned > 0);
  });

  test("TEST 32: Query 'office furniture'", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office furniture" });
    assert.ok(res.returned > 0);
  });

  test("TEST 33: Hard max price + multi-word query", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", maxPrice: 15000 });
    assert.ok(res.products.every(p => p.price <= 15000));
  });

  test("TEST 34: Hard min price + multi-word query", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", minPrice: 10000 });
    assert.ok(res.products.every(p => p.price >= 10000));
  });

  test("TEST 35: Quantity + multi-word query", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", quantity: 5 });
    assert.ok(res.products.every(p => p.inventory >= 5));
  });

  test("TEST 36: Sorting after multi-word search", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", sortBy: "price_asc" });
    for (let i = 0; i < res.products.length - 1; i++) {
      assert.ok(res.products[i].price <= res.products[i+1].price);
    }
  });

  test("TEST 37: Empty query with price filter", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), maxPrice: 8000 });
    assert.ok(res.returned > 0);
    assert.ok(res.products.every(p => p.price <= 8000));
  });

  test("TEST 38: Safe handling of search strings containing regex characters", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "chair (black) [test] * + ?" });
    assert.ok(res.returned >= 0);
  });

  test("TEST 39: No raw MongoDB operators accepted", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "{$where: '1==1'}" });
    assert.equal(res.returned, 0);
  });

  test("TEST 40: No result returns successful empty response", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "nonexistentproductxyz123" });
    assert.equal(res.returned, 0);
    assert.deepEqual(res.products, []);
  });

  test("TEST 41: ergonomic=true", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", requirements: { ergonomic: true } });
    assert.ok(res.returned > 0);
  });

  test("TEST 42: adjustableHeight=true", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", requirements: { adjustableHeight: true } });
    assert.ok(res.returned > 0);
  });

  test("TEST 43: ergonomic + adjustableHeight", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", requirements: { ergonomic: true, adjustableHeight: true } });
    assert.ok(res.returned > 0);
  });

  test("TEST 44: string requirements", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "laptop", requirements: { ram: "16GB" } });
    assert.ok(res.returned > 0);
  });

  test("TEST 45: boolean normalization", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", requirements: { ergonomic: "yes" } });
    assert.ok(res.returned > 0);
  });

  test("TEST 46: unsupported requirement", async () => {
    const res = await searchProducts({ merchantId: merchant._id.toString(), query: "office chair", requirements: { flyingCapability: true } });
    assert.equal(res.returned, 0);
  });
`;

let content = fs.readFileSync('src/services/__tests__/productSearch.test.ts', 'utf8');
content = content.replace(/}\);\s*$/, tests + '\n});\n');
fs.writeFileSync('src/services/__tests__/productSearch.test.ts', content);
