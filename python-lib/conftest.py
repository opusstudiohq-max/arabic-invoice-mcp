"""
Pytest configuration: ensures tests can import arabic_invoice_mcp regardless of CWD.

Solves the case where editable installs fail with paths containing spaces, Arabic,
or special characters like '#' (used in some project folders).
"""
import sys
from pathlib import Path

# Add the src directory to sys.path so tests work even when editable install fails.
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))