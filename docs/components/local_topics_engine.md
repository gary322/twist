# Local Topics Engine (`local_topics_engine.wasm`)

Language: Rust → WASM  •  Size: ~400 kB  •  Runs in: Browser Extension & Mobile SDK

---
## 1. Purpose
Privacy-preserving, client-side page classification that enables interest-based targeting without cookies or cross-site tracking. Maps visited pages to IAB-style categories entirely on-device, then creates daily rotating cohort claims signed by the hardware key.

---
## 2. Core Features
- **Zero server contact**: All classification happens locally
- **No browsing history**: Only category counts stored, not URLs
- **Daily rotation**: Cohort hashes change every 24h (unlinkable)
- **Hardware-bound**: Cohorts signed by same FIDO2 key as VAUs

---
## 3. Technical Architecture

### 3.1 Classification Model
```rust
// Lightweight ONNX model (~350 kB)
pub struct Classifier {
    model: ort::Session,
    tokenizer: BPE,
    categories: [Category; 350],
}

pub struct Category {
    id: u16,                    // IAB category ID
    name: &'static str,         // "Sports/Running"
    parent: Option<u16>,        // hierarchical
}
```

### 3.2 Input Features
- `origin` (domain only, no path)
- `<title>` tag content
- `<meta name="keywords">` content
- `<meta property="og:description">` if present
- First 200 chars of visible text

### 3.3 Storage Schema (IndexedDB)
```typescript
interface CategoryVisit {
    category_id: number;
    timestamp: number;
    confidence: number;  // 0.0-1.0
}

// Encrypted with device-only key
const STORE_NAME = "ahee_categories";
const DB_VERSION = 1;
```

---
## 4. Cohort Generation Process

### 4.1 Daily Aggregation (runs at 00:00 UTC)
```rust
fn generate_daily_cohort() -> CohortClaim {
    let visits = load_last_7_days();
    let category_scores = aggregate_by_category(visits);
    let top_n = select_top_categories(category_scores, MAX_CATEGORIES);
    
    CohortClaim {
        categories: top_n,  // max 3 categories
        day_index: days_since_epoch(),
        version: COHORT_VERSION,
    }
}
```

### 4.2 Privacy Guards
- **K-anonymity**: Drop categories with <0.2% global prevalence
- **Differential privacy**: Add Laplace noise (ε=1.0) to counts
- **Category limit**: Max 3 categories per cohort
- **No rare combos**: Reject cohorts with <1000 estimated peers

### 4.3 Cohort Signing
```javascript
// Before first VAU of session
const cohortData = await generateCohort();
const cohortHash = sha256(JSON.stringify(cohortData));

// Sign with hardware key
const signature = await navigator.credentials.get({
    publicKey: {
        challenge: cohortHash,
        allowCredentials: [{id: deviceKeyId, type: "public-key"}],
    }
});

// Attach to VAU
vau.cohort_hash = cohortHash;
vau.cohort_sig = signature;
```

---
## 5. Category Taxonomy (IAB Tech Lab v2.2)

Top-level categories (subset):
```
1. Arts & Entertainment
   1.1 Books & Literature
   1.2 Movies
   1.3 Music & Audio
   ...
7. Sports
   7.1 Auto Racing
   7.2 Baseball
   7.15 Running/Jogging
   ...
12. Shopping
   12.1 Apparel
   12.2 Footwear
   ...
```

Full 350-category mapping in `taxonomy.json`.

---
## 6. WASM Module API

### 6.1 Initialization
```javascript
import init, { TopicsEngine } from './local_topics_engine.wasm';

await init();
const engine = new TopicsEngine();
```

### 6.2 Page Classification
```javascript
const category = await engine.classify({
    origin: "https://example.com",
    title: "Best Running Shoes 2024",
    keywords: "marathon, nike, adidas",
    description: "Top picks for runners..."
});
// Returns: { id: 239, name: "Sports/Running", confidence: 0.87 }
```

### 6.3 Cohort Generation
```javascript
const cohort = await engine.generateCohort();
// Returns: { 
//   categories: [239, 301, 12], 
//   day_index: 19823,
//   version: 1
// }
```

---
## 7. Build & Distribution

### 7.1 Build Command
```bash
cd wasm/topics_engine
wasm-pack build --target web --out-dir pkg
# Optimizations
wasm-opt -O3 -o pkg/optimized.wasm pkg/local_topics_engine_bg.wasm
```

### 7.2 Size Budget
- WASM binary: 350 kB
- ONNX model: 40 kB (quantized)
- JS glue: 10 kB
- **Total**: ~400 kB

### 7.3 Loading Strategy
- Lazy load after extension install
- Cache in browser storage
- Background update every 30 days

---
## 8. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Model extraction | WASM obfuscation + integrity checks |
| Category manipulation | Signed model hash in manifest |
| Timing attacks | Constant-time category lookup |
| Storage tampering | IndexedDB encryption with device key |

---
## 9. Privacy Analysis

### 9.1 Information Leakage
- **Per cohort**: ≤ log₂(350³) = 26 bits (before k-anonymity)
- **After guards**: ≤ 15 bits (>30k possible cohorts)
- **Daily rotation**: Historical linking impossible

### 9.2 Differential Privacy
```rust
fn add_noise(count: f64) -> f64 {
    let laplace = Laplace::new(0.0, 1.0 / EPSILON);
    (count + laplace.sample()).max(0.0)
}
```

---
## 10. Testing

### 10.1 Unit Tests
```rust
#[wasm_bindgen_test]
fn test_classify_running_page() {
    let result = engine.classify(PageData {
        origin: "runnersworld.com",
        title: "Marathon Training",
        ..
    });
    assert_eq!(result.category_id, 239); // Sports/Running
}
```

### 10.2 Privacy Tests
- Cohort uniqueness across 100k synthetic users
- K-anonymity verification
- Noise distribution validation

### 10.3 Performance Benchmarks
- Classification: <5ms per page
- Cohort generation: <50ms
- Memory usage: <10MB

---
## 11. Integration Points

### 11.1 Browser Extension
```javascript
// content_script.js
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "classify_page") {
        const category = await classifyCurrentPage();
        await storeVisit(category);
    }
});
```

### 11.2 VAU Enhancement
```javascript
// When creating VAU
if (isFirstVAUOfSession()) {
    const cohort = await engine.generateCohort();
    vau.cohort_hash = cohort.hash;
    vau.cohort_sig = await signCohort(cohort);
}
```

---
## 12. Monitoring & Analytics

Metrics collected (locally only):
- Classification confidence distribution
- Category visit frequency
- Cohort generation time
- Model inference latency

No telemetry sent to servers.

---
## 13. Future Optimizations

1. **Model compression**: Quantization to int8 (→ 200kB)
2. **Federated learning**: Update model without seeing user data
3. **Multi-language support**: Tokenizers for non-English
4. **Mobile optimization**: Core ML / TFLite variants

---
End of file 