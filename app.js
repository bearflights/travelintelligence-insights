const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Import shared authentication library
const {
    getGhostAPI,
    getEmailVerification,
    getPasskeyAuth,
    createSessionMiddleware,
    createAuthSession,
    destroySession
} = require('@bear/sso');

// Use Firestore for production (Cloud Run), fallback to SQLite for local dev
const USE_FIRESTORE = process.env.NODE_ENV === 'production' || process.env.USE_FIRESTORE === 'true';

// Conditionally require database layer
let passkeyQueries, challengeQueries, verificationCodeQueries;
if (USE_FIRESTORE) {
    const firestoreDb = require('@bear/sso/lib/firestore-db');
    passkeyQueries = firestoreDb.passkeyQueries;
    challengeQueries = firestoreDb.challengeQueries;
    verificationCodeQueries = firestoreDb.verificationCodeQueries;
} else {
    const sqliteDb = require('./lib/db');
    passkeyQueries = sqliteDb.passkeyQueries;
    challengeQueries = sqliteDb.challengeQueries;
    verificationCodeQueries = sqliteDb.verificationCodeQueries;
}

// Create Express app
function createApp(testMode = false) {
    const app = express();

    // Load environment variables
    if (testMode) {
        require('dotenv').config({ path: '.env.test' });
    } else {
        require('dotenv').config();
    }

    // Configuration
    const RP_ID = process.env.RP_ID || 'insights.travelintelligence.club';
    const RP_NAME = process.env.RP_NAME || 'Travel Intelligence Club Insights';
    const ORIGIN = process.env.ORIGIN || 'https://insights.travelintelligence.club';
    const GHOST_CONTENT_URL = process.env.GHOST_API_URL || 'https://insights.travelintelligence.club';
    const SSO_PROVIDER_URL = process.env.SSO_PROVIDER_URL || 'http://localhost:3001';

    // Labels that grant access to insights (configurable)
    const ALLOWED_LABELS = process.env.ALLOWED_LABELS
        ? process.env.ALLOWED_LABELS.split(',').map(l => l.trim())
        : ['builder', 'patron', 'buccaneer', 'explorer', 'insights-subscriber'];

    // Middleware
    app.use(cors({
        credentials: true,
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    app.use(express.json());

    // Session middleware (using shared library)
    app.use(createSessionMiddleware({
        secret: process.env.SESSION_SECRET || 'insights-secret-change-in-production',
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
    }));

    // Static file serving for auth pages
    app.use('/static', express.static(path.join(__dirname, 'public')));

    // Initialize shared library instances
    const emailVerification = testMode ? {
        generateCode: () => Math.floor(100000 + Math.random() * 900000).toString(),
        sendVerificationEmail: async (email, name, code) => {
            console.log(`[TEST] Sending email to ${email} with code ${code}`);
            return { messageId: 'test-message-id' };
        },
        storeCode: async (email, code, expiresAt) => {
            if (USE_FIRESTORE) {
                await verificationCodeQueries.storeCode(email, code, expiresAt);
            } else {
                verificationCodeQueries.storeCode(email, code, expiresAt);
            }
        },
        verifyCode: async (email, code) => {
            const storedData = USE_FIRESTORE
                ? await verificationCodeQueries.getCode(email)
                : verificationCodeQueries.getCode(email);

            if (!storedData || storedData.code !== code || storedData.expiresAt < Date.now()) {
                if (storedData && storedData.expiresAt < Date.now()) {
                    if (USE_FIRESTORE) {
                        await verificationCodeQueries.deleteCode(email);
                    } else {
                        verificationCodeQueries.deleteCode(email);
                    }
                }
                return false;
            }

            if (USE_FIRESTORE) {
                await verificationCodeQueries.deleteCode(email);
            } else {
                verificationCodeQueries.deleteCode(email);
            }
            return true;
        }
    } : getEmailVerification({
        brevoApiKey: process.env.BREVO_API_KEY,
        fromEmail: process.env.BREVO_FROM_EMAIL,
        fromName: process.env.BREVO_FROM_NAME || 'Travel Intelligence Club'
    });

    // Custom HTML template for verification emails
    const emailTemplate = (email, name, code, appName) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f5f5f5; padding: 40px; border-radius: 10px;">
                <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email</h2>
                <p style="font-size: 16px; color: #666; margin-bottom: 30px;">Hi ${name},</p>
                <p style="font-size: 16px; color: #666; margin-bottom: 20px;">Please use the verification code below to sign in to Travel Intelligence Club Insights:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <div style="background-color: #fff; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; border: 2px solid #333; display: inline-block;">
                        ${code}
                    </div>
                </div>
                <p style="font-size: 14px; color: #999; text-align: center;">This code will expire in 10 minutes.</p>
            </div>
        </div>
    `;

    // Initialize PasskeyAuth from shared library
    const passkeyAuth = getPasskeyAuth({
        rpName: RP_NAME,
        rpID: RP_ID,
        origin: ORIGIN
    });

    // Middleware to check if user is authenticated
    function requireAuth(req, res, next) {
        if (req.session && req.session.authenticated && req.session.userEmail) {
            return next();
        }

        // Redirect to SSO provider (bear.flights)
        const callbackUrl = `${ORIGIN}/auth/callback`;
        const ssoUrl = `${SSO_PROVIDER_URL}/auth?redirect=${encodeURIComponent(callbackUrl)}`;
        res.redirect(ssoUrl);
    }

    // Middleware to check if user has required labels
    function requireLabels(req, res, next) {
        if (!req.session || !req.session.userLabels) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to access this content.',
                redirectUrl: 'https://travelintelligence.club'
            });
        }

        const userLabels = req.session.userLabels || [];
        const hasAccess = userLabels.some(label => ALLOWED_LABELS.includes(label));

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You need to join Travel Intelligence Club to access insights.',
                redirectUrl: 'https://travelintelligence.club'
            });
        }

        next();
    }

    // ========================================
    // AUTH ROUTES
    // ========================================

    // Sign-in page
    app.get('/signin', (req, res) => {
        if (req.session && req.session.authenticated) {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, 'public', 'signin.html'));
    });

    // JWT SSO Callback - receives token from bear.flights
    app.get('/auth/callback', async (req, res) => {
        try {
            const { token } = req.query;

            if (!token) {
                return res.status(400).send('Missing authentication token');
            }

            // Verify token with SESSION_SECRET
            const sessionSecret = process.env.SESSION_SECRET || 'insights-secret-change-in-production';
            const decoded = jwt.verify(token, sessionSecret);

            // Check issuer
            if (decoded.iss !== 'bear.flights') {
                return res.status(401).send('Invalid token issuer');
            }

            // Create session using shared library helper
            createAuthSession(req, {
                email: decoded.email,
                name: decoded.name,
                labels: decoded.labels || []
            });

            // Redirect to homepage or original destination
            res.redirect('/');
        } catch (error) {
            console.error('SSO callback error:', error);
            res.status(500).send('Authentication failed');
        }
    });

    // Send verification code
    app.post('/api/auth/send-verification', async (req, res) => {
        try {
            const { email, name } = req.body;

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            // Check if user exists in Ghost
            const ghostAPI = getGhostAPI();
            const member = await ghostAPI.getMemberByEmail(email);

            if (!member) {
                return res.status(404).json({
                    error: 'User not found',
                    message: 'Please sign up at travelintelligence.club first',
                    redirectUrl: 'https://travelintelligence.club'
                });
            }

            // Generate and store verification code
            const code = emailVerification.generateCode();
            const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

            await emailVerification.storeCode(email, code, expiresAt);

            // Send email
            await emailVerification.sendVerificationEmail(email, name || member.name, code, {
                subject: 'Your Travel Intelligence Club Insights Verification Code',
                appName: 'Travel Intelligence Club Insights',
                htmlTemplate: emailTemplate
            });

            res.json({ success: true, message: 'Verification code sent' });
        } catch (error) {
            console.error('Error sending verification code:', error);
            res.status(500).json({ error: 'Failed to send verification code' });
        }
    });

    // Verify code and create session
    app.post('/api/auth/verify-code', async (req, res) => {
        try {
            const { email, code } = req.body;

            if (!email || !code) {
                return res.status(400).json({ error: 'Email and code are required' });
            }

            // Verify code using shared library
            const isValid = await emailVerification.verifyCode(email, code);

            if (!isValid) {
                return res.status(400).json({ error: 'Invalid or expired code' });
            }

            // Get user from Ghost
            const ghostAPI = getGhostAPI();
            const member = await ghostAPI.getMemberByEmail(email);

            if (!member) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Extract label names
            const userLabels = (member.labels || []).map(l => l.name);

            // Check if user has access
            const hasAccess = userLabels.some(label => ALLOWED_LABELS.includes(label));

            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You need to join Travel Intelligence Club to access insights.',
                    redirectUrl: 'https://travelintelligence.club',
                    userLabels
                });
            }

            // Create session using shared library helper
            createAuthSession(req, {
                email: member.email,
                name: member.name,
                labels: userLabels
            });

            res.json({
                success: true,
                message: 'Authentication successful',
                user: {
                    email: member.email,
                    name: member.name,
                    labels: userLabels
                }
            });
        } catch (error) {
            console.error('Error verifying code:', error);
            res.status(500).json({ error: 'Failed to verify code' });
        }
    });

    // ========================================
    // PASSKEY ROUTES
    // ========================================

    // Start passkey registration
    app.post('/api/passkey/register-start', async (req, res) => {
        try {
            if (!req.session || !req.session.authenticated) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const { email, userName } = req.body;
            const userEmail = email || req.session.userEmail;
            const displayName = userName || req.session.userName || userEmail;

            // Use PasskeyAuth to generate registration options
            const options = await passkeyAuth.generateRegistration(userEmail, displayName);

            res.json(options);
        } catch (error) {
            console.error('Error generating registration options:', error);
            res.status(500).json({ error: 'Failed to start passkey registration' });
        }
    });

    // Finish passkey registration
    app.post('/api/passkey/register-finish', async (req, res) => {
        try {
            if (!req.session || !req.session.authenticated) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const { email, credential } = req.body;
            const userEmail = email || req.session.userEmail;

            // Use PasskeyAuth to verify and store registration
            const result = await passkeyAuth.verifyRegistration(userEmail, credential);

            if (result.verified) {
                res.json({ success: true, message: 'Passkey registered successfully' });
            } else {
                res.status(400).json({ error: 'Failed to verify passkey registration' });
            }
        } catch (error) {
            console.error('Error finishing passkey registration:', error);
            res.status(500).json({ error: 'Failed to complete passkey registration' });
        }
    });

    // Start passkey authentication
    app.post('/api/passkey/login-start', async (req, res) => {
        try {
            const { email } = req.body;

            // Email is optional - if not provided, use discoverable credentials
            const options = await passkeyAuth.generateAuthentication(email || null);

            res.json(options);
        } catch (error) {
            console.error('Error generating authentication options:', error);
            res.status(500).json({ error: error.message || 'Failed to start passkey authentication' });
        }
    });

    // Finish passkey authentication
    app.post('/api/passkey/login-finish', async (req, res) => {
        try {
            const { email, credential } = req.body;

            // Email is optional - the credential itself contains the user email
            const result = await passkeyAuth.verifyAuthentication(email || null, credential);

            if (!result.verified) {
                return res.status(400).json({ error: 'Failed to verify passkey' });
            }

            // Get user from Ghost
            const ghostAPI = getGhostAPI();
            const member = await ghostAPI.getMemberByEmail(result.email);

            if (!member) {
                return res.status(404).json({ error: 'User not found in system' });
            }

            // Extract label names
            const userLabels = (member.labels || []).map(l => l.name);

            // Check if user has access
            const hasAccess = userLabels.some(label => ALLOWED_LABELS.includes(label));

            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You need to join Travel Intelligence Club to access insights.',
                    redirectUrl: 'https://travelintelligence.club',
                    userLabels
                });
            }

            // Create session using shared library helper
            createAuthSession(req, {
                email: member.email,
                name: member.name,
                labels: userLabels
            });

            res.json({
                success: true,
                message: 'Authentication successful',
                user: {
                    email: member.email,
                    name: member.name,
                    labels: userLabels
                }
            });
        } catch (error) {
            console.error('Error finishing passkey authentication:', error);
            res.status(500).json({ error: 'Failed to complete passkey authentication' });
        }
    });

    // Logout
    app.post('/api/auth/logout', async (req, res) => {
        try {
            await destroySession(req, res);
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Logout failed' });
        }
    });

    // Check auth status
    app.get('/api/auth/status', (req, res) => {
        if (req.session && req.session.authenticated) {
            res.json({
                authenticated: true,
                user: {
                    email: req.session.userEmail,
                    name: req.session.userName,
                    labels: req.session.userLabels
                }
            });
        } else {
            res.json({ authenticated: false });
        }
    });

    // ========================================
    // GHOST CONTENT PROXY
    // ========================================

    // Proxy all other requests to Ghost CMS (with auth check)
    app.use('/', requireAuth, requireLabels, async (req, res) => {
        try {
            // Build Ghost URL
            const ghostUrl = `${GHOST_CONTENT_URL}${req.path}`;

            // Forward request to Ghost
            const response = await axios({
                method: req.method,
                url: ghostUrl,
                headers: {
                    ...req.headers,
                    host: new URL(GHOST_CONTENT_URL).host,
                },
                params: req.query,
                data: req.body,
                responseType: 'stream',
                validateStatus: () => true, // Don't throw on any status
            });

            // Copy status
            res.status(response.status);

            // Check if response is HTML
            const contentType = response.headers['content-type'] || '';
            const isHtml = contentType.includes('text/html');

            if (isHtml) {
                // Collect HTML content to inject SSO client
                let htmlContent = '';

                response.data.on('data', (chunk) => {
                    htmlContent += chunk.toString();
                });

                response.data.on('end', () => {
                    // Inject BearSSO client script before </body>
                    const ssoScript = `
    <script src="${SSO_PROVIDER_URL}/sso-client.js"></script>
    <script>
        BearSSO.init({
            authProvider: '${SSO_PROVIDER_URL}',
            onAuthChange: (user) => {
                if (!user) {
                    // User logged out on bear.flights, redirect to trigger SSO
                    console.log('[BearSSO] User logged out, redirecting...');
                    window.location.href = '/';
                }
            },
            debug: true
        });
    </script>
</body>`;

                    const modifiedHtml = htmlContent.replace('</body>', ssoScript);

                    // Set headers
                    Object.keys(response.headers).forEach(key => {
                        // Skip some headers that shouldn't be forwarded
                        if (!['connection', 'transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
                            res.set(key, response.headers[key]);
                        }
                    });

                    // Update content-length
                    res.set('content-length', Buffer.byteLength(modifiedHtml));

                    // Send modified HTML
                    res.send(modifiedHtml);
                });

                response.data.on('error', (err) => {
                    console.error('Error reading Ghost response:', err);
                    res.status(502).json({ error: 'Failed to fetch content' });
                });
            } else {
                // For non-HTML responses, stream as before
                Object.keys(response.headers).forEach(key => {
                    // Skip some headers that shouldn't be forwarded
                    if (!['connection', 'transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
                        res.set(key, response.headers[key]);
                    }
                });

                // Stream response
                response.data.pipe(res);
            }
        } catch (error) {
            console.error('Error proxying to Ghost:', error);
            res.status(502).json({ error: 'Failed to fetch content' });
        }
    });

    return app;
}

// Start server if run directly
if (require.main === module) {
    const app = createApp();
    const PORT = process.env.PORT || 3002;

    app.listen(PORT, () => {
        console.log(`🔐 Insights Travel Intelligence Club server running on port ${PORT}`);
        console.log(`📍 Sign in at: http://localhost:${PORT}/signin`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📦 Database: ${USE_FIRESTORE ? 'Firestore' : 'SQLite'}`);
    });
}

module.exports = { createApp };
