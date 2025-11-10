/**
 * Jest Test Setup
 * Configures environment variables and global test settings
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.USE_FIRESTORE = 'false'; // Use in-memory for tests
process.env.SESSION_SECRET = 'test-secret-key-do-not-use-in-production';
process.env.GHOST_API_URL = 'http://localhost:3002';
process.env.RP_ID = 'test.local';
process.env.RP_NAME = 'Test Travel Intelligence Club';
process.env.ORIGIN = 'http://localhost:3002';
process.env.BASE_URL = 'http://localhost:3002';
process.env.ALLOWED_LABELS = 'builder:patron:buccaneer:explorer:insights-subscriber';

// Mock environment variables for external services (not actually called in unit tests)
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM_EMAIL = 'test@example.com';
process.env.BREVO_FROM_NAME = 'Test Sender';
process.env.GHOST_ADMIN_API_KEY = 'test-ghost-key';

// Set test timeout
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  /**
   * Create a mock user object
   */
  createMockUser: (overrides = {}) => ({
    email: 'test@example.com',
    name: 'Test User',
    labels: [{ name: 'builder' }],
    uuid: 'test-uuid-123',
    ...overrides
  }),

  /**
   * Create mock session data
   */
  createMockSession: (overrides = {}) => ({
    user: {
      email: 'test@example.com',
      name: 'Test User',
      labels: ['builder']
    },
    ...overrides
  }),

  /**
   * Create mock passkey credential
   */
  createMockPasskey: (overrides = {}) => ({
    id: 'test-passkey-id',
    publicKey: Buffer.from('test-public-key'),
    counter: 0,
    credentialID: Buffer.from('test-credential-id'),
    ...overrides
  })
};

// Clean up after all tests
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 100));
});
