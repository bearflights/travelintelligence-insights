/**
 * Mock Passkey Authentication
 * Provides test doubles for WebAuthn/Passkey operations
 */

const mockPasskeyAuth = {
  /**
   * Mock generating registration options
   */
  generateRegistrationOptions: jest.fn().mockResolvedValue({
    challenge: 'mock-challenge-123',
    rp: { name: 'Test RP', id: 'test.local' },
    user: {
      id: Buffer.from('test-user-id'),
      name: 'test@example.com',
      displayName: 'Test User'
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' }
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: false,
      residentKey: 'preferred',
      userVerification: 'preferred'
    },
    timeout: 60000
  }),

  /**
   * Mock verifying registration response
   */
  verifyRegistrationResponse: jest.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credentialPublicKey: Buffer.from('mock-public-key'),
      credentialID: Buffer.from('mock-credential-id'),
      counter: 0
    }
  }),

  /**
   * Mock generating authentication options
   */
  generateAuthenticationOptions: jest.fn().mockResolvedValue({
    challenge: 'mock-auth-challenge-123',
    allowCredentials: [{
      id: Buffer.from('mock-credential-id'),
      type: 'public-key',
      transports: ['internal']
    }],
    timeout: 60000,
    userVerification: 'preferred'
  }),

  /**
   * Mock verifying authentication response
   */
  verifyAuthenticationResponse: jest.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
      credentialID: Buffer.from('mock-credential-id')
    }
  }),

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    Object.keys(mockPasskeyAuth).forEach(key => {
      if (typeof mockPasskeyAuth[key] === 'function' && mockPasskeyAuth[key].mockReset) {
        mockPasskeyAuth[key].mockReset();

        // Restore default implementations
        switch (key) {
          case 'generateRegistrationOptions':
            mockPasskeyAuth[key].mockResolvedValue({
              challenge: 'mock-challenge-123',
              rp: { name: 'Test RP', id: 'test.local' },
              user: { id: Buffer.from('test-user-id'), name: 'test@example.com', displayName: 'Test User' },
              pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
              timeout: 60000
            });
            break;
          case 'verifyRegistrationResponse':
            mockPasskeyAuth[key].mockResolvedValue({
              verified: true,
              registrationInfo: {
                credentialPublicKey: Buffer.from('mock-public-key'),
                credentialID: Buffer.from('mock-credential-id'),
                counter: 0
              }
            });
            break;
          case 'generateAuthenticationOptions':
            mockPasskeyAuth[key].mockResolvedValue({
              challenge: 'mock-auth-challenge-123',
              allowCredentials: [],
              timeout: 60000
            });
            break;
          case 'verifyAuthenticationResponse':
            mockPasskeyAuth[key].mockResolvedValue({
              verified: true,
              authenticationInfo: { newCounter: 1 }
            });
            break;
        }
      }
    });
  }
};

module.exports = {
  mockPasskeyAuth
};
