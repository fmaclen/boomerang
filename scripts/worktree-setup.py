"""Prepare a fresh Boomerang worktree.

T3 Code runs this after creating a worktree (see t3.json) with
T3CODE_WORKTREE_PATH set. It gives the checkout its own port slot, written to
.env (dev, the box the suite runs, and the demo's static site), installs
dependencies, and fetches the Chromium the suite runs in. Rerunning is safe:
an existing .env keeps its slot. Python rather than bash so it runs on
Windows too.
"""
import os
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

DEV_BASE = 5900
PREVIEW_BASE = 6900
SITE_BASE = 7900
SLOTS = range(1, 61)


def listening(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            return True
    return False


def claimed_ports(repo):
    ports = set()
    for env in (repo / ".worktrees").glob("*/.env"):
        for line in env.read_text(errors="replace").splitlines():
            m = re.fullmatch(r"PORT=(\d+)", line.strip())
            if m:
                ports.add(int(m.group(1)))
    return ports


def main():
    worktree = Path(os.environ.get("T3CODE_WORKTREE_PATH") or os.getcwd())
    os.chdir(worktree)
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    repo = Path(common).parent
    env = worktree / ".env"
    if not env.exists():
        claimed = claimed_ports(repo)
        for slot in SLOTS:
            dev, preview, site = DEV_BASE + slot, PREVIEW_BASE + slot, SITE_BASE + slot
            if dev in claimed or listening(dev) or listening(preview) or listening(site):
                continue
            env.write_text(f"PORT={dev}\nPREVIEW_PORT={preview}\nSITE_PORT={site}\n")
            break
        else:
            print("worktree-setup: no free port slot in 1..60", file=sys.stderr)
            return 1
    ports = dict(
        line.split("=", 1) for line in env.read_text().splitlines() if "=" in line
    )
    # A slot claimed before the site had a port gets the site's in the same slot.
    if "SITE_PORT" not in ports:
        ports["SITE_PORT"] = str(SITE_BASE + int(ports["PORT"]) - DEV_BASE)
        with env.open("a") as f:
            f.write(f"SITE_PORT={ports['SITE_PORT']}\n")
    if (worktree / "package.json").exists():
        bun = shutil.which("bun") or "bun"
        subprocess.run([bun, "install", "--frozen-lockfile"], check=True)
        subprocess.run([shutil.which("bunx") or "bunx", "playwright", "install", "chromium"], check=True)
    print(f"worktree ready: dev on {ports['PORT']}, box on {ports['PREVIEW_PORT']}, demo on {ports['SITE_PORT']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
