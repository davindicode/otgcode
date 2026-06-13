# Security Policy

## Supported Versions

OTG Code is in early (alpha) development. Only the latest released version
receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1.0 | ❌        |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Report privately via GitHub's [security advisories](https://github.com/davindicode/otgcode/security/advisories/new),
or email the maintainer at davidliurc@gmail.com.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (or a proof of concept)
- The version / commit affected

You can expect an initial response within a few days. Once a fix is available,
it will be released and the advisory published.

## Scope Note

OTG Code exposes a local development server over a Cloudflare quick tunnel.
Quick tunnels are public, unauthenticated URLs — treat any tunnel you start as
internet-exposed and do not run it on untrusted networks or leave it running
unattended.
