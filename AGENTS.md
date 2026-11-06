# Boomerang

A self-hosted speed test. One container serves the page and the endpoints it
measures against.

## Reporting a bug or asking for a feature

Open an issue. The forms in `.github/ISSUE_TEMPLATE/` list what a report
needs: `bug.yml` for a bug, `feature.yml` for a feature request. Answer every
field, so the report stands on its own without a follow-up question.

- Search the existing issues first, open and closed. If one fits, add to it.
- Reproduce the bug if you can, and note what the browser console prints.
- Filing from the command line skips the form, so use its field labels as
  headings in the issue.
- Add screenshots or a recording for anything visible on the page.

## Sending a change

Pull requests are welcome, and each one is looked at on its own. Link the
issue it fixes if there is one, and say how you tested it.

Run `python3 scripts/worktree-setup.py` once after cloning. It installs
dependencies with Bun and writes the ports the page and tests use to `.env`.
Commands are in `package.json`, and `bun run test` runs the test suite.
Commit the screenshots and clips it updates.

Commits and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`,
`docs:`, `chore:`).

## Setting up a box

Follow [`docs/self-hosting.md`](docs/self-hosting.md).
