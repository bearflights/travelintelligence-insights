# insights.travelintelligence.club - Authentication Gateway

Authentication gateway for Travel Intelligence Club Insights powered by Ghost CMS.

## Overview

This service adds authentication gating to insights.travelintelligence.club, requiring users to sign in before accessing Ghost CMS content. It supports both email verification and passkey (WebAuthn) authentication.

## Features

- **Auth Gating**: All content requires authentication
- **Email Verification**: 6-digit code sent via Brevo
- **Passkey Auth**: Modern passwordless authentication using WebAuthn
- **Role-Based Access**: Uses Ghost labels to control access (builder, patron, explorer, etc.)
- **Ghost Integration**: Verifies users against Ghost CMS member database
- **Reverse Proxy**: Transparently proxies authenticated requests to Ghost
- **Firestore/SQLite**: Production uses Firestore, development uses SQLite

## Architecture

```
User Request
    ↓
[Auth Middleware]
    ↓
Not Authenticated? → /signin page
    ↓
Email Verification OR Passkey Auth
    ↓
Check Ghost Member + Labels
    ↓
Has Required Labels? → Create Session → Proxy to Ghost
    ↓
No Access? → Redirect to travelintelligence.club
```

## Installation

```bash
# Install dependencies
npm install

# Note: better-sqlite3 requires build tools (xcode-select on macOS)
# If you encounter installation issues, use Firestore instead (set USE_FIRESTORE=true)

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

## Environment Configuration

### Required Variables

```env
# Ghost CMS
GHOST_ADMIN_API_KEY=your-ghost-api-key
GHOST_API_URL=https://insights.travelintelligence.club

# Brevo Email
BREVO_API_KEY=your-brevo-key
BREVO_FROM_EMAIL=info@travelintelligence.club
BREVO_FROM_NAME=Travel Intelligence Club

# WebAuthn
RP_ID=insights.travelintelligence.club
RP_NAME=Travel Intelligence Club Insights
ORIGIN=https://insights.travelintelligence.club

# Session
SESSION_SECRET=your-strong-secret

# Access Control (comma-separated Ghost labels)
ALLOWED_LABELS=builder,patron,buccaneer,explorer,insights-subscriber
```

## Running Locally

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Access at: http://localhost:3002

## User Flow

### 1. Email Verification Flow
1. User visits insights.travelintelligence.club
2. Not authenticated → Redirected to /signin
3. User enters email
4. 6-digit code sent to email
5. User enters code
6. System checks Ghost for member
7. System checks if user has required labels
8. If authorized → Create session
9. Redirect to homepage (proxied to Ghost)

### 2. Passkey Authentication Flow
1. User visits /signin
2. Clicks "Sign In with Passkey"
3. Browser prompts for Touch ID/Face ID
4. System verifies passkey
5. System checks Ghost member + labels
6. If authorized → Create session
7. Redirect to homepage

### 3. Access Denied Flow
- User not in Ghost → Redirect to travelintelligence.club for registration
- User in Ghost but no required labels → Redirect to travelintelligence.club

## API Endpoints

### Authentication
- `POST /api/auth/send-verification` - Send verification code
- `POST /api/auth/verify-code` - Verify code and create session
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/logout` - End session

### Passkey Management
- `POST /api/passkey/register-start` - Begin passkey registration
- `POST /api/passkey/register-finish` - Complete passkey registration
- `POST /api/passkey/login-start` - Begin passkey authentication
- `POST /api/passkey/login-finish` - Complete passkey authentication

### Content Proxy
- `/*` (all other routes) - Proxy to Ghost CMS (requires authentication)

## Deployment

### Cloud Run (Production)

```bash
# Ensure you're authenticated with GCP
gcloud auth login

# Set project
gcloud config set project ticnyc-website

# Deploy
gcloud builds submit --config cloudbuild.yaml
```

The deployment will:
1. Build Docker container
2. Push to Container Registry
3. Deploy to Cloud Run service: `insights-travelintelligence-site`
4. Configure environment variables
5. Pull secrets from Secret Manager

### Environment Variables (Production)

Set in cloudbuild.yaml:
- `NODE_ENV=production`
- `USE_FIRESTORE=true`
- `RP_ID=insights.travelintelligence.club`
- `ORIGIN=https://insights.travelintelligence.club`
- `GHOST_API_URL=https://insights.travelintelligence.club`

Secrets from Secret Manager:
- `SESSION_SECRET`
- `BREVO_API_KEY`
- `GHOST_ADMIN_API_KEY`
- `BREVO_FROM_EMAIL`
- `BREVO_FROM_NAME`

### Domain Mapping

After deployment, map the domain:

```bash
gcloud beta run domain-mappings create \
  --service insights-travelintelligence-site \
  --domain insights.travelintelligence.club \
  --region us-central1
```

Update DNS:
- Type: CNAME
- Name: insights
- Value: ghs.googlehosted.com

## Access Control

Users need one of the following Ghost labels to access content:
- `builder`
- `patron`
- `buccaneer`
- `explorer`
- `insights-subscriber`

Configure via `ALLOWED_LABELS` environment variable.

## Database

### Development (SQLite)
- Database file: `auth.db`
- Tables: `passkeys`, `challenges`, `verification_codes`
- Automatic schema creation

### Production (Firestore)
- Project: `ticnyc-website`
- Collections: `passkeys`, `challenges`, `verification_codes`
- Automatic via service account

## Security

- HTTPS required in production (for passkeys)
- Session cookies: HttpOnly, Secure (prod)
- Session duration: 7 days
- Verification codes: 10-minute expiry
- Passkey challenges: 10-minute expiry
- CORS: Configured for auth endpoints

## Troubleshooting

### User Can't Sign In
1. Check if user exists in Ghost: https://insights.travelintelligence.club/ghost/
2. Verify user has required label
3. Check server logs for auth errors

### Passkey Not Working
- Requires HTTPS in production
- Requires modern browser with WebAuthn support
- Domain must match RP_ID

### Email Not Sending
- Check Brevo API key
- Check Brevo account status
- Check server logs for email errors

### Proxy Errors
- Check GHOST_API_URL is correct
- Verify Ghost instance is accessible
- Check network connectivity

## Development Notes

- Port 3002 (avoid conflicts with other services)
- Hot reload with nodemon: `npm run dev`
- SQLite for local development (no GCP credentials needed)
- Test with Ghost staging instance if available

## Related Services

- **Ghost CMS**: insights.travelintelligence.club (content management)
- **Main Site**: travelintelligence.club (user registration)
- **Shared Database**: Ghost members database

## Implementation Details

- Built with Express.js
- Proxies requests to Ghost using axios
- Auth check on every request
- Label-based access control
- Supports email + passkey authentication
- Session-based auth (not JWT)

## Linear Ticket

**B-77**: [SSO-4] Add authentication gating to insights.travelintelligence.club

Related:
- SSO-2, SSO-3 (similar auth implementations)
- SSO-5 (travelintelligence.club waitlist)

---

**Last Updated**: 2025-10-29
**Service**: insights-travelintelligence-site (Cloud Run)
**Domain**: insights.travelintelligence.club
**Project**: ticnyc-website (GCP)

