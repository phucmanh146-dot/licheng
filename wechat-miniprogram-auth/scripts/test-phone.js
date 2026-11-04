const assert = require('assert');
const {normalizeCnMobile, isValidCnMobile} = require('../utils/phone');
const cases = [
  ['18003626786', '18003626786', true],
  ['+86 18003626786', '18003626786', true],
  ['86 18003626786', '18003626786', true],
  ['0086 18003626786', '18003626786', true],
  ['180 0362 6786', '18003626786', true],
  ['12003626786', '12003626786', false],
  ['1800362678', '1800362678', false],
  ['', '', false]
];
for (const [input, expected, valid] of cases) {
  assert.strictEqual(normalizeCnMobile(input), expected, 'normalize: ' + input);
  assert.strictEqual(isValidCnMobile(input), valid, 'validate: ' + input);
}
process.stdout.write('phone validation: ' + cases.length + ' cases passed\\n');
