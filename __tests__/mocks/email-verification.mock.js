/**
 * Mock Email Verification Service
 * Provides test doubles for email verification functionality
 */

const mockEmailVerification = {
  /**
   * Mock generating a verification code
   */
  generateCode: jest.fn(() => '123456'),

  /**
   * Mock sending a verification email
   */
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),

  /**
   * Mock storing a verification code
   */
  storeCode: jest.fn().mockResolvedValue(true),

  /**
   * Mock verifying a code
   */
  verifyCode: jest.fn(),

  /**
   * Mock deleting a code
   */
  deleteCode: jest.fn().mockResolvedValue(true),

  /**
   * Mock getting a stored code
   */
  getCode: jest.fn(),

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    Object.keys(mockEmailVerification).forEach(key => {
      if (typeof mockEmailVerification[key] === 'function' && mockEmailVerification[key].mockClear) {
        mockEmailVerification[key].mockClear();
      }
    });
    // Ensure default implementations are set
    mockEmailVerification.generateCode.mockReturnValue('123456');
    mockEmailVerification.sendVerificationEmail.mockResolvedValue({ success: true });
    mockEmailVerification.storeCode.mockResolvedValue(true);
    mockEmailVerification.deleteCode.mockResolvedValue(true);
  }
};

/**
 * Preset mock scenarios
 */
const mockScenarios = {
  validCode: {
    code: '123456',
    email: 'test@example.com',
    expiresAt: new Date(Date.now() + 600000) // 10 minutes from now
  },
  expiredCode: {
    code: '123456',
    email: 'test@example.com',
    expiresAt: new Date(Date.now() - 1000) // Expired
  },
  invalidCode: null
};

module.exports = {
  mockEmailVerification,
  mockScenarios
};
