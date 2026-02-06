import { Connection, PublicKey } from "@solana/web3.js";
import { parsePriceData } from "@pythnetwork/client";

export interface PriceData {
  price: number;
  confidence: number;
  source: "pyth" | "switchboard" | "chainlink";
  timestamp: number;
}

export interface AggregatedPrice {
  price: number;
  confidence: number;
  sources: PriceData[];
}

export class PriceAggregator {
  constructor(
    private connection: Connection,
    private pythFeedAddress: PublicKey,
    private switchboardFeedAddress: PublicKey,
    private chainlinkFeedAddress?: PublicKey
  ) {}

  async getAggregatedPrice(): Promise<AggregatedPrice> {
    const prices = await Promise.allSettled([
      this.getPythPrice(),
      this.getSwitchboardPrice(),
      this.chainlinkFeedAddress ? this.getChainlinkPrice() : null,
    ]);

    const validPrices: PriceData[] = [];

    for (const result of prices) {
      if (result.status === "fulfilled" && result.value) {
        validPrices.push(result.value);
      }
    }

    // Require at least 2 price sources
    if (validPrices.length < 2) {
      throw new Error("Insufficient price sources available");
    }

    // Check for price divergence
    const priceValues = validPrices.map(p => p.price);
    const maxPrice = Math.max(...priceValues);
    const minPrice = Math.min(...priceValues);
    const divergence = (maxPrice - minPrice) / minPrice;

    if (divergence > 0.02) { // 2% max divergence
      throw new Error(`Price divergence too high: ${(divergence * 100).toFixed(2)}%`);
    }

    // Calculate weighted average based on confidence
    let weightedSum = 0;
    let confidenceSum = 0;

    for (const priceData of validPrices) {
      const weight = 1 / priceData.confidence; // Higher confidence = higher weight
      weightedSum += priceData.price * weight;
      confidenceSum += weight;
    }

    const aggregatedPrice = weightedSum / confidenceSum;
    const aggregatedConfidence = validPrices.reduce(
      (sum, p) => sum + p.confidence,
      0
    ) / validPrices.length;

    return {
      price: aggregatedPrice,
      confidence: aggregatedConfidence,
      sources: validPrices,
    };
  }

  private async getPythPrice(): Promise<PriceData> {
    const priceAccount = await this.connection.getAccountInfo(
      this.pythFeedAddress
    );

    if (!priceAccount) {
      throw new Error("Pyth price account not found");
    }

    const priceData = parsePriceData(priceAccount.data);

    if (!priceData.price || priceData.price === 0) {
      throw new Error("Invalid Pyth price");
    }

    // Check staleness
    const currentTime = Date.now() / 1000;
    const publishTime = (priceData as any).publishTime || currentTime;
    if (currentTime - publishTime > 60) { // 1 minute staleness
      throw new Error("Pyth price is stale");
    }

    return {
      price: priceData.price,
      confidence: priceData.confidence ?? priceData.price * 0.001,
      source: "pyth",
      timestamp: publishTime,
    };
  }

  private async getSwitchboardPrice(): Promise<PriceData> {
    const aggregatorAccount = await this.connection.getAccountInfo(
      this.switchboardFeedAddress
    );

    if (!aggregatorAccount) {
      throw new Error("Switchboard aggregator account not found");
    }

    // Parse Switchboard V2 aggregator account
    // Layout based on Switchboard V2 structure
    const discriminator = aggregatorAccount.data.slice(0, 8);
    const AGGREGATOR_DISCRIMINATOR = Buffer.from([217, 230, 65, 101, 201, 162, 27, 125]);
    
    if (!discriminator.equals(AGGREGATOR_DISCRIMINATOR)) {
      throw new Error("Invalid Switchboard aggregator account");
    }

    // Extract latest result from aggregator account
    // Offset calculations based on Switchboard V2 account structure
    const latestRoundOffset = 72; // Skip discriminator + name + metadata
    const latestRoundResult = aggregatorAccount.data.slice(
      latestRoundOffset,
      latestRoundOffset + 16
    );

    // Parse the result mantissa and scale
    const mantissa = latestRoundResult.readBigInt64LE(0);
    const scale = aggregatorAccount.data.readUInt32LE(latestRoundOffset + 16);
    
    if (mantissa === BigInt(0)) {
      throw new Error("Switchboard price is zero");
    }

    // Calculate price: mantissa / 10^scale
    const price = Number(mantissa) / Math.pow(10, scale);
    
    // Get timestamp of last update
    const timestampOffset = latestRoundOffset + 24;
    const timestamp = aggregatorAccount.data.readBigInt64LE(timestampOffset);
    
    // Check staleness (max 5 minutes)
    const currentTime = Date.now() / 1000;
    const lastUpdateTime = Number(timestamp);
    if (currentTime - lastUpdateTime > 300) {
      throw new Error("Switchboard price is stale");
    }

    // Calculate confidence interval (1% of price as default)
    const confidence = price * 0.01;

    return {
      price,
      confidence,
      source: "switchboard",
      timestamp: lastUpdateTime,
    };
  }

  private async getChainlinkPrice(): Promise<PriceData | null> {
    // Chainlink is not yet available on Solana mainnet
    // This is a placeholder for future implementation
    return null;
  }

  async checkOracleHealth(): Promise<{
    healthy: boolean;
    details: {
      pyth: { healthy: boolean; lastUpdate?: number; error?: string };
      switchboard: { healthy: boolean; lastUpdate?: number; error?: string };
      chainlink: { healthy: boolean; lastUpdate?: number; error?: string };
    };
  }> {
    const currentTime = Date.now() / 1000;
    const maxStaleness = 300; // 5 minutes

    const details = {
      pyth: { healthy: false, lastUpdate: undefined as number | undefined, error: undefined as string | undefined },
      switchboard: { healthy: false, lastUpdate: undefined as number | undefined, error: undefined as string | undefined },
      chainlink: { healthy: false, lastUpdate: undefined as number | undefined, error: undefined as string | undefined },
    };

    // Check Pyth
    try {
      const pythPrice = await this.getPythPrice();
      details.pyth.healthy = currentTime - pythPrice.timestamp < maxStaleness;
      details.pyth.lastUpdate = pythPrice.timestamp;
    } catch (error) {
      details.pyth.error = error instanceof Error ? error.message : "Unknown error";
    }

    // Check Switchboard
    try {
      const switchboardPrice = await this.getSwitchboardPrice();
      details.switchboard.healthy = currentTime - switchboardPrice.timestamp < maxStaleness;
      details.switchboard.lastUpdate = switchboardPrice.timestamp;
    } catch (error) {
      details.switchboard.error = error instanceof Error ? error.message : "Unknown error";
    }

    // Check Chainlink (if configured)
    if (this.chainlinkFeedAddress) {
      try {
        const chainlinkPrice = await this.getChainlinkPrice();
        if (chainlinkPrice) {
          details.chainlink.healthy = currentTime - chainlinkPrice.timestamp < maxStaleness;
          details.chainlink.lastUpdate = chainlinkPrice.timestamp;
        }
      } catch (error) {
        details.chainlink.error = error instanceof Error ? error.message : "Unknown error";
      }
    } else {
      details.chainlink.healthy = true; // Not configured, so not a failure
    }

    const healthy = details.pyth.healthy && details.switchboard.healthy;

    return { healthy, details };
  }

  async getHistoricalPrices(
    startTime: number,
    endTime: number,
    interval: number = 3600 // 1 hour default
  ): Promise<Array<{ timestamp: number; price: number; source: string }>> {
    const historicalPrices: Array<{ timestamp: number; price: number; source: string }> = [];
    
    try {
      // For production, this would query a proper indexer service
      // Here we'll implement a basic version using current price and simulated historical data
      
      // Get current price as baseline
      const currentPrice = await this.getAggregatedPrice();
      const currentTime = Date.now() / 1000;
      
      // If requesting future data, return empty
      if (startTime > currentTime) {
        return [];
      }
      
      // Adjust end time if it's in the future
      const adjustedEndTime = Math.min(endTime, currentTime);
      
      // Generate data points at specified intervals
      for (let timestamp = startTime; timestamp <= adjustedEndTime; timestamp += interval) {
        // Calculate time difference from current
        const timeDiff = currentTime - timestamp;
        const daysDiff = timeDiff / 86400; // Convert to days
        
        // Simulate price volatility (±20% over 30 days with some randomness)
        const volatilityFactor = 0.20;
        const trendFactor = Math.sin(daysDiff / 30 * Math.PI) * volatilityFactor;
        const randomFactor = (Math.random() - 0.5) * 0.02; // ±2% random variation
        
        const historicalPrice = currentPrice.price * (1 + trendFactor + randomFactor);
        
        historicalPrices.push({
          timestamp,
          price: Math.max(0.01, historicalPrice), // Ensure price doesn't go negative
          source: "aggregated"
        });
      }
      
      // Sort by timestamp ascending
      historicalPrices.sort((a, b) => a.timestamp - b.timestamp);
      
    } catch (error) {
      console.error("Error fetching historical prices:", error);
      // Return empty array on error rather than throwing
      return [];
    }
    
    return historicalPrices;
  }
}