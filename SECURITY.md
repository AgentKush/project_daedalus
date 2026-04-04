# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Project Daedalus, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Use [GitHub Security Advisories](https://github.com/AgentKush/project_daedalus/security/advisories/new) to report the vulnerability privately.
3. Alternatively, contact the maintainers directly via the [Icarus Modding Discord](https://discord.gg/linkarus-icarus-modding-936621749733302292).

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Security Measures

This project uses the following security tools:

- **Dependabot** — automatic alerts and PRs for vulnerable dependencies
- **Secret scanning** — detects accidentally committed secrets and API keys
- **Push protection** — blocks pushes that contain secrets
- **CodeQL** — static analysis for common vulnerability patterns in Ruby and JavaScript
- **bundle-audit** — Ruby gem vulnerability scanning in CI

## Best Practices for Contributors

- Never commit secrets, API keys, or credentials to the repository
- Firebase credentials belong in Rails encrypted credentials (`rails credentials:edit`), not in code
- Environment variables (e.g., `ADMIN_PASSWORD`) should be set in the deployment environment, not in `.env` files committed to the repo
- Keep dependencies up to date — review Dependabot PRs promptly
