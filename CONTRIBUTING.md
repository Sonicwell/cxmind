# Contributing to CXMind

Thank you for your interest in contributing to CXMind! This guide will help you get started.

## Code of Conduct

Be respectful, constructive, and professional. We're building something great together.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/cxmind.git`
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Make your changes
5. Run tests (see below)
6. Open a Pull Request

## Development Setup

```bash
# Start infrastructure
docker compose -f docker-compose.community.yml up -d mongo redis clickhouse

# Ingestion Engine (Go)
cd ie
go mod download
go test -v ./...
go run main.go

# Admin UI (React)
cd admin-ui
npm install
npx vitest run      # unit tests
npm run dev          # dev server at http://localhost:5173
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `ci`, `chore`

**Scopes**: `ie`, `au`, `copilot`, `sim`, `sniffer`, `local-ai`, `docs`, `deploy`

Examples:
```
feat(ie): add G.729 codec support
fix(au): prevent dashboard crash on empty data
docs(sniffer): add relay topology diagram
```

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Ensure CI passes before requesting review

## Module Structure

| Directory | Language | Tests |
|-----------|----------|-------|
| `ie/` | Go | `go test ./...` |
| `admin-ui/` | TypeScript/React | `npm test` |
| `copilot/` | TypeScript | `npm test` |
| `simulator/` | Go | `go test ./...` |
| `sniffer/` | Go | `go test ./...` |
| `mini-ai/` | Python | `pytest` |

## Reporting Issues

- Use [GitHub Issues](https://github.com/Sonicwell/cxmind/issues)
- Include: steps to reproduce, expected vs actual behavior, environment info
- For security vulnerabilities, email security@cxmi.ai instead

## License

By contributing, you agree that your contributions will be licensed under the BSL 1.1.
