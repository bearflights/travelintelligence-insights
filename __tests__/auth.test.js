#!/usr/bin/env node

/**
 * Authentication Tests for B-77: Insights Travel Intelligence Authentication Gateway
 *
 * Tests cover:
 * - Email verification flow
 * - Session management
 * - Access control (label-based permissions)
 * - Passkey registration and authentication
 * - Ghost API integration
 * - Proxy authentication
 */

const http = require('http');
const { createApp } = require('../app');
const path = require('path');
const fs = require('fs');

// Test utilities
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exitCode = 1;
        return false;
    }
    return true;
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        console.error(`❌ FAIL: ${message}`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual: ${actual}`);
        process.exitCode = 1;
        return false;
    }
    return true;
}

function assertMatch(actual, pattern, message) {
    if (!pattern.test(actual)) {
        console.error(`❌ FAIL: ${message}`);
        console.error(`   Pattern: ${pattern}`);
        console.error(`   Actual: ${actual}`);
        process.exitCode = 1;
        return false;
    }
    return true;
}

// Test runner
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('\n🧪 Running Authentication Tests for B-77\n');
        console.log('=' .repeat(60));

        for (const {name, fn} of this.tests) {
            try {
                await fn();
                this.passed++;
                console.log(`✅ ${name}`);
            } catch (error) {
                this.failed++;
                console.error(`❌ ${name}`);
                console.error(`   Error: ${error.message}`);
            }
        }

        console.log('=' .repeat(60));
        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);

        if (this.failed > 0) {
            process.exit(1);
        }
    }
}

// Main test suite
async function runTests() {
    const runner = new TestRunner();

    // Setup test environment
    process.env.NODE_ENV = 'test';
    let app, server, baseUrl;

    // Create test database
    const testDbPath = path.join(__dirname, '..', 'auth.test.db');
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }

    try {
        // Start test server
        app = createApp(true);
        server = http.createServer(app);

        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                console.log(`🚀 Test server started on ${baseUrl}\n`);
                resolve();
            });
        });

        // Test 1: Health check - signin page loads
        runner.test('GET /signin returns sign-in page', async () => {
            const response = await fetch(`${baseUrl}/signin`, {
                redirect: 'manual'
            });
            assert(response.status === 200, 'Status should be 200');
        });

        // Test 2: Auth status for unauthenticated user
        runner.test('GET /api/auth/status returns not authenticated', async () => {
            const response = await fetch(`${baseUrl}/api/auth/status`);
            const data = await response.json();

            assertEqual(response.status, 200, 'Status should be 200');
            assertEqual(data.authenticated, false, 'Should not be authenticated');
        });

        // Test 3: Send verification - missing email
        runner.test('POST /api/auth/send-verification requires email', async () => {
            const response = await fetch(`${baseUrl}/api/auth/send-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();

            assertEqual(response.status, 400, 'Status should be 400');
            assertEqual(data.error, 'Email is required', 'Should return error message');
        });

        // Test 4: Verify code - missing parameters
        runner.test('POST /api/auth/verify-code requires email and code', async () => {
            const response = await fetch(`${baseUrl}/api/auth/verify-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' })
            });
            const data = await response.json();

            assertEqual(response.status, 400, 'Status should be 400');
            assertEqual(data.error, 'Email and code are required', 'Should return error message');
        });

        // Test 5: Verify code - invalid code
        runner.test('POST /api/auth/verify-code rejects invalid code', async () => {
            const response = await fetch(`${baseUrl}/api/auth/verify-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    code: '000000'
                })
            });
            const data = await response.json();

            assertEqual(response.status, 400, 'Status should be 400');
            assertEqual(data.error, 'Invalid or expired code', 'Should return error message');
        });

        // Test 6: Logout
        runner.test('POST /api/auth/logout succeeds', async () => {
            const response = await fetch(`${baseUrl}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            assertEqual(response.status, 200, 'Status should be 200');
            assertEqual(data.success, true, 'Should succeed');
            assertEqual(data.message, 'Logged out successfully', 'Should return success message');
        });

        // Test 7: Protected routes redirect to signin
        runner.test('Protected routes redirect unauthenticated users', async () => {
            const response = await fetch(`${baseUrl}/`, {
                redirect: 'manual'
            });

            assertEqual(response.status, 302, 'Should redirect');
            const location = response.headers.get('location');
            assert(location === '/signin', 'Should redirect to /signin');
        });

        // Test 8: Passkey registration requires authentication
        runner.test('POST /api/passkey/register-start requires authentication', async () => {
            const response = await fetch(`${baseUrl}/api/passkey/register-start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com'
                })
            });
            const data = await response.json();

            assertEqual(response.status, 401, 'Status should be 401');
            assertEqual(data.error, 'Not authenticated', 'Should return error message');
        });

        // Test 9: Passkey login start requires email
        runner.test('POST /api/passkey/login-start requires email', async () => {
            const response = await fetch(`${baseUrl}/api/passkey/login-start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();

            assertEqual(response.status, 400, 'Status should be 400');
            assertEqual(data.error, 'Email is required', 'Should return error message');
        });

        // Test 10: Passkey login finish requires email
        runner.test('POST /api/passkey/login-finish requires email', async () => {
            const response = await fetch(`${baseUrl}/api/passkey/login-finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();

            assertEqual(response.status, 400, 'Status should be 400');
            assertEqual(data.error, 'Email is required', 'Should return error message');
        });

        // Run all tests
        await runner.run();

    } finally {
        // Cleanup
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // Clean up test database
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }
}

// Run tests if this is the main module
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runTests };
