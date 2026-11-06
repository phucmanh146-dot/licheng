function normalizeCnMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0086') && digits.length === 15) digits = digits.slice(4);
  else if (digits.startsWith('86') && digits.length === 13) digits = digits.slice(2);
  return digits.slice(0, 11);
}
function isValidCnMobile(value) {
  return /^1[3-9]\d{9}$/.test(normalizeCnMobile(value));
}
module.exports = {normalizeCnMobile, isValidCnMobile};
