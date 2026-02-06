# CI / Test Harness

Tools: GitHub Actions + Foundry (for Solana via `anchor-test`) + ESLint/Jest for TS

---
## 1. Goals
* Compile & run unit tests for all Solana programs (`cargo test-bpf`).
* End-to-end integration on localnet with Edge → Aggregator → Root flow.
* Lint + type-check all TS/React code.
* Docker build off-chain services.

---
## 2. Workflow Overview (.github/workflows/ci.yml)
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    services:
      solana:
        image: solanalabs/solana:v1.17
        ports: [8899]
    steps:
      - uses: actions/checkout@v4
      - uses: Swatinem/rust-cache@v2
      - name: setup solana cli
        run: solana-keygen new --no-bip39-passphrase -s

      - name: build programs
        run: cargo build-bpf --workspace

      - name: unit tests
        run: cargo test --workspace

      - name: anchor integration
        run: anchor test --script tests/e2e.ts

      - name: ts lint
        run: npm ci && npm run lint

      - name: build edge worker
        run: cd edge_worker && npm i && npm run build

      - name: docker builds
        run: docker compose -f docker-compose.ci.yml build
```

---
## 3. Integration Test `tests/e2e.ts`
Steps:
1. Spin devnet validator.
2. Deploy programs via Anchor IDL.
3. Simulate 10 VAUs → ensure root committed.
4. Run `split_treasury` local execution.
5. Trigger `pid_crank`, `buyback` mocks.
6. Assert supply equation invariant.

---
## 4. Code Coverage
Use `cargo tarpaulin` for Rust coverage, Jest for TS. Fail CI if <80 %.

---
## 5. Static Analysis
* `cargo clippy -- -D warnings`  
* `npm run tsc --noEmit`  
* Dependabot weekly.

---
End of file 