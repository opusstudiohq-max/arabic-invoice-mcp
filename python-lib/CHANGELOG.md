# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-07-06

### Added
- **Decimal arithmetic transition**: Rewrote all internal financial calculations, invoice totals, and VAT calculations in `arabic_invoice_mcp/server.py` and `saudi_vat_pro.py` to use `decimal.Decimal` arithmetic to avoid floating-point inaccuracies.
- **Strict TLV & ISO-8601 validation**: Added strict input validation for Tag-Length-Value (TLV) generation and ZATCA QR codes, including validating the 15-digit VAT number format (must start and end with 3) and ISO-8601 UTC timestamps.
- **Unified ValueError handling**: Handled input validation errors by consistently raising clear, structured `ValueError`s, ensuring robustness when integrated with Claude or other external MCP clients.
- **ZATCA QR Code Generator** (`zatca_qr.py`) — Phase 1 (B2C) compliant TLV + Base64
- `generate_zatca_qr` MCP tool — creates QR base64 data + image
- `hash_invoice_for_zatca` MCP tool — sha256/384/512 for Phase 2 (B2B)
- `create_zatca_compliant_invoice` MCP tool — combines invoice + QR in one call
- **Arabic Date Converter MCP Server** (`date_converter.py`) — 8 tools for Hijri↔Gregorian conversion, age calc, business days, Islamic events (uses `hijridate` 2.6.0 — Umm al-Qura calendar)
- **Saudi VAT Calculator Pro** (`saudi_vat_pro.py`) — 6 advanced VAT tools (VAT history, excise tax, GOSI, reverse charge, period summary)
- `conftest.py` — fixes import issues in paths with special characters
- Auto-detect `OUTPUT` path in PDF/XLSX generators (was hardcoded)
- Full bilingual contract (Arabic primary + English summaries)
- CI/CD with GitHub Actions
- Comprehensive test suite (**156 tests**, all passing)
- Type hints for all functions
- Optional `[qr]` extra: `pip install arabic-invoice-mcp[qr]`
- Optional `[dev]` extra: pytest, mypy, ruff, black
- **PyPI Trusted Publishing workflow** (`.github/workflows/publish.yml`) — two-job pattern with OIDC, TestPyPI first, manual approval for production
- **Pre-publish version check script** (`scripts/check_version.py`) — validates PEP 440, version sync, CHANGELOG entry
- **PyPI setup guide** (`docs/PYPI_SETUP_GUIDE.md`) — step-by-step for Trusted Publishing configuration
- `MANIFEST.in` — explicit file inclusion for sdist builds
- **Discord community setup** (`community/discord/`) — server template, rules, Python bot, setup guide
- **Real Estate template pack** (`deployment-kit/templates/real-estate/`) — 3 templates: rental contract (DOCX), property listing (PDF), commission invoice (XLSX)

### Fixed
- **Tafgeet grammar bug**: "هللة" no longer gets spurious tanween alif ("هللةاً" → "هللة")
- **Chinese character typo** in `outreach-templates.md` line 307 (响应 → رد)
- **Hardcoded paths** in PDF/XLSX generators — now auto-detect via `Path(__file__).parent`
- **Editable install** fails when path has `#`, spaces, or Arabic chars — now uses `pythonpath = ["src"]` in pyproject.toml
- Tests were failing to import due to path issues — now fixed via conftest.py

### Changed
- **pyproject.toml**: Added dev tools config (black, ruff, mypy, pytest)
- **Classifiers**: Updated to "5 - Production/Stable"
- **Keywords**: Added qr-code, e-invoice, fastmcp, etc.
- README sections reorganized for better discoverability

## [1.0.0] - 2026-07-03

### Added
- Initial release
- 7 MCP tools (tafgeet, convert, VAT, invoice, format, list currencies, list VAT rates)
- Support for 5 Arabic currencies (SAR, EGP, AED, USD, KWD)
- 7 Arab country VAT rates
- 25+ pytest tests
- Arabic grammar engine for tafgeet
- Dual-language README (Arabic + English)
- Deployment kit: PDF guide, DOCX contract, XLSX CRM, marketing materials

[Unreleased]: https://github.com/opusstudiohq-max/arabic-invoice-mcp/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/opusstudiohq-max/arabic-invoice-mcp/compare/v1.0.0...v3.0.0
[1.0.0]: https://github.com/opusstudiohq-max/arabic-invoice-mcp/releases/tag/v1.0.0