/**
 * Mock Database Queries
 * Provides test doubles for database operations
 */

// In-memory storage for test data
const testData = {
  passkeys: new Map(),
  challenges: new Map(),
  verificationCodes: new Map()
};

const mockDb = {
  /**
   * Passkey query mocks
   */
  passkeyQueries: {
    createPasskey: {
      run: jest.fn((credentialId, publicKey, counter, email) => {
        const id = Buffer.from(credentialId).toString('base64');
        testData.passkeys.set(id, {
          credentialId,
          publicKey,
          counter,
          email,
          createdAt: new Date()
        });
        return { changes: 1, lastInsertRowid: testData.passkeys.size };
      })
    },
    findPasskeyByCredentialId: {
      get: jest.fn((credentialId) => {
        const id = Buffer.from(credentialId).toString('base64');
        return testData.passkeys.get(id) || null;
      })
    },
    getEmailPasskeys: {
      all: jest.fn((email) => {
        return Array.from(testData.passkeys.values())
          .filter(pk => pk.email === email);
      })
    },
    updatePasskeyCounter: {
      run: jest.fn((counter, credentialId) => {
        const id = Buffer.from(credentialId).toString('base64');
        const passkey = testData.passkeys.get(id);
        if (passkey) {
          passkey.counter = counter;
          return { changes: 1 };
        }
        return { changes: 0 };
      })
    },
    deletePasskey: {
      run: jest.fn((credentialId) => {
        const id = Buffer.from(credentialId).toString('base64');
        const deleted = testData.passkeys.delete(id);
        return { changes: deleted ? 1 : 0 };
      })
    }
  },

  /**
   * Challenge query mocks
   */
  challengeQueries: {
    storeChallenge: {
      run: jest.fn((email, challenge, expiresAt) => {
        testData.challenges.set(email, {
          challenge,
          expiresAt,
          createdAt: new Date()
        });
        return { changes: 1 };
      })
    },
    getChallenge: {
      get: jest.fn((email) => {
        return testData.challenges.get(email) || null;
      })
    },
    deleteChallenge: {
      run: jest.fn((email) => {
        const deleted = testData.challenges.delete(email);
        return { changes: deleted ? 1 : 0 };
      })
    }
  },

  /**
   * Verification code query mocks
   */
  verificationCodeQueries: {
    storeCode: jest.fn((email, code, expiresAt) => {
      testData.verificationCodes.set(email, {
        code,
        expiresAt,
        createdAt: new Date()
      });
      return Promise.resolve(true);
    }),
    getCode: jest.fn((email) => {
      const codeData = testData.verificationCodes.get(email);
      return Promise.resolve(codeData || null);
    }),
    deleteCode: jest.fn((email) => {
      const deleted = testData.verificationCodes.delete(email);
      return Promise.resolve(deleted);
    })
  },

  /**
   * Clear all test data
   */
  clearTestData: () => {
    testData.passkeys.clear();
    testData.challenges.clear();
    testData.verificationCodes.clear();
  },

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    // Clear test data
    mockDb.clearTestData();

    // Reset all mock functions
    Object.keys(mockDb.passkeyQueries).forEach(key => {
      if (mockDb.passkeyQueries[key].run?.mockClear) {
        mockDb.passkeyQueries[key].run.mockClear();
      }
      if (mockDb.passkeyQueries[key].get?.mockClear) {
        mockDb.passkeyQueries[key].get.mockClear();
      }
      if (mockDb.passkeyQueries[key].all?.mockClear) {
        mockDb.passkeyQueries[key].all.mockClear();
      }
    });

    Object.keys(mockDb.challengeQueries).forEach(key => {
      if (mockDb.challengeQueries[key].run?.mockClear) {
        mockDb.challengeQueries[key].run.mockClear();
      }
      if (mockDb.challengeQueries[key].get?.mockClear) {
        mockDb.challengeQueries[key].get.mockClear();
      }
    });

    Object.keys(mockDb.verificationCodeQueries).forEach(key => {
      if (mockDb.verificationCodeQueries[key].mockClear) {
        mockDb.verificationCodeQueries[key].mockClear();
      }
    });
  },

  /**
   * Get test data (for debugging)
   */
  getTestData: () => ({
    passkeys: Array.from(testData.passkeys.entries()),
    challenges: Array.from(testData.challenges.entries()),
    verificationCodes: Array.from(testData.verificationCodes.entries())
  })
};

module.exports = {
  mockDb,
  testData
};
