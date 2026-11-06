# Contributing

Thanks for helping. The most useful thing you can send is a detailed issue.

## Opening an issue

[Open an issue](https://github.com/fmaclen/boomerang/issues/new/choose) with
the bug report or feature request form. Triage starts from your report alone,
so a complete one gets worked on soonest. A good report:

- **reproduces.** Numbered steps from opening the page, so someone else sees the
  same thing.
- **says where it ran.** Version or image tag, browser and OS, box mode, and
  how the box is reached: directly, behind a reverse proxy, or through a tunnel.
- **shows it.** A screenshot or screen recording, and what the browser console
  printed.
- **describes the problem.** For a feature, what you were trying to do and
  what got in the way. A solution is welcome too, after the problem.

Setting up a box rather than reporting a bug? Start with the
[self-hosting guide](docs/self-hosting.md).

## Pull requests

Pull requests are welcome too, and I look at each one on its own. Link the
issue it fixes if there is one, say how you tested the change, and give the
pull request a [Conventional Commits](https://www.conventionalcommits.org/)
title (`fix:`, `feat:`, `docs:`, `chore:`). I squash-merge it under that
title, and the release notes come from those titles.
[`AGENTS.md`](AGENTS.md) covers running the page and its tests.

## Using an agent

Most issues here come from someone's agent, and that's welcome. Point it at
[`AGENTS.md`](AGENTS.md) and read the issue before it goes in.
