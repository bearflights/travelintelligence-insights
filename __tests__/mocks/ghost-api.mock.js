/**
 * Mock Ghost API Client
 * Provides test doubles for Ghost CMS API interactions
 */

const mockGhostAPI = {
  /**
   * Mock getting a member by email
   */
  getMemberByEmail: jest.fn(),

  /**
   * Mock creating or updating a member
   */
  createOrUpdateMember: jest.fn(),

  /**
   * Mock getting all members
   */
  getAllMembers: jest.fn(),

  /**
   * Mock getting member by ID
   */
  getMemberById: jest.fn(),

  /**
   * Mock updating member labels
   */
  updateMemberLabels: jest.fn(),

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    Object.keys(mockGhostAPI).forEach(key => {
      if (typeof mockGhostAPI[key] === 'function' && mockGhostAPI[key].mockClear) {
        mockGhostAPI[key].mockClear();
      }
    });
  }
};

/**
 * Helper to create a mock Ghost member response
 */
const createMockMember = (overrides = {}) => ({
  id: 'mock-member-id',
  uuid: 'mock-member-uuid',
  email: 'test@example.com',
  name: 'Test User',
  status: 'free',
  labels: [{ name: 'builder' }],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

/**
 * Preset mock responses for common scenarios
 */
const mockResponses = {
  validMember: createMockMember(),
  memberWithMultipleLabels: createMockMember({
    labels: [
      { name: 'builder' },
      { name: 'patron' },
      { name: 'insights-subscriber' }
    ]
  }),
  memberWithoutLabels: createMockMember({
    labels: []
  }),
  notFound: null
};

module.exports = {
  mockGhostAPI,
  createMockMember,
  mockResponses
};
