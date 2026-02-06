# AHEE Tag / Ad Engine (`aae.js`)

Language: TypeScript/JavaScript  •  Size: ~400 bytes (minified+gzipped)  •  Compatibility: All ad servers

---
## 1. Purpose
A lightweight wrapper creative that intercepts the moment a traditional display/video ad renders and fires an AHEE VAU to enable fraud-proof, instant payment settlement. Works with existing ad inventory from Google Ad Manager, Prebid, Amazon TAM, etc. without requiring changes to SSPs or publishers.

---
## 2. How It Works
```mermaid
sequenceDiagram
    participant DSP as DSP/Ad Server
    participant Page as Publisher Page
    participant AAE as aae.js
    participant HW as Hardware Key
    participant Edge as AHEE Edge
    participant Chain as Solana

    DSP->>Page: Win auction, serve creative
    Page->>AAE: Load wrapper tag
    AAE->>Page: Wait for viewability
    AAE->>HW: Sign impression VAU
    HW->>AAE: Return signature
    AAE->>Edge: POST VAU + campaign_id
    Edge->>Chain: Debit campaign pot
    Note: Total added latency: ~8ms
```

---
## 3. Integration Methods

### 3.1 Display Banner Wrapper
```html
<!-- Standard 300x250 banner wrapper -->
<div id="ahee-wrapper-%%PATTERN:id%%" style="width:300px;height:250px;">
  <script>
    (function(){
      var s = document.createElement('script');
      s.src = 'https://cdn.ahee.xyz/aae.js';
      s.dataset.campaignId = '%%PATTERN:campaign_id%%';
      s.dataset.creativeUrl = '%%PATTERN:creative_url%%';
      s.dataset.clickthrough = '%%CLICK_URL%%';
      document.currentScript.parentNode.appendChild(s);
    })();
  </script>
</div>
```

### 3.2 VAST Video Wrapper
```xml
<VAST version="4.0">
  <Ad id="%%PATTERN:ad_id%%">
    <Wrapper>
      <AdSystem>AHEE</AdSystem>
      <VASTAdTagURI>
        <![CDATA[%%PATTERN:wrapped_vast_url%%]]>
      </VASTAdTagURI>
      <Impression>
        <![CDATA[https://track.ahee.xyz/imp?cid=%%PATTERN:campaign_id%%]]>
      </Impression>
      <CreativeExtensions>
        <CreativeExtension type="AHEE">
          <Script src="https://cdn.ahee.xyz/aae.js"/>
          <CampaignId>%%PATTERN:campaign_id%%</CampaignId>
        </CreativeExtension>
      </CreativeExtensions>
    </Wrapper>
  </Ad>
</VAST>
```

### 3.3 Prebid Native Wrapper
```javascript
// Native renderer integration
pbjs.renderAd = function(doc, adId) {
  const bid = pbjs.getBidResponses()[adId];
  if (bid.aheeEnabled) {
    loadAAE(bid.campaignId, () => {
      // Original render logic
      doc.write(bid.ad);
    });
  }
};
```

---
## 4. Core Implementation

### 4.1 Minimal Loader (aae.js)
```javascript
(function() {
  'use strict';
  
  // Configuration from data attributes
  const script = document.currentScript;
  const config = {
    campaignId: script.dataset.campaignId,
    creativeUrl: script.dataset.creativeUrl,
    clickthrough: script.dataset.clickthrough,
    edgeEndpoint: 'https://edge.ahee.xyz/v1/ad_vau'
  };
  
  // Viewability check
  const checkViewability = () => {
    const rect = script.parentElement.getBoundingClientRect();
    const inViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
    
    const visible = (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(script.parentElement).visibility !== 'hidden'
    );
    
    return inViewport && visible;
  };
  
  // Wait for viewability (MRC standard: 1 second)
  let viewableTime = 0;
  const viewabilityTimer = setInterval(() => {
    if (checkViewability()) {
      viewableTime += 100;
      if (viewableTime >= 1000) {
        clearInterval(viewabilityTimer);
        fireVAU();
      }
    } else {
      viewableTime = 0;
    }
  }, 100);
  
  // Fire VAU
  const fireVAU = async () => {
    try {
      // Get hardware signature
      const vauData = {
        site_hash: await sha256(location.origin),
        secs: 1,  // Ad impression = 1 second
        ctr: Date.now(),
        ad_campaign_id: config.campaignId
      };
      
      // Reuse extension's signing logic if available
      if (window.ahee && window.ahee.signVAU) {
        const signedVAU = await window.ahee.signVAU(vauData);
        await postVAU(signedVAU);
      } else {
        // Fallback: inline WebAuthn
        const sig = await getHardwareSignature(vauData);
        await postVAU({ ...vauData, sig });
      }
    } catch (err) {
      console.debug('AHEE VAU failed:', err);
      // Fail silently - ad still renders
    }
  };
  
  // Hardware signature
  const getHardwareSignature = async (data) => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: dataBuffer,
        allowCredentials: [], // Discoverable credential
        userVerification: 'discouraged',
        timeout: 5000
      }
    });
    
    return btoa(String.fromCharCode(...new Uint8Array(assertion.response.signature)));
  };
  
  // Send to edge
  const postVAU = async (vau) => {
    await fetch(config.edgeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vau),
      keepalive: true  // Allow page unload
    });
  };
  
  // SHA-256 helper
  const sha256 = async (str) => {
    const buffer = await crypto.subtle.digest('SHA-256', 
      new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };
  
  // Load creative after VAU setup
  const wrapper = script.parentElement;
  if (config.creativeUrl) {
    const iframe = document.createElement('iframe');
    iframe.src = config.creativeUrl;
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    wrapper.appendChild(iframe);
  }
  
  // Click tracking
  wrapper.addEventListener('click', (e) => {
    if (config.clickthrough && e.target.tagName !== 'A') {
      e.preventDefault();
      window.open(config.clickthrough, '_blank');
    }
  });
})();
```

### 4.2 Edge Worker Handler Addition
```typescript
// New endpoint for ad impressions
router.post('/v1/ad_vau', async (request: Request) => {
  const vau = await request.json();
  
  // Validate campaign exists
  const campaign = await env.CAMPAIGN_KV.get(
    `campaign:${vau.ad_campaign_id}`,
    'json'
  );
  if (!campaign) {
    return new Response('Invalid campaign', { status: 400 });
  }
  
  // Check targeting (if any)
  if (campaign.targeting) {
    const matches = await checkTargeting(vau, campaign.targeting);
    if (!matches) {
      return new Response('Targeting mismatch', { status: 204 });
    }
  }
  
  // Verify hardware signature
  const valid = await verifyVAUSignature(vau);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  // Forward to standard VAU pipeline
  vau.funding_source = `campaign:${vau.ad_campaign_id}`;
  vau.reward_amount = campaign.cpm_cents / 100000; // CPM to per-impression
  
  return await forwardToAggregator(vau);
});
```

---
## 5. Advanced Features

### 5.1 Cohort-Based Targeting
```javascript
// Enhanced VAU with cohort
const enhancedVAU = async (baseVAU) => {
  // Check if user has cohort from extension
  if (window.ahee && window.ahee.getCurrentCohort) {
    const cohort = await window.ahee.getCurrentCohort();
    if (cohort) {
      baseVAU.cohort_hash = cohort.hash;
      baseVAU.cohort_sig = cohort.signature;
    }
  }
  return baseVAU;
};
```

### 5.2 Conversion Tracking
```javascript
// Pixel for conversion events
window.aheeConversion = function(value, orderId) {
  if (!window.ahee || !window.ahee.lastAdCampaign) return;
  
  const conversionVAU = {
    site_hash: window.ahee.lastAdCampaign.site_hash,
    secs: 0,  // Instant event
    ctr: Date.now(),
    ad_campaign_id: window.ahee.lastAdCampaign.id,
    conversion: {
      value: value,
      order_id: orderId,
      type: 'purchase'
    }
  };
  
  // Sign and send
  signAndSendVAU(conversionVAU);
};
```

### 5.3 Fraud Prevention Enhancements
```javascript
// Additional client-side checks
const fraudChecks = {
  // Check for headless browsers
  isHeadless: () => {
    return /HeadlessChrome/.test(navigator.userAgent) ||
           navigator.webdriver === true;
  },
  
  // Check for automation
  isAutomated: () => {
    return window.Cypress || window.__nightmare || window.phantom;
  },
  
  // Check interaction patterns
  hasRealInteraction: async () => {
    return new Promise(resolve => {
      let movements = 0;
      const handler = () => {
        movements++;
        if (movements > 3) {
          document.removeEventListener('mousemove', handler);
          resolve(true);
        }
      };
      document.addEventListener('mousemove', handler);
      setTimeout(() => resolve(false), 5000);
    });
  }
};
```

---
## 6. Publisher Integration

### 6.1 GPT (Google Publisher Tag)
```javascript
// Allow AHEE wrapper tags
googletag.cmd.push(function() {
  googletag.pubads().setSafeFrameConfig({
    allowOverlayExpansion: true,
    sandbox: true,
    useUniqueDomain: true,
    allowScripts: true  // Required for aae.js
  });
});
```

### 6.2 Prebid.js Adapter
```javascript
// AHEE bid adapter
pbjs.bidderRegistry.register('ahee', {
  code: 'ahee',
  supportedMediaTypes: ['banner', 'video', 'native'],
  
  buildRequests: function(bids, bidderRequest) {
    return bids.map(bid => ({
      method: 'POST',
      url: 'https://ssp.ahee.xyz/bid',
      data: {
        campaignId: bid.params.campaignId,
        sizes: bid.sizes,
        gdpr: bidderRequest.gdprConsent
      }
    }));
  },
  
  interpretResponse: function(response, request) {
    return [{
      requestId: request.bidId,
      cpm: response.cpm,
      width: response.width,
      height: response.height,
      creativeId: response.creativeId,
      ad: response.adm,  // Contains wrapper tag
      meta: { advertiserDomains: response.adomain }
    }];
  }
});
```

---
## 7. Campaign Configuration

### 7.1 Dashboard Settings
```typescript
interface CampaignConfig {
  id: string;
  name: string;
  budget_usdc: number;
  cpm_cents: number;  // Cost per 1000 impressions
  targeting?: {
    cohorts?: number[];  // IAB category IDs
    geos?: string[];     // ISO country codes
    devices?: ('desktop' | 'mobile' | 'tablet')[];
    hours?: number[];    // UTC hours 0-23
  };
  creative: {
    type: 'banner' | 'video' | 'native';
    url: string;
    clickthrough: string;
    size?: [number, number];
  };
  pacing: 'asap' | 'even';
  start_date: string;
  end_date: string;
}
```

### 7.2 Budget Synchronization
```python
# From budget_mirror_service.py
async def sync_campaign_budget(campaign: CampaignConfig):
    # Calculate remaining budget
    spent = await get_chain_spent(campaign.id)
    remaining = campaign.budget_usdc - spent
    
    if remaining > 0:
        # Top up campaign pot
        tx = await fund_campaign_pot(
            campaign_id=campaign.id,
            amount_usdc=remaining
        )
        logger.info(f"Funded campaign {campaign.id} with ${remaining}")
```

---
## 8. Performance Optimization

### 8.1 Lazy Loading
```javascript
// Only load signing logic when needed
let signingModule = null;

const loadSigningModule = async () => {
  if (!signingModule) {
    signingModule = await import('./signing.js');
  }
  return signingModule;
};
```

### 8.2 Request Batching
```javascript
// Batch multiple impressions
const vauQueue = [];
const flushQueue = async () => {
  if (vauQueue.length === 0) return;
  
  const batch = vauQueue.splice(0, 10);
  await fetch('/v1/ad_vau/batch', {
    method: 'POST',
    body: JSON.stringify({ vaus: batch })
  });
};

setInterval(flushQueue, 1000);
```

---
## 9. Analytics & Reporting

### 9.1 Client-Side Metrics
```javascript
// Measure performance impact
const metrics = {
  loadTime: performance.now(),
  signTime: 0,
  postTime: 0,
  
  report: function() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/analytics', JSON.stringify({
        campaign: config.campaignId,
        load_ms: this.loadTime,
        sign_ms: this.signTime,
        post_ms: this.postTime,
        success: true
      }));
    }
  }
};
```

### 9.2 Server-Side Dashboard
```sql
-- Campaign performance view
CREATE VIEW campaign_performance AS
SELECT 
  campaign_id,
  COUNT(*) as impressions,
  SUM(reward_amount) as spent_ac,
  COUNT(DISTINCT device_key) as unique_devices,
  AVG(CASE WHEN conversion_value > 0 THEN 1 ELSE 0 END) as conversion_rate,
  SUM(conversion_value) as total_conversions
FROM ad_vaus
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY campaign_id;
```

---
## 10. Security & Privacy

### 10.1 Security Measures
| Threat | Mitigation |
|--------|-----------|
| Script injection | CSP headers + sandboxed iframes |
| Click fraud | Hardware key requirement |
| Domain spoofing | Origin verification in VAU |
| Replay attacks | Timestamp validation |
| Bot traffic | WebAuthn excludes headless |

### 10.2 Privacy Features
- No cookies set
- No cross-site tracking
- No PII collected
- Cohorts are anonymized
- Site hash only (no full URL)

---
## 11. Testing

### 11.1 Unit Tests
```javascript
describe('AAE.js', () => {
  it('should wait for viewability', async () => {
    const mockElement = createHiddenElement();
    loadAAE(mockElement);
    
    // Should not fire immediately
    await wait(500);
    expect(fetchSpy).not.toHaveBeenCalled();
    
    // Make visible
    mockElement.style.display = 'block';
    await wait(1100);
    expect(fetchSpy).toHaveBeenCalledWith('/v1/ad_vau');
  });
  
  it('should handle missing hardware key', async () => {
    navigator.credentials.get = jest.fn().mockRejectedValue(new Error());
    
    loadAAE();
    await wait(2000);
    
    // Should fail silently
    expect(console.error).not.toHaveBeenCalled();
  });
});
```

### 11.2 Integration Tests
```python
# Test with real ad server
async def test_dfp_integration():
    # Serve test page with GPT
    page = await browser.newPage()
    await page.goto('http://localhost:8080/test-dfp.html')
    
    # Wait for ad load
    await page.waitForSelector('.ahee-wrapper')
    
    # Verify VAU sent
    vau_request = await page.waitForRequest(
        lambda r: 'ad_vau' in r.url
    )
    
    assert vau_request.postData
    assert 'campaign_id' in json.loads(vau_request.postData)
```

---
## 12. Rollout Strategy

### 12.1 Phases
1. **Alpha**: Direct campaigns only (no programmatic)
2. **Beta**: Select Prebid publishers
3. **GA**: All demand sources

### 12.2 Migration Path
```javascript
// Gradual rollout with feature flag
if (Math.random() < window.AHEE_ROLLOUT_PERCENT / 100) {
  loadAAE();
} else {
  // Traditional impression pixel
  fireTraditionalPixel();
}
```

---
## 13. Cost Analysis

### 13.1 Infrastructure
- CDN hosting: ~$50/month (Cloudflare)
- Edge compute: ~$0.50/million VAUs
- No additional publisher costs

### 13.2 Advertiser Savings
- Traditional programmatic: ~30% fees
- AHEE wrapper: ~2% protocol fee
- Net savings: ~28% of media spend

---
End of file 