#!/usr/bin/env node

/**
 * Test script to verify BearSSO client integration
 *
 * This script verifies:
 * 1. SSO provider (bear.flights) is accessible
 * 2. BearSSO client library files are served
 * 3. HTML responses include the BearSSO script injection
 */

const axios = require('axios');

const SSO_PROVIDER_URL = process.env.SSO_PROVIDER_URL || 'http://localhost:3001';
const INSIGHTS_URL = process.env.INSIGHTS_URL || 'http://localhost:3004';

// ANSI color codes
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = '') {
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${name}`, color);
    if (details) {
        console.log(`   ${details}`);
    }
}

async function runTests() {
    log('\n🧪 BearSSO Integration Tests\n', 'bold');

    let allPassed = true;

    // Test 1: Check SSO provider health
    try {
        const response = await axios.get(`${SSO_PROVIDER_URL}/api/auth/status`, {
            timeout: 5000
        });
        logTest('SSO Provider health check', response.status === 200);
    } catch (error) {
        logTest('SSO Provider health check', false, `Error: ${error.message}`);
        allPassed = false;
    }

    // Test 2: Check BearSSO client library is accessible
    try {
        const response = await axios.get(`${SSO_PROVIDER_URL}/sso-client.js`, {
            timeout: 5000
        });
        const hasContent = response.data.includes('BearSSO');
        logTest('BearSSO client library accessible', response.status === 200 && hasContent);
    } catch (error) {
        logTest('BearSSO client library accessible', false, `Error: ${error.message}`);
        allPassed = false;
    }

    // Test 3: Check sso-check.html is accessible
    try {
        const response = await axios.get(`${SSO_PROVIDER_URL}/sso-check.html`, {
            timeout: 5000
        });
        const hasContent = response.data.includes('postMessage');
        logTest('SSO check page accessible', response.status === 200 && hasContent);
    } catch (error) {
        logTest('SSO check page accessible', false, `Error: ${error.message}`);
        allPassed = false;
    }

    // Test 4: Check insights service is accessible
    try {
        const response = await axios.get(`${INSIGHTS_URL}/signin`, {
            timeout: 5000,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });
        logTest('Insights service accessible', response.status === 200);
    } catch (error) {
        if (error.response && error.response.status === 302) {
            logTest('Insights service accessible', true, 'Redirects to SSO (expected)');
        } else {
            logTest('Insights service accessible', false, `Error: ${error.message}`);
            allPassed = false;
        }
    }

    // Test 5: Verify BearSSO script injection (requires authentication)
    log('\n⚠️  Note: Full HTML injection test requires authentication', 'yellow');
    log('   To verify BearSSO integration:', 'yellow');
    log('   1. Login at http://localhost:3001', 'yellow');
    log('   2. Visit http://localhost:3004', 'yellow');
    log('   3. Open browser console and check for BearSSO logs', 'yellow');
    log('   4. The page should include: <script src="http://localhost:3001/sso-client.js"></script>', 'yellow');

    log('\n' + '='.repeat(60), 'blue');
    if (allPassed) {
        log('\n✅ All automated tests passed!', 'green');
        log('\n📝 Manual Testing Steps:', 'bold');
        log('1. Open http://localhost:3001 in your browser', 'blue');
        log('2. Login with passkey or email verification', 'blue');
        log('3. Open http://localhost:3004 in the same browser', 'blue');
        log('4. You should be automatically logged in via SSO', 'blue');
        log('5. Open browser DevTools console and look for [BearSSO] logs', 'blue');
        log('6. In another tab, logout from http://localhost:3001', 'blue');
        log('7. Wait ~60 seconds (BearSSO check interval)', 'blue');
        log('8. The http://localhost:3004 tab should detect logout and redirect', 'blue');
        process.exit(0);
    } else {
        log('\n❌ Some tests failed', 'red');
        log('Please check the errors above and ensure both servers are running.', 'yellow');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    process.exit(1);
});
