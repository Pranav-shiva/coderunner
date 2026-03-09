// services/hashService.js
// Produces a deterministic SHA-256 hash for (language, code) pairs.
// Used to detect duplicate submissions and serve cached results.

const crypto = require('crypto');

/**
 * Returns a hex SHA-256 hash of the language+code combination.
 * @param {string} language  - e.g. "python", "java", "cpp"
 * @param {string} code      - raw source code string
 * @returns {string}         - 64-char lowercase hex string
 */
function hashCode(language, code) {
  return crypto
    .createHash('sha256')
    .update(`${language}::${code}`)
    .digest('hex');
}

module.exports = { hashCode };
