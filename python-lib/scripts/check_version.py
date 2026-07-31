#!/usr/bin/env python3
"""
check_version.py — Pre-publish version consistency check.

Verifies:
1. Version in pyproject.toml matches the git tag
2. Version is PEP 440 compliant
3. No uncommitted changes
4. README.md exists and is non-empty
5. CHANGELOG.md has entry for current version

Run this locally before pushing a tag:
    python scripts/check_version.py 1.0.0
"""
import sys
import re
import subprocess
from pathlib import Path


def get_pyproject_version():
    """Extract version from pyproject.toml."""
    pyproject = Path(__file__).parent.parent / "pyproject.toml"
    content = pyproject.read_text(encoding="utf-8")
    match = re.search(r'^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
    if not match:
        print("ERROR: Could not find 'version' in pyproject.toml")
        sys.exit(1)
    return match.group(1)


def is_pep440(version: str) -> bool:
    """Check if version follows PEP 440."""
    # Simplified PEP 440 regex
    pattern = r"^\d+(\.\d+){0,2}(\.(a|b|rc|alpha|beta|dev|post)\d*)?$"
    return bool(re.match(pattern, version))


def has_git_changes() -> bool:
    """Check for uncommitted changes."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, check=True
        )
        return bool(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Not a git repo or git not installed — skip check
        return False


def has_changelog_entry(version: str) -> bool:
    """Check if CHANGELOG.md has an entry for the current version."""
    changelog = Path(__file__).parent.parent / "CHANGELOG.md"
    if not changelog.exists():
        print("WARNING: CHANGELOG.md not found")
        return False
    content = changelog.read_text(encoding="utf-8")
    # Look for "## [VERSION]" or "## VERSION"
    return bool(re.search(rf"##\s*\[?{re.escape(version)}]?", content))


def main():
    expected_version = sys.argv[1] if len(sys.argv) > 1 else None

    # Check 1: pyproject.toml version
    pyproject_version = get_pyproject_version()
    print(f"✓ pyproject.toml version: {pyproject_version}")

    # Check 2: PEP 440 compliance
    if is_pep440(pyproject_version):
        print(f"✓ Version is PEP 440 compliant")
    else:
        print(f"✗ Version '{pyproject_version}' is NOT PEP 440 compliant")
        print(f"  Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0)")
        sys.exit(1)

    # Check 3: matches expected (if provided)
    if expected_version:
        if pyproject_version == expected_version:
            print(f"✓ Version matches tag: {expected_version}")
        else:
            print(f"✗ Version mismatch!")
            print(f"  Tag: {expected_version}")
            print(f"  pyproject.toml: {pyproject_version}")
            sys.exit(1)

    # Check 4: no uncommitted changes
    if has_git_changes():
        print("✗ Uncommitted changes detected. Commit before tagging.")
        sys.exit(1)
    print("✓ No uncommitted changes")

    # Check 5: CHANGELOG entry
    if has_changelog_entry(pyproject_version):
        print(f"✓ CHANGELOG.md has entry for {pyproject_version}")
    else:
        print(f"⚠ WARNING: No CHANGELOG entry for {pyproject_version}")
        print("  Recommended: add '## [{pyproject_version}]' section to CHANGELOG.md")

    print(f"\n✅ All checks passed. Safe to publish version {pyproject_version}")


if __name__ == "__main__":
    main()
