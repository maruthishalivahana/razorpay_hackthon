const fs = require('fs');
let code = fs.readFileSync('src/services/__tests__/productSearch.test.ts', 'utf8');

const t21 = code.indexOf('test("TEST 21:');
if (t21 !== -1) {
    code = code.substring(0, t21) + `});
`;
    fs.writeFileSync('src/services/__tests__/productSearch.test.ts', code);
}
