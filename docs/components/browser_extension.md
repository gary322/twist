# Chrome Extension (End-User GUI)

Stack: React 18 + TypeScript + Vite  •  MV3 manifest

---
## 1. Source Layout
```
/extension
  manifest.json
  src/
    popup/App.tsx
    content/badge.ts
    background/index.ts
    shared/portfolio.ts
    shared/flow_ws.ts
```

---
## 2. Manifest Highlights
```json
{
  "manifest_version": 3,
  "name": "AHEE Token Hub",
  "permissions": ["storage", "activeTab", "scripting"],
  "background": {"service_worker": "background/index.js"},
  "content_scripts": [{
     "matches": ["<all_urls>"],
     "js": ["content/badge.js"],
     "all_frames": false
  }],
  "action": {"default_popup": "popup/index.html"}
}
```

---
## 3. Content Script: badge.ts
* Inject Shadow DOM element.  
* WebSocket `wss://flow.ahee.xyz/flow/:siteHash` → receives `{r}` every 5 s.  
* Colour mapping: `r>0→green`, `r≈0→grey`, `r<0→red`.  
* On click opens popup.

---
## 4. Background Worker
* Listens for `chrome.runtime.onMessage({type:"vau"})` to sign VAU with hardware token via WebAuthn JS API `navigator.credentials.create` (resident key).  
* Sends VAU to Edge endpoint.  
* Polls Portfolio API every 60 s; caches in `chrome.storage.session`.

---
## 5. Popup React Components
| Component | Description | Hooks |
|-----------|-------------|-------|
| `BalanceBox` | AC-D live ticker (decay) | `useInterval` 1 s |
| `TokenTable` | fungible positions | `usePortfolio()` |
| `NFTCarousel` | BondNFTs, AL-NFTs | same API |
| `SearchBar` | calls `/search` endpoint | routing |

---
## 6. Security
* No private key kept; signs VAU via hardware token only.  
* CSP: `connect-src 'self' *.ahee.xyz`.

---
## 7. Build & Publish
```bash
cd extension && npm i && npm run build
zip -r ahee_ext.zip dist/
```
Upload to Chrome Web Store; CI builds on tag.

---
End of file 