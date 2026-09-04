#!/usr/bin/env python3
"""Merge the per-arch macOS channel files produced by two build jobs.

macOS update metadata has no arch component in its filename: electron-updater
asks every Mac for the same `<channel>-mac.yml` (Provider.getChannelFilePrefix
returns a bare "-mac", unlike Linux which gets an arch suffix). electron-builder
writes one channel file per invocation, so building x64 and arm64 in separate
jobs yields two files with the same name, and uploading both to a release means
one silently overwrites the other - leaving one architecture pointed at a binary
it cannot run.

This merges them: the `files` list from both is combined into the x64 copy, and
the arm64 copy is deleted so it cannot be uploaded. Merging `files` is the whole
job, because electron-updater reads that list and ignores the legacy top-level
path/sha512 whenever it is present (Provider.getFileList), and MacUpdater then
picks an entry per architecture by looking for "arm64" in the file name
(MacUpdater.filterFilesForArch).

Usage:  merge-mac-channel.py <x64-artifact-dir> <arm64-artifact-dir>
"""

import os
import subprocess
import sys

try:
    import yaml
except ImportError:  # runners do not all ship PyYAML
    _attempts = (
        ["--quiet", "pyyaml"],
        ["--quiet", "--user", "pyyaml"],
        ["--quiet", "--break-system-packages", "pyyaml"],
    )
    for _args in _attempts:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *_args])
            break
        except subprocess.CalledProcessError:
            continue
    try:
        import yaml
    except ImportError:
        sys.exit("PyYAML is required to merge the macOS channel files and could not be installed")


class _Loader(yaml.SafeLoader):
    """SafeLoader that leaves timestamps as strings.

    releaseDate must survive the round trip byte-for-byte; parsing it into a
    datetime and re-emitting would change its format.
    """


_Loader.yaml_implicit_resolvers = {
    ch: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for ch, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def merge(x64_dir, arm64_dir):
    if not os.path.isdir(x64_dir):
        sys.exit(f"x64 artifact directory not found: {x64_dir}")
    if not os.path.isdir(arm64_dir):
        sys.exit(f"arm64 artifact directory not found: {arm64_dir}")

    # generateUpdatesFilesForAllChannels means a pre-release build emits both
    # latest-mac.yml and <channel>-mac.yml, so merge every pair present.
    names = sorted(n for n in os.listdir(x64_dir) if n.endswith("-mac.yml"))

    if not names:
        sys.exit(f"no *-mac.yml files found in {x64_dir}")

    for name in names:
        x64_path = os.path.join(x64_dir, name)
        arm64_path = os.path.join(arm64_dir, name)

        if not os.path.exists(arm64_path):
            sys.exit(f"{name} exists for x64 but not for arm64 ({arm64_path})")

        with open(x64_path, encoding="utf-8") as fh:
            x64 = yaml.load(fh, Loader=_Loader)
        with open(arm64_path, encoding="utf-8") as fh:
            arm64 = yaml.load(fh, Loader=_Loader)

        if x64.get("version") != arm64.get("version"):
            sys.exit(
                f"{name}: version mismatch between architectures "
                f"({x64.get('version')} vs {arm64.get('version')})"
            )

        merged_files = list(x64.get("files") or [])
        seen = {entry.get("url") for entry in merged_files}

        for entry in arm64.get("files") or []:
            if entry.get("url") not in seen:
                merged_files.append(entry)
                seen.add(entry.get("url"))

        if not any("arm64" in (entry.get("url") or "") for entry in merged_files):
            sys.exit(f"{name}: merged file list contains no arm64 entry; arch selection would break")

        # Keep x64 as the base: its top-level path/sha512 stay the legacy
        # fallback, which is what an older updater without `files` support
        # would download, and x64 runs everywhere via Rosetta.
        x64["files"] = merged_files

        with open(x64_path, "w", encoding="utf-8") as fh:
            yaml.safe_dump(x64, fh, sort_keys=False, default_flow_style=False)

        os.remove(arm64_path)

        print(f"merged {name}: {len(merged_files)} files")
        for entry in merged_files:
            print(f"    {entry.get('url')}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    merge(sys.argv[1], sys.argv[2])
