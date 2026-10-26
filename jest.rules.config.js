/** Jest config for Firestore rules tests (not CRA src/ tests). */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/security/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/security/jest.setup.js'],
};
