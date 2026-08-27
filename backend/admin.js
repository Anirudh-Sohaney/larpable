/**
 * LARPABLE — Admin Configuration
 * 
 * Hardcoded admin account for managing users and opportunities.
 * This account bypasses normal signup restrictions.
 */

const ADMIN_CONFIG = {
  username: 'larpable_a',
  password: 'larp6652able',
  role: 'admin',
  display_name: 'Admin'
};

/**
 * Check if credentials match the admin account
 * @param {string} username 
 * @param {string} password 
 * @returns {boolean}
 */
function isAdminCredentials(username, password) {
  return username === ADMIN_CONFIG.username && password === ADMIN_CONFIG.password;
}

/**
 * Get admin user data structure
 * @returns {Object}
 */
function getAdminUserData() {
  return {
    username: ADMIN_CONFIG.username,
    role: ADMIN_CONFIG.role,
    display_name: ADMIN_CONFIG.display_name
  };
}

module.exports = {
  ADMIN_CONFIG,
  isAdminCredentials,
  getAdminUserData
};
