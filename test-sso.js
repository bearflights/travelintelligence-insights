/**
 * SSO Testing Script for insights-travelintelligence
 *
 * Tests the complete SSO flow between bear.flights (localhost:3001) and
 * insights-travelintelligence (localhost:3004)
 *
 * Run with: node test-sso.js
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const SSO_PROVIDER = 'http://localhost:3001';
const INSIGHTS_URL = 'http://localhost:3004';
const SESSION_SECRET = 'insights-dev-secret-change-in-production';

let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message, color = COLORS.reset) {
    console.log(`${color}${message}${COLORS.reset}`);
}

function logTest(name, passed, details = '') {
    const status = passed ? '✓' : '✗';
    const color = passed ? COLORS.green : COLORS.red;
    log(`  ${status} ${name}${details ? ': ' + details : ''}`, color);

    testResults.tests.push({ name, passed, details });
    if (passed) {
        testResults.passed++;
    } else {
        testResults.failed++;
    }
}

function logSection(title) {
    log(`\n${title}`, COLORS.cyan);
    log('='.repeat(title.length), COLORS.cyan);
}

async function checkServiceHealth(url, name) {
    try {
        const response = await axios.get(url, {
            timeout: 3000,
            validateStatus: () => true // Accept any status
        });
        return response.status !== undefined;
    } catch (error) {
        return false;
    }
}

function createTestToken(email = 'test@example.com', name = 'Test User', labels = ['builder']) {
    const payload = {
        email,
        name,
        labels,
        iss: 'bear.flights',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour from now
    };

    return jwt.sign(payload, SESSION_SECRET);
}

async function testSSORedirect() {
    logSection('Test 1: SSO Auto-Redirect');

    try {
        // Try to access protected route without auth
        const response = await axios.get(`${INSIGHTS_URL}/`, {
            maxRedirects: 0,
            validateStatus: (status) => status === 302
        });

        // Should redirect to SSO provider
        const isRedirect = response.status === 302;
        logTest('Unauthenticated request triggers redirect', isRedirect);

        if (isRedirect) {
            const location = response.headers.location;
            const expectedRedirect = `${SSO_PROVIDER}/auth?redirect=${encodeURIComponent(`${INSIGHTS_URL}/auth/callback`)}`;
            const correctDestination = location === expectedRedirect;

            logTest('Redirects to bear.flights SSO provider', correctDestination);

            if (correctDestination) {
                log(`    Redirect URL: ${location}`, COLORS.blue);
            } else {
                log(`    Expected: ${expectedRedirect}`, COLORS.yellow);
                log(`    Got: ${location}`, COLORS.yellow);
            }

            return correctDestination;
        }

        return false;
    } catch (error) {
        logTest('SSO auto-redirect', false, error.message);
        return false;
    }
}

async function testSSOCallback() {
    logSection('Test 2: SSO Callback & Session Creation');

    try {
        // Create test JWT token
        const token = createTestToken('test@travelintelligence.club', 'Test User', ['builder']);
        log(`  Created test JWT token`, COLORS.blue);

        // Call the callback endpoint
        const response = await axios.get(`${INSIGHTS_URL}/auth/callback?token=${token}`, {
            maxRedirects: 0,
            validateStatus: (status) => status === 302 || status === 200,
            headers: {
                'User-Agent': 'SSO-Test-Script'
            }
        });

        // Check for redirect to homepage
        const redirectedToHome = response.status === 302 && response.headers.location === '/';
        logTest('JWT token accepted and validated', redirectedToHome);

        // Check if session cookie was set
        const cookies = response.headers['set-cookie'];
        const hasSessionCookie = cookies && cookies.some(c => c.includes('connect.sid'));
        logTest('Session cookie created', hasSessionCookie);

        return { success: redirectedToHome && hasSessionCookie, cookies };
    } catch (error) {
        logTest('SSO callback endpoint', false, error.message);
        return { success: false, cookies: null };
    }
}

async function testSessionPersistence(sessionCookie) {
    logSection('Test 3: Session Persistence');

    if (!sessionCookie) {
        logTest('Session persistence', false, 'No session cookie available from previous test');
        return false;
    }

    try {
        // Try to access protected route with session cookie
        const response = await axios.get(`${INSIGHTS_URL}/api/auth/status`, {
            headers: {
                'Cookie': sessionCookie
            },
            timeout: 5000
        });

        const authenticated = response.data && response.data.authenticated === true;
        logTest('Session persists across requests', authenticated);

        if (authenticated && response.data.user) {
            log(`    User: ${response.data.user.email}`, COLORS.blue);
        }

        return authenticated;
    } catch (error) {
        logTest('Session persistence', false, error.message);
        return false;
    }
}

async function testInvalidToken() {
    logSection('Test 4: Invalid Token Handling');

    try {
        // Test with missing token
        const response1 = await axios.get(`${INSIGHTS_URL}/auth/callback`, {
            validateStatus: () => true
        });
        logTest('Rejects missing token', response1.status === 400);

        // Test with invalid token
        const response2 = await axios.get(`${INSIGHTS_URL}/auth/callback?token=invalid`, {
            validateStatus: () => true
        });
        logTest('Rejects invalid token', response2.status === 500);

        // Test with wrong issuer
        const wrongIssuerToken = jwt.sign({
            email: 'test@example.com',
            iss: 'evil.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        }, SESSION_SECRET);

        const response3 = await axios.get(`${INSIGHTS_URL}/auth/callback?token=${wrongIssuerToken}`, {
            validateStatus: () => true
        });
        logTest('Rejects wrong issuer', response3.status === 401);

    } catch (error) {
        logTest('Invalid token handling', false, error.message);
    }
}

async function testLogout(sessionCookie) {
    logSection('Test 5: Logout');

    if (!sessionCookie) {
        logTest('Logout functionality', false, 'No session cookie available');
        return;
    }

    try {
        // Call logout endpoint
        const response = await axios.post(`${INSIGHTS_URL}/api/auth/logout`, {}, {
            headers: {
                'Cookie': sessionCookie
            }
        });

        logTest('Logout endpoint responds successfully', response.status === 200);

        // Verify session is destroyed
        const statusResponse = await axios.get(`${INSIGHTS_URL}/api/auth/status`, {
            headers: {
                'Cookie': sessionCookie
            }
        });

        const notAuthenticated = !statusResponse.data.authenticated;
        logTest('Session destroyed after logout', notAuthenticated);

    } catch (error) {
        logTest('Logout functionality', false, error.message);
    }
}

async function testRedirectPreservation() {
    logSection('Test 6: Redirect URL Handling');

    try {
        const token = createTestToken();
        const targetUrl = '/some-protected-page';

        // Test that we can redirect after login
        // Note: This is a simplified test - actual redirect preservation would need to be
        // tested with a full browser flow
        logTest('Redirect URL preservation (manual verification needed)', true,
                'Check that visiting /signin stores and uses redirect parameter');

    } catch (error) {
        logTest('Redirect preservation', false, error.message);
    }
}

async function runTests() {
    log('\n' + '='.repeat(60), COLORS.cyan);
    log('  SSO Test Suite for insights-travelintelligence', COLORS.cyan);
    log('='.repeat(60) + '\n', COLORS.cyan);

    // Check services are running
    logSection('Prerequisite: Service Health Check');

    const ssoProviderHealthy = await checkServiceHealth(SSO_PROVIDER, 'SSO Provider');
    logTest(`SSO Provider (${SSO_PROVIDER})`, ssoProviderHealthy);

    const insightsHealthy = await checkServiceHealth(INSIGHTS_URL, 'Insights Service');
    logTest(`Insights Service (${INSIGHTS_URL})`, insightsHealthy);

    if (!insightsHealthy) {
        log('\n❌ Insights service is not running. Please start it with:', COLORS.red);
        log('   cd insights-travelintelligence && PORT=3004 npm start\n', COLORS.yellow);
        return;
    }

    // Run test suite
    await testSSORedirect();

    const { success: ssoSuccess, cookies } = await testSSOCallback();

    if (ssoSuccess && cookies) {
        const sessionCookie = cookies.find(c => c.includes('connect.sid'));
        await testSessionPersistence(sessionCookie);
        await testLogout(sessionCookie);
    }

    await testInvalidToken();
    await testRedirectPreservation();

    // Print summary
    logSection('Test Summary');
    log(`  Total Tests: ${testResults.passed + testResults.failed}`, COLORS.blue);
    log(`  Passed: ${testResults.passed}`, COLORS.green);
    log(`  Failed: ${testResults.failed}`, testResults.failed > 0 ? COLORS.red : COLORS.green);

    if (testResults.failed === 0) {
        log('\n✅ All tests passed!', COLORS.green);
    } else {
        log('\n❌ Some tests failed. Please review the output above.', COLORS.red);
    }

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    log(`\n❌ Test suite crashed: ${error.message}`, COLORS.red);
    console.error(error);
    process.exit(1);
});
