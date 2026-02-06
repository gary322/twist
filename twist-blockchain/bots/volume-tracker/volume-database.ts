import { PublicKey } from '@solana/web3.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

interface TradeRecord {
  id?: number;
  signature: string;
  timestamp: number;
  trader: string;
  dex: string;
  side: 'buy' | 'sell';
  amount_in: number;
  amount_out: number;
  price: number;
  volume_usd: number;
  fee: number;
}

export class VolumeDatabase {
  private db: Database.Database;
  
  constructor(private dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance
  }
  
  async initialize() {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature TEXT UNIQUE NOT NULL,
        timestamp INTEGER NOT NULL,
        trader TEXT NOT NULL,
        dex TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        amount_in REAL NOT NULL,
        amount_out REAL NOT NULL,
        price REAL NOT NULL,
        volume_usd REAL NOT NULL,
        fee REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
      CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader);
      CREATE INDEX IF NOT EXISTS idx_trades_dex ON trades(dex);
      CREATE INDEX IF NOT EXISTS idx_trades_side ON trades(side);
      CREATE INDEX IF NOT EXISTS idx_trades_volume ON trades(volume_usd);
      
      CREATE TABLE IF NOT EXISTS volume_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        volume_1m REAL NOT NULL,
        volume_5m REAL NOT NULL,
        volume_15m REAL NOT NULL,
        volume_1h REAL NOT NULL,
        volume_24h REAL NOT NULL,
        volume_7d REAL NOT NULL,
        volume_30d REAL NOT NULL,
        trade_count_24h INTEGER NOT NULL,
        unique_traders_24h INTEGER NOT NULL,
        buy_volume_24h REAL NOT NULL,
        sell_volume_24h REAL NOT NULL,
        buy_pressure REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON volume_snapshots(timestamp);
      
      CREATE TABLE IF NOT EXISTS trader_stats (
        trader TEXT PRIMARY KEY,
        first_trade INTEGER NOT NULL,
        last_trade INTEGER NOT NULL,
        total_trades INTEGER NOT NULL,
        total_volume REAL NOT NULL,
        total_fees REAL NOT NULL,
        buy_count INTEGER NOT NULL,
        sell_count INTEGER NOT NULL,
        avg_trade_size REAL NOT NULL,
        largest_trade REAL NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS dex_stats (
        dex TEXT PRIMARY KEY,
        total_trades INTEGER NOT NULL,
        total_volume REAL NOT NULL,
        total_fees REAL NOT NULL,
        unique_traders INTEGER NOT NULL,
        last_update INTEGER NOT NULL
      );
    `);
    
    // Create prepared statements
    this.prepareStatements();
  }
  
  private insertTradeStmt!: Database.Statement;
  private getTradesSinceStmt!: Database.Statement;
  private getTraderStatsStmt!: Database.Statement;
  private updateTraderStatsStmt!: Database.Statement;
  private insertSnapshotStmt!: Database.Statement;
  
  private prepareStatements() {
    this.insertTradeStmt = this.db.prepare(`
      INSERT OR IGNORE INTO trades (
        signature, timestamp, trader, dex, side,
        amount_in, amount_out, price, volume_usd, fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.getTradesSinceStmt = this.db.prepare(`
      SELECT * FROM trades
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `);
    
    this.getTraderStatsStmt = this.db.prepare(`
      SELECT * FROM trader_stats WHERE trader = ?
    `);
    
    this.updateTraderStatsStmt = this.db.prepare(`
      INSERT INTO trader_stats (
        trader, first_trade, last_trade, total_trades, total_volume,
        total_fees, buy_count, sell_count, avg_trade_size, largest_trade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trader) DO UPDATE SET
        last_trade = excluded.last_trade,
        total_trades = total_trades + 1,
        total_volume = total_volume + excluded.total_volume,
        total_fees = total_fees + excluded.total_fees,
        buy_count = buy_count + excluded.buy_count,
        sell_count = sell_count + excluded.sell_count,
        avg_trade_size = (total_volume + excluded.total_volume) / (total_trades + 1),
        largest_trade = MAX(largest_trade, excluded.largest_trade)
    `);
    
    this.insertSnapshotStmt = this.db.prepare(`
      INSERT INTO volume_snapshots (
        timestamp, volume_1m, volume_5m, volume_15m, volume_1h,
        volume_24h, volume_7d, volume_30d, trade_count_24h,
        unique_traders_24h, buy_volume_24h, sell_volume_24h, buy_pressure
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  
  async insertTrade(trade: any): Promise<void> {
    const tradeRecord: TradeRecord = {
      signature: trade.signature,
      timestamp: trade.timestamp,
      trader: trade.trader.toBase58(),
      dex: trade.dex,
      side: trade.side,
      amount_in: trade.amountIn,
      amount_out: trade.amountOut,
      price: trade.price,
      volume_usd: trade.volumeUsd,
      fee: trade.fee,
    };
    
    // Insert trade
    this.insertTradeStmt.run(
      tradeRecord.signature,
      tradeRecord.timestamp,
      tradeRecord.trader,
      tradeRecord.dex,
      tradeRecord.side,
      tradeRecord.amount_in,
      tradeRecord.amount_out,
      tradeRecord.price,
      tradeRecord.volume_usd,
      tradeRecord.fee
    );
    
    // Update trader stats
    const buyCount = trade.side === 'buy' ? 1 : 0;
    const sellCount = trade.side === 'sell' ? 1 : 0;
    
    this.updateTraderStatsStmt.run(
      tradeRecord.trader,
      tradeRecord.timestamp, // first_trade
      tradeRecord.timestamp, // last_trade
      1, // total_trades
      tradeRecord.volume_usd, // total_volume
      tradeRecord.fee, // total_fees
      buyCount,
      sellCount,
      tradeRecord.volume_usd, // avg_trade_size
      tradeRecord.volume_usd  // largest_trade
    );
    
    // Update DEX stats
    this.updateDexStats(trade);
  }
  
  private updateDexStats(trade: any) {
    const updateStmt = this.db.prepare(`
      INSERT INTO dex_stats (dex, total_trades, total_volume, total_fees, unique_traders, last_update)
      VALUES (?, 1, ?, ?, 1, ?)
      ON CONFLICT(dex) DO UPDATE SET
        total_trades = total_trades + 1,
        total_volume = total_volume + excluded.total_volume,
        total_fees = total_fees + excluded.total_fees,
        last_update = excluded.last_update
    `);
    
    updateStmt.run(
      trade.dex,
      trade.volumeUsd,
      trade.fee,
      trade.timestamp
    );
  }
  
  async getTradesSince(timestamp: number): Promise<any[]> {
    const rows = this.getTradesSinceStmt.all(timestamp) as TradeRecord[];
    
    return rows.map(row => ({
      signature: row.signature,
      timestamp: row.timestamp,
      trader: new PublicKey(row.trader),
      dex: row.dex,
      side: row.side,
      amountIn: row.amount_in,
      amountOut: row.amount_out,
      price: row.price,
      volumeUsd: row.volume_usd,
      fee: row.fee,
    }));
  }
  
  async saveVolumeSnapshot(metrics: any): Promise<void> {
    this.insertSnapshotStmt.run(
      metrics.timestamp,
      metrics.volume1m,
      metrics.volume5m,
      metrics.volume15m,
      metrics.volume1h,
      metrics.volume24h,
      metrics.volume7d,
      metrics.volume30d,
      metrics.tradeCount24h,
      metrics.uniqueTraders24h,
      metrics.buyVolume24h,
      metrics.sellVolume24h,
      metrics.buyPressure
    );
  }
  
  async getTopTraders(limit: number = 10, period?: number): Promise<any[]> {
    let query = `
      SELECT 
        trader,
        COUNT(*) as trade_count,
        SUM(volume_usd) as total_volume,
        AVG(volume_usd) as avg_trade_size,
        MAX(volume_usd) as largest_trade,
        SUM(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) as sell_count
      FROM trades
    `;
    
    if (period) {
      query += ` WHERE timestamp >= ${Date.now() - period}`;
    }
    
    query += ` GROUP BY trader ORDER BY total_volume DESC LIMIT ?`;
    
    const stmt = this.db.prepare(query);
    return stmt.all(limit);
  }
  
  async getDexVolumes(period?: number): Promise<any[]> {
    let query = `
      SELECT 
        dex,
        COUNT(*) as trade_count,
        SUM(volume_usd) as total_volume,
        AVG(volume_usd) as avg_trade_size,
        COUNT(DISTINCT trader) as unique_traders
      FROM trades
    `;
    
    if (period) {
      query += ` WHERE timestamp >= ${Date.now() - period}`;
    }
    
    query += ` GROUP BY dex ORDER BY total_volume DESC`;
    
    const stmt = this.db.prepare(query);
    return stmt.all();
  }
  
  async getVolumeHistory(
    interval: 'hour' | 'day' | 'week',
    limit: number = 30
  ): Promise<any[]> {
    const groupBy = {
      hour: 3600000,    // 1 hour in ms
      day: 86400000,    // 1 day in ms
      week: 604800000,  // 1 week in ms
    }[interval];
    
    const query = `
      SELECT 
        (timestamp / ?) * ? as period,
        SUM(volume_usd) as volume,
        COUNT(*) as trade_count,
        COUNT(DISTINCT trader) as unique_traders,
        AVG(price) as avg_price
      FROM trades
      GROUP BY period
      ORDER BY period DESC
      LIMIT ?
    `;
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(groupBy, groupBy, limit);
    
    return rows.map(row => ({
      timestamp: row.period,
      volume: row.volume,
      tradeCount: row.trade_count,
      uniqueTraders: row.unique_traders,
      avgPrice: row.avg_price,
    }));
  }
  
  async cleanOldData(daysToKeep: number = 90): Promise<number> {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const deleteStmt = this.db.prepare('DELETE FROM trades WHERE timestamp < ?');
    const result = deleteStmt.run(cutoff);
    
    // Vacuum to reclaim space
    this.db.exec('VACUUM');
    
    return result.changes;
  }
  
  close() {
    this.db.close();
  }
}