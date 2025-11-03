/**
 * Bear SSO Client Library
 *
 * Provides automatic Single Sign-On across Bear ecosystem domains.
 * Supports both shared cookie (for *.bear.flights) and silent iframe (for external domains).
 *
 * Usage:
 *   <script src="https://bear.flights/sso-client.js"></script>
 *   <script>
 *     BearSSO.init({
 *       authProvider: 'https://bear.flights',
 *       onAuthChange: (user) => {
 *         if (user) {
 *           console.log('User authenticated:', user);
 *         } else {
 *           console.log('User not authenticated');
 *         }
 *       }
 *     });
 *   </script>
 */

(function(window) {
    'use strict';

    const BearSSO = {
        config: {
            authProvider: 'https://bear.flights',
            checkInterval: 60000, // Check every minute
            iframeTimeout: 5000, // 5 second timeout for iframe check
            debug: false
        },

        authState: {
            authenticated: false,
            user: null,
            token: null,
            lastCheck: null
        },

        callbacks: {
            onAuthChange: null,
            onLogout: null
        },

        /**
         * Initialize the SSO client
         * @param {Object} options - Configuration options
         * @param {string} options.authProvider - URL of auth provider (default: https://bear.flights)
         * @param {Function} options.onAuthChange - Callback when auth state changes
         * @param {Function} options.onLogout - Callback when user logs out
         * @param {boolean} options.debug - Enable debug logging
         */
        init: function(options = {}) {
            this.config = { ...this.config, ...options };
            this.callbacks.onAuthChange = options.onAuthChange || null;
            this.callbacks.onLogout = options.onLogout || null;

            this.log('BearSSO initialized', this.config);

            // Check if we're on a *.bear.flights subdomain
            const isBearSubdomain = window.location.hostname.endsWith('.bear.flights') ||
                                   window.location.hostname === 'bear.flights';

            if (isBearSubdomain) {
                this.log('Running on Bear subdomain - using direct API check');
                this.checkAuthDirect();
            } else {
                this.log('Running on external domain - using iframe check');
                this.checkAuthIframe();
            }

            // Set up periodic auth check
            setInterval(() => {
                if (isBearSubdomain) {
                    this.checkAuthDirect();
                } else {
                    this.checkAuthIframe();
                }
            }, this.config.checkInterval);

            // Listen for logout events from other tabs/windows
            window.addEventListener('storage', (e) => {
                if (e.key === 'bear_sso_logout' && e.newValue) {
                    this.log('Logout event detected from another tab');
                    this.handleLogout(true);
                }
            });
        },

        /**
         * Check authentication status directly (for *.bear.flights domains)
         */
        checkAuthDirect: async function() {
            try {
                const response = await fetch(`${this.config.authProvider}/api/auth/status`, {
                    credentials: 'include', // Include cookies
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                this.updateAuthState(data.authenticated, data.user, null);
            } catch (error) {
                this.log('Error checking auth status:', error);
                this.updateAuthState(false, null, null);
            }
        },

        /**
         * Check authentication status via hidden iframe (for external domains)
         */
        checkAuthIframe: function() {
            return new Promise((resolve, reject) => {
                // Create hidden iframe
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = `${this.config.authProvider}/sso-check.html`;

                let timeout;
                let messageReceived = false;

                // Listen for postMessage from iframe
                const messageHandler = (event) => {
                    // Verify origin
                    if (event.origin !== this.config.authProvider) {
                        return;
                    }

                    messageReceived = true;
                    clearTimeout(timeout);

                    this.log('Received SSO check response:', event.data);

                    if (event.data.type === 'BEAR_SSO_CHECK') {
                        this.updateAuthState(
                            event.data.authenticated,
                            event.data.user,
                            event.data.token
                        );
                        resolve(event.data);
                    }

                    // Clean up
                    window.removeEventListener('message', messageHandler);
                    if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                    }
                };

                window.addEventListener('message', messageHandler);

                // Set timeout
                timeout = setTimeout(() => {
                    if (!messageReceived) {
                        this.log('SSO check timeout');
                        window.removeEventListener('message', messageHandler);
                        if (iframe.parentNode) {
                            document.body.removeChild(iframe);
                        }
                        this.updateAuthState(false, null, null);
                        reject(new Error('SSO check timeout'));
                    }
                }, this.config.iframeTimeout);

                // Add iframe to DOM
                document.body.appendChild(iframe);
            });
        },

        /**
         * Update authentication state and trigger callbacks
         */
        updateAuthState: function(authenticated, user, token) {
            const wasAuthenticated = this.authState.authenticated;

            this.authState.authenticated = authenticated;
            this.authState.user = user;
            this.authState.token = token;
            this.authState.lastCheck = Date.now();

            // Trigger callback if state changed
            if (wasAuthenticated !== authenticated) {
                this.log('Auth state changed:', authenticated ? 'authenticated' : 'not authenticated');

                if (this.callbacks.onAuthChange) {
                    this.callbacks.onAuthChange(user);
                }
            }
        },

        /**
         * Get current authentication state
         * @returns {Object} Current auth state
         */
        getAuthState: function() {
            return { ...this.authState };
        },

        /**
         * Get user data if authenticated
         * @returns {Object|null} User data or null
         */
        getUser: function() {
            return this.authState.user;
        },

        /**
         * Check if user is authenticated
         * @returns {boolean} True if authenticated
         */
        isAuthenticated: function() {
            return this.authState.authenticated;
        },

        /**
         * Get JWT token (for external domains)
         * @returns {string|null} JWT token or null
         */
        getToken: function() {
            return this.authState.token;
        },

        /**
         * Redirect to Bear login page
         * @param {string} returnUrl - URL to return to after login
         */
        login: function(returnUrl) {
            const returnTo = returnUrl || window.location.href;
            const authUrl = `${this.config.authProvider}/auth?redirect=${encodeURIComponent(returnTo)}`;
            this.log('Redirecting to login:', authUrl);
            window.location.href = authUrl;
        },

        /**
         * Logout user from all domains
         */
        logout: async function() {
            try {
                // Call logout endpoint
                const response = await fetch(`${this.config.authProvider}/api/auth/logout`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                this.log('Logout successful:', data);

                // Broadcast logout to other tabs
                localStorage.setItem('bear_sso_logout', Date.now().toString());
                localStorage.removeItem('bear_sso_logout'); // Clean up immediately

                this.handleLogout(false);
            } catch (error) {
                this.log('Error during logout:', error);
                // Even if API fails, clear local state
                this.handleLogout(false);
            }
        },

        /**
         * Handle logout (local or from broadcast)
         * @param {boolean} fromBroadcast - Whether this is from another tab
         */
        handleLogout: function(fromBroadcast) {
            this.updateAuthState(false, null, null);

            if (this.callbacks.onLogout) {
                this.callbacks.onLogout(fromBroadcast);
            }

            // Clear any local session data
            try {
                sessionStorage.clear();
            } catch (e) {
                this.log('Error clearing session storage:', e);
            }
        },

        /**
         * Log debug messages
         */
        log: function(...args) {
            if (this.config.debug) {
                console.log('[BearSSO]', ...args);
            }
        }
    };

    // Expose to window
    window.BearSSO = BearSSO;

})(window);
