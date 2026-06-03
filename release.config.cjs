/* eslint-disable no-template-curly-in-string */
/**
 * Semantic Release Configuration
 * 
 * This file is dynamic to support branch names with forward slashes (e.g., feat/something).
 * Semver does not allow slashes in pre-release tags, so we sanitize them here.
 */
const { execSync } = require('child_process');

let branch = 'main';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
} catch (error) {
  // Fallback for environments where git might not be available
  branch = process.env.GITHUB_REF_NAME || 'main';
}

// Sanitize branch name for Semver compatibility (replace / with -)
const sanitizedBranch = branch.replace(/\//g, '-');

module.exports = {
  branches: [
    "main",
    {
      // If we're on a feature or fix branch, inject it as a pre-release branch
      name: branch !== 'main' ? branch : 'non-existent-placeholder',
      prerelease: sanitizedBranch,
      channel: 'alpha'
    }
  ],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        "preset": "conventionalcommits",
        "parserOpts": {
          "noteKeywords": ["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING"]
        },
        "releaseRules": [
          { "type": "refactor", "release": "patch" },
          { "type": "docs", "scope": "README", "release": "patch" },
          { "type": "ci", "release": "patch" },
          { "scope": "no-release", "release": false }
        ]
      }
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        "preset": "conventionalcommits",
        "presetConfig": {
          "types": [
            { "type": "feat", "section": "✨ Features" },
            { "type": "fix", "section": "🐛 Bug Fixes" },
            { "type": "refactor", "section": "♻️ Refactoring", "hidden": false },
            { "type": "ci", "section": "🔧 CI/CD", "hidden": false },
            { "type": "docs", "section": "📝 Documentation", "hidden": false },
            { "type": "perf", "section": "🚀 Performance" }
          ]
        },
        "writerOpts": {
          "commitsSort": ["subject", "scope"],
          "linkCompare": false
        }
      }
    ],
    [
      "@semantic-release/npm",
      {
        "npmPublish": false
      }
    ],
    [
      "@semantic-release/exec",
      {
        "publishCmd": "yarn build:prod"
      }
    ],
    [
      "@semantic-release/github",
      {
        "assets": [
          {
            "path": "dist/*.user.js",
            "label": "IITC Plugin: Site Observer (User Script)"
          },
          {
            "path": "dist/*.meta.js",
            "label": "IITC Plugin: Site Observer (Meta Script)"
          }
        ]
      }
    ]
  ]
};
