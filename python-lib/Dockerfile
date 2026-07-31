# ==========================================
# Stage 1: Build wheel
# ==========================================
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN pip install --no-cache-dir --upgrade pip && \
    pip wheel --no-cache-dir --wheel-dir /build/wheels .[qr]

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Install runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzbar0 \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels from builder and install them
COPY --from=builder /build/wheels /app/wheels
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir /app/wheels/*.whl && \
    rm -rf /app/wheels

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash mcp && chown -R mcp:mcp /app
USER mcp

# Healthcheck to verify the package is installed and executable
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import arabic_invoice_mcp.server" || exit 1

ENTRYPOINT ["python", "-m", "arabic_invoice_mcp.server"]