/**
 * Unit Tests for Authentication Endpoints
 * Tests email verification flow, code validation, and session management
 */

const request = require('supertest');
const { createApp } = require('../../app');

// Import mocks
const { mockGhostAPI } = require('../mocks/ghost-api.mock');
const { mockEmailVerification } = require('../mocks/email-verification.mock');
const { mockDb } = require('../mocks/db.mock');
const { mockPasskeyAuth } = require('../mocks/passkey-auth.mock');

describe('Authentication Endpoints', () => {
  let app;

  beforeEach(() => {
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
  });

  describe('POST /api/auth/send-verification', () => {
    it('should require email parameter', async () => {
      const response = await request(app)
        .post('/api/auth/send-verification')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is required');
    });

    it('should return 404 if user not found in Ghost', async () => {
      mockGhostAPI.getMemberByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/send-verification')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
      expect(response.body.message).toContain('sign up');
      expect(mockGhostAPI.getMemberByEmail).toHaveBeenCalledWith('nonexistent@example.com');
    });

    it('should send verification code for valid user', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/auth/send-verification')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Verification code sent');

      // Verify mocks were called correctly
      expect(mockGhostAPI.getMemberByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockEmailVerification.generateCode).toHaveBeenCalled();
      expect(mockEmailVerification.storeCode).toHaveBeenCalled();
      expect(mockEmailVerification.sendVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use provided name if available', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Ghost User',
        labels: [{ name: 'builder' }]
      };

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/auth/send-verification')
        .send({
          email: 'test@example.com',
          name: 'Custom Name'
        });

      expect(response.status).toBe(200);
      expect(mockEmailVerification.sendVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Custom Name',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should handle email service errors gracefully', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);
      mockEmailVerification.sendVerificationEmail.mockRejectedValue(
        new Error('Email service unavailable')
      );

      const response = await request(app)
        .post('/api/auth/send-verification')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to send verification code');
    });
  });

  describe('POST /api/auth/verify-code', () => {
    it('should require email and code parameters', async () => {
      let response = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and code are required');

      response = await request(app)
        .post('/api/auth/verify-code')
        .send({ code: '123456' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and code are required');
    });

    it('should return 400 for invalid verification code', async () => {
      mockEmailVerification.verifyCode.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or expired code');
      expect(mockEmailVerification.verifyCode).toHaveBeenCalledWith('test@example.com', 'invalid');
    });

    it('should return 404 if user not found after valid code', async () => {
      mockEmailVerification.verifyCode.mockResolvedValue(true);
      mockGhostAPI.getMemberByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should return 403 if user lacks required labels', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'free-member' }] // Not in allowed labels
      };

      mockEmailVerification.verifyCode.mockResolvedValue(true);
      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
      expect(response.body.message).toContain('join Travel Intelligence Club');
      expect(response.body.userLabels).toEqual(['free-member']);
    });

    it('should create session for user with required labels', async () => {
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [
          { name: 'builder' },
          { name: 'other-label' }
        ]
      };

      mockEmailVerification.verifyCode.mockResolvedValue(true);
      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Authentication successful');
      expect(response.body.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        labels: ['builder', 'other-label']
      });

      // Verify code was validated
      expect(mockEmailVerification.verifyCode).toHaveBeenCalledWith('test@example.com', '123456');
    });

    it('should accept users with any of the allowed labels', async () => {
      const allowedLabels = ['builder', 'patron', 'buccaneer', 'explorer', 'insights-subscriber'];

      for (const label of allowedLabels) {
        // Reset mocks for each iteration
        mockEmailVerification.verifyCode.mockResolvedValue(true);

        const mockMember = {
          id: 'member-123',
          email: 'test@example.com',
          name: 'Test User',
          labels: [{ name: label }]
        };

        mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

        const response = await request(app)
          .post('/api/auth/verify-code')
          .send({
            email: 'test@example.com',
            code: '123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should handle verification service errors', async () => {
      mockEmailVerification.verifyCode.mockRejectedValue(
        new Error('Verification service error')
      );

      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to verify code');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return authenticated false when no session', async () => {
      const response = await request(app)
        .get('/api/auth/status');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });

    it('should return user info when authenticated', async () => {
      // First authenticate
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockEmailVerification.verifyCode.mockResolvedValue(true);
      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      // Create session
      const agent = request.agent(app);
      await agent
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      // Check status
      const response = await agent.get('/api/auth/status');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(true);
      expect(response.body.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        labels: ['builder']
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should destroy session and return success', async () => {
      // First authenticate
      const mockMember = {
        id: 'member-123',
        email: 'test@example.com',
        name: 'Test User',
        labels: [{ name: 'builder' }]
      };

      mockEmailVerification.verifyCode.mockResolvedValue(true);
      mockGhostAPI.getMemberByEmail.mockResolvedValue(mockMember);

      const agent = request.agent(app);

      // Create session
      await agent
        .post('/api/auth/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        });

      // Verify authenticated
      let statusResponse = await agent.get('/api/auth/status');
      expect(statusResponse.body.authenticated).toBe(true);

      // Logout
      const logoutResponse = await agent.post('/api/auth/logout');
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Verify no longer authenticated
      statusResponse = await agent.get('/api/auth/status');
      expect(statusResponse.body.authenticated).toBe(false);
    });

    it('should handle logout when not authenticated', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
