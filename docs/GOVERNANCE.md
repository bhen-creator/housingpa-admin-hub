# Source and Deployment Governance

This repository separates source hardening from repository administration and production authority.

## Owner decisions

- Repository visibility is an owner or repository-administrator decision. Source work must not make the repository public or private.
- Branch protection, required status checks, review rules, and force-push restrictions are repository-administrator decisions.
- Commit-signing requirements and the trusted signing identities are owner or repository-administrator decisions.
- Deployment approval, provider credentials, domain routing, DNS, and production changes require separately documented deployment authority.

## Source workflow

- Hardening work should use a dedicated branch and pass the locked install, type-check, complete test suite, build, production-output scan, and production dependency audit.
- A successful source review means the source is ready for a separate deployment review. It does not authorize a push, pull request, deployment, DNS change, provider action, or production configuration change.
- Verification evidence must not contain passwords, API keys, session tokens, private attachment content, or full environment files.

No GitHub settings, deployment settings, provider credentials, or production routes are changed by this document.
