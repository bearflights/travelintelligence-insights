const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'auth.db'));

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS passkeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    device_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS challenges (
    email TEXT PRIMARY KEY,
    challenge TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_passkeys_email ON passkeys(email);
  CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_email ON challenges(email);
  CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
`);

// Passkey functions
const passkeyQueries = {
  createPasskey: db.prepare(`
    INSERT INTO passkeys (email, credential_id, public_key, counter, transports, device_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  findPasskeyByCredentialId: db.prepare(`
    SELECT * FROM passkeys WHERE credential_id = ?
  `),

  getEmailPasskeys: db.prepare(`
    SELECT * FROM passkeys WHERE email = ?
  `),

  updatePasskeyCounter: db.prepare(`
    UPDATE passkeys SET counter = ? WHERE credential_id = ?
  `),

  deletePasskey: db.prepare(`
    DELETE FROM passkeys WHERE id = ?
  `),
};

// Challenge functions (for WebAuthn verification)
const challengeQueries = {
  storeChallenge: db.prepare(`
    INSERT OR REPLACE INTO challenges (email, challenge, created_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `),

  getChallenge: db.prepare(`
    SELECT challenge FROM challenges
    WHERE email = ?
    AND datetime(created_at, '+10 minutes') > datetime('now')
  `),

  deleteChallenge: db.prepare(`
    DELETE FROM challenges WHERE email = ?
  `),

  cleanupExpiredChallenges: db.prepare(`
    DELETE FROM challenges
    WHERE datetime(created_at, '+10 minutes') < datetime('now')
  `),
};

// Verification code functions (for email-based authentication)
const verificationCodeQueries = {
  storeCode: (email, code, expiresAt) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO verification_codes (email, code, expires_at, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(email, code, expiresAt);
  },

  getCode: (email) => {
    const stmt = db.prepare(`
      SELECT code, expires_at as expiresAt FROM verification_codes
      WHERE email = ?
    `);
    return stmt.get(email);
  },

  deleteCode: (email) => {
    const stmt = db.prepare(`DELETE FROM verification_codes WHERE email = ?`);
    return stmt.run(email);
  },

  cleanupExpiredCodes: () => {
    const stmt = db.prepare(`
      DELETE FROM verification_codes
      WHERE expires_at < ?
    `);
    return stmt.run(Date.now());
  },
};

module.exports = {
  db,
  passkeyQueries,
  challengeQueries,
  verificationCodeQueries,
};
