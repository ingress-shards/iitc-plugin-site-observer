/* eslint-disable no-template-curly-in-string */
module.exports = {
  branches: ["main"],
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
        "publishCmd": "yarn build:dev && yarn build:prod"
      }
    ],
    [
      "@semantic-release/github",
      {
        "assets": [
          {
            "path": "dist/!(*.dev).user.js",
            "label": "IITC Plugin: Site Observer (User Script)"
          },
          {
            "path": "dist/!(*.dev).meta.js",
            "label": "IITC Plugin: Site Observer (Meta Script)"
          },
          {
            "path": "dist/*.dev.user.js",
            "label": "IITC Plugin: Site Observer (Dev User Script)"
          },
          {
            "path": "dist/*.dev.meta.js",
            "label": "IITC Plugin: Site Observer (Dev Meta Script)"
          }
        ]
      }
    ]
  ]
};
