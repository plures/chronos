# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes    |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in `@plures/chronos`, email **security@plures.dev** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code if applicable)
- Any suggested remediation

We aim to acknowledge reports within **72 hours** and will work with you on a responsible disclosure timeline. Once a fix is released, we will credit you in the release notes unless you prefer to remain anonymous.

## Scope

Vulnerabilities in scope include:

- Issues in `src/` that could lead to data exposure or code execution
- Dependency vulnerabilities in direct dependencies (`@plures/praxis` and above)
- Supply-chain concerns (typosquatting, compromised packages)

Out of scope: theoretical issues with no practical exploit path, issues in `devDependencies` only used during development.
