/**
 * Unit Tests for Passkey Authentication Endpoints
 * Tests WebAuthn/Passkey registration and authentication flows
 */

const request = require('supertest');
const { createApp } = require('../../app');

// Import mocks
const { mockGhostAPI } = require('../mocks/ghost-api.mock');
const { mockEmailVerification } = require('../mocks/email-verification.mock');
const { mockDb } = require('../mocks/db.mock');
const { mockPasskeyAuth } = require('../mocks/passkey-auth.mock');

describe('Passkey Authentication Endpoints', () => {
  let app;
  let authenticatedAgent;

  // Helper to create an authenticated session
  const createAuthenticatedAgent = async () => {
    const agent = request.agent(app);

    // Mock user with appropriate labels
    const mockMember = {
      id: 'member-123',
      email: 'test@example.com',
      name: 'Test User',
      labels: [{ name: 'builder' }]
    };

    mockEmailVerification.verifyCode.mockResolvedValue(true);
    mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

    // Authenticate
    await agent
      .post('/api/auth/verify-code')
      .send({
        email: 'test@example.com',
        code: '123456'
      });

    return agent;
  };

  beforeEach(async () => {
    // Reset all mocks before each test
    mockGhostAPI.resetMocks();
    mockEmailVerification.resetMocks();
    mockDb.resetMocks();
    mockPasskeyAuth.resetMocks();

    // Create app with injected dependencies
    app = createApp(true, {
      ghostAPI: mockGhostAPI,
      emailVerification: mockEmailVerification,
      passkeyQueries: mockDb.passkeyQueries,
      challengeQueries: mockDb.challengeQueries,
      verificationCodeQueries: mockDb.verificationCodeQueries,
      passkeyAuth: mockPasskeyAuth
    });

    // Create authenticated agent for tests that need it
    authenticatedAgent = await createAuthenticatedAgent();
  });

  describe('POST /api/passkey/register-start', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/passkey/register-start')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Not authenticated');
    });

    it('should generate registration options for authenticated user', async () => {
      const response = await authenticatedAgent
        .post('/api/passkey/register-start')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.challenge).toBeDefined();
      expect(response.body.rp).toBeDefined();
      expect(response.body.user).toBeDefined();

      // Verify mock was called
      expect(mockPasskeyAuth.generateRegistration).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('should use session email if not provided', async () => {
      const response = await authenticatedAgent
        .post('/api/passkey/register-start')
        .send({});

      expect(response.status).toBe(200);
      expect(mockPasskeyAuth.generateRegistration).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('should use provided userName if available', async () => {
      const response = await authenticatedAgent
        .post('/api/passkey/register-start')
        .send({
          email: 'test@example.com',
          userName: 'Custom Display Name'
        });

      expect(response.status).toBe(200);
      expect(mockPasskeyAuth.generateRegistration).toHaveBeenCalledWith(
        'test@example.com',
        'Custom Display Name'
      );
    });

    it('should handle passkey generation errors', async () => {
      mockPasskeyAuth.generateRegistration.mockRejectedValue(
        new Error('Passkey generation failed')
      );

      const response = await authenticatedAgent
        .post('/api/passkey/register-start')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to start passkey registration');
    });
  });

  describe('POST /api/passkey/register-finish', () => {
    const mockCredential = {
      id: 'mock-credential-id',
      rawId: 'mock-raw-id',
      type: 'public-key',
      response: {
        clientDataJSON: 'mock-client-data',
        attestationObject: 'mock-attestation'
      }
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/passkey/register-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Not authenticated');
    });

    it('should verify and store passkey registration', async () => {
      const response = await authenticatedAgent
        .post('/api/passkey/register-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Passkey registered successfully');

      // Verify passkey verification was called
      expect(mockPasskeyAuth.verifyRegistration).toHaveBeenCalledWith(
        'test@example.com',
        mockCredential
      );
    });

    it('should use session email if not provided', async () => {
      const response = await authenticatedAgent
        .post('/api/passkey/register-finish')
        .send({ credential: mockCredential });

      expect(response.status).toBe(200);
      expect(mockPasskeyAuth.verifyRegistration).toHaveBeenCalledWith(
        'test@example.com',
        mockCredential
      );
    });

    it('should return error if verification fails', async () => {
      mockPasskeyAuth.verifyRegistration.mockResolvedValue({
        verified: false
      });

      const response = await authenticatedAgent
        .post('/api/passkey/register-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Failed to verify passkey registration');
    });

    it('should handle registration errors', async () => {
      mockPasskeyAuth.verifyRegistration.mockRejectedValue(
        new Error('Verification failed')
      );

      const response = await authenticatedAgent
        .post('/api/passkey/register-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to complete passkey registration');
    });
  });

  describe('POST /api/passkey/login-start', () => {
    it('should generate authentication options with email', async () => {
      const response = await request(app)
        .post('/api/passkey/login-start')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.challenge).toBeDefined();

      expect(mockPasskeyAuth.generateAuthentication).toHaveBeenCalledWith('test@example.com');
    });

    it('should generate authentication options without email (discoverable credentials)', async () => {
      const response = await request(app)
        .post('/api/passkey/login-start')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.challenge).toBeDefined();

      expect(mockPasskeyAuth.generateAuthentication).toHaveBeenCalledWith(null);
    });

    it('should handle authentication generation errors', async () => {
      mockPasskeyAuth.generateAuthentication.mockRejectedValue(
        new Error('No passkeys found')
      );

      const response = await request(app)
        .post('/api/passkey/login-start')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('No passkeys found');
    });
  });

  describe('POST /api/passkey/login-finish', () => {
    const mockCredential = {
      id: 'mock-credential-id',
      rawId: 'mock-raw-id',
      type: 'public-key',
      response: {
        clientDataJSON: 'mock-client-data',
        authenticatorData: 'mock-auth-data',
        signature: 'mock-signature'
      }
    };

    it('should verify passkey and create session', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockPasskeyAuth.verifyAuthentication.mockResolvedValue({
        verified: true,
        email: 'test@example.com'
      });

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const agent = request.agent(app);
      const response = await agent
        .post('/api/passkey/login-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Authentication successful');
      expect(response.body.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        labels: ['builder']
      });

      // Verify session was created
      const statusResponse = await agent.get('/api/auth/status');
      expect(statusResponse.body.authenticated).toBe(true);
    });

    it('should work without providing email (discoverable credentials)', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockPasskeyAuth.verifyAuthentication.mockResolvedValue({
        verified: true,
        email: 'test@example.com'
      });

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/passkey/login-finish')
        .send({ credential: mockCredential });

      expect(response.status).toBe(200);
      expect(mockPasskeyAuth.verifyAuthentication).toHaveBeenCalledWith(null, mockCredential);
    });

    it('should return error if passkey verification fails', async () => {
      mockPasskeyAuth.verifyAuthentication.mockResolvedValue({
        verified: false
      });

      const response = await request(app)
        .post('/api/passkey/login-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Failed to verify passkey');
    });

    it('should return 404 if user not found in Ghost', async () => {
      mockPasskeyAuth.verifyAuthentication.mockResolvedValue({
        verified: true,
        email: 'test@example.com'
      });

      mockGhostAPI.getMemberByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/passkey/login-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found in system');
    });

    it('should return 403 if user lacks required labels', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'free-member' }]
      };

      mockPasskeyAuth.verifyAuthentication.mockResolvedValue({
        verified: true,
        email: 'test@example.com'
      });

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/passkey/login-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
      expect(response.body.message).toContain('join Travel Intelligence Club');
    });

    it('should handle authentication errors', async () => {
      mockPasskeyAuth.verifyAuthentication.mockRejectedValue(
        new Error('Authentication error')
      );

      const response = await request(app)
        .post('/api/passkey/login-finish')
        .send({
          email: 'test@example.com',
          credential: mockCredential
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to complete passkey authentication');
    });
  });
});
