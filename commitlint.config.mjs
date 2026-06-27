// Conventional Commits enforcement (commit-msg hook).
// Blocks commits whose message doesn't match the Conventional Commits spec.
export default {
  extends: ['@commitlint/config-conventional'],
};
