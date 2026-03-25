# Contributing to Chronos

Thank you for your interest in contributing to `@plures/chronos`! This document describes the process for reporting issues, proposing changes, and getting your contributions merged.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Code Style](#code-style)

## Code of Conduct

All contributors are expected to adhere to the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct. Be respectful and constructive in all interactions.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/chronos.git
   cd chronos
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Verify the setup** by running the test suite:
   ```bash
   npm run test:run
   ```

## Development Workflow

1. Create a **feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes. Keep commits small and focused.
3. Add or update tests for any changed behaviour (see [Testing Guidelines](#testing-guidelines)).
4. Run the test suite and ensure it is green:
   ```bash
   npm run test:run
   ```
5. Push your branch and open a pull request against `main`.

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature or behaviour |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Tooling, dependencies, configuration |
| `test:` | Adding or updating tests |
| `refactor:` | Code change with no functional impact |
| `ci:` | CI/CD workflow changes |

Example: `feat: add context-filter option to queryByContext()`

Squash-merge is preferred — your PR title becomes the final commit message, so make it meaningful.

## Pull Request Process

1. Ensure all tests pass (`npm run test:run`).
2. Update `docs/api.md` if you changed any public API surface.
3. Add an entry in `CHANGELOG.md` under `[Unreleased]`.
4. Fill in the PR template (description, motivation, testing notes).
5. Request a review from a maintainer.

PRs that add new public exports must include:
- Updated `package.json#exports` if a new entrypoint is added
- JSDoc on all exported functions/types
- A new test file or additions to an existing one in `tests/`

## Testing Guidelines

- Tests live in `tests/` and use [Vitest](https://vitest.dev/).
- Every public function must have at least one unit test.
- Tests must not call real network services or external APIs.
- Use in-memory stubs/mocks for PluresDB interactions.
- Run tests in watch mode during development:
  ```bash
  npm test
  ```

## Code Style

- **ESM only** — no `require()`, no CommonJS.
- **Strict TypeScript-compatible JSDoc** — annotate all exported functions with `@param` and `@returns` tags.
- Keep functions small and pure where possible.
- No default exports — use named exports only.
- Follow the patterns already established in `src/` (see e.g. `src/query.js` for a reference module).

If you have questions, open a [GitHub Discussion](https://github.com/plures/chronos/discussions) or leave a comment on the relevant issue.
