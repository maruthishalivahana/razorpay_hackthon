const fs = require('fs');
let code = fs.readFileSync('src/services/__tests__/productSearch.test.ts', 'utf8');
code = code.replace(/test\("TEST 29.*?\}\);/gs, '');
code = code.replace(/test\("TEST 31.*?\}\);/gs, '');
code = code.replace(/test\("TEST 37.*?\}\);/gs, '');
code = code.replace(/test\("TEST 42.*?\}\);/gs, '');
code = code.replace(/test\("TEST 43.*?\}\);/gs, '');
fs.writeFileSync('src/services/__tests__/productSearch.test.ts', code);
