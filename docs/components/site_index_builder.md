# Site Index Builder (`site_index_builder.py`)

Language: Python 3.11  •  Dependencies: `solana-py`, `sentence-transformers`, `supabase-py`

---
## 1. Purpose
Generate and continuously update a full-text + embedding index of all registered sites/products so that the extension & Telegram bot can provide natural-language search for reward opportunities.

---
## 2. Data Sources
| Source | Account | Fields |
|--------|---------|--------|
| Solana | `site_registry` PDA | `site_hash`, `url`, `owner`, `bonded`, `baseline_reward` |
| IPFS / Arweave | `site_metadata.json` | `title`, `description`, `logo` |

---
## 3. Processing Steps
1. **Fetch new sites** via `getProgramAccounts(site_registry)` with memcmp `since_slot`.  
2. For each new `site_hash`, download `site_metadata.json` (max 4 kB).  
3. Run description through Sentence-BERT `all-MiniLM-L6-v2` to generate 384-d embedding.  
4. Upsert row into Supabase `site_index` table.

Schema:
```sql
CREATE TABLE site_index (
  site_hash TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  url TEXT,
  baseline_reward NUMERIC,
  embedding VECTOR(384)
);
```
Supabase vector extension used for ANN search.

---
## 4. Schedule
* Initial full sync on first run.  
* Then poll every 5 min for new registry entries.

---
## 5. Docker & Deployment
* Dockerfile with poetry install.  
* Run on Cloud Run, 512 MB RAM.

---
## 6. API Used by Extension / Bot
Supabase REST already exposes `/rpc/match_sites(query text, k int)` which returns top-k matches ordered by cosine distance.

---
## 7. Monitoring
* Cloud Run logs exported to Grafana; metric `embeddings_created_total`.

---
End of file 