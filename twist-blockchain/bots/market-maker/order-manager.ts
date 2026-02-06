import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';

export interface Order {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  status: 'pending' | 'active' | 'filled' | 'cancelled';
  positionMint?: PublicKey;
  timestamp: number;
  fills: Fill[];
}

export interface Fill {
  price: number;
  size: number;
  timestamp: number;
  fee: number;
}

export class OrderManager {
  private connection: Connection;
  private wallet: Wallet;
  private orders: Map<string, Order> = new Map();
  private orderHistory: Order[] = [];
  
  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
  }
  
  /**
   * Create a new order
   */
  createOrder(params: {
    side: 'buy' | 'sell';
    price: number;
    size: number;
  }): Order {
    const order: Order = {
      id: this.generateOrderId(),
      side: params.side,
      price: params.price,
      size: params.size,
      status: 'pending',
      timestamp: Date.now(),
      fills: [],
    };
    
    this.orders.set(order.id, order);
    return order;
  }
  
  /**
   * Update order status
   */
  updateOrderStatus(orderId: string, status: Order['status']) {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
      
      if (status === 'filled' || status === 'cancelled') {
        this.orderHistory.push(order);
        this.orders.delete(orderId);
        
        // Keep only last 1000 orders in history
        if (this.orderHistory.length > 1000) {
          this.orderHistory.shift();
        }
      }
    }
  }
  
  /**
   * Record a fill for an order
   */
  recordFill(orderId: string, fill: Fill) {
    const order = this.orders.get(orderId);
    if (order) {
      order.fills.push(fill);
      
      // Check if order is fully filled
      const totalFilled = order.fills.reduce((sum, f) => sum + f.size, 0);
      if (totalFilled >= order.size * 0.99) { // 99% filled counts as full
        this.updateOrderStatus(orderId, 'filled');
      }
    }
  }
  
  /**
   * Get active orders
   */
  getActiveOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'active');
  }
  
  /**
   * Get orders by side
   */
  getOrdersBySide(side: 'buy' | 'sell'): Order[] {
    return Array.from(this.orders.values()).filter(o => o.side === side);
  }
  
  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active') {
      return false;
    }
    
    try {
      // In production, would send cancellation transaction
      this.updateOrderStatus(orderId, 'cancelled');
      return true;
    } catch (error) {
      console.error(`Failed to cancel order ${orderId}:`, error);
      return false;
    }
  }
  
  /**
   * Cancel all orders
   */
  async cancelAllOrders(): Promise<number> {
    const activeOrders = this.getActiveOrders();
    let cancelledCount = 0;
    
    for (const order of activeOrders) {
      if (await this.cancelOrder(order.id)) {
        cancelledCount++;
      }
    }
    
    return cancelledCount;
  }
  
  /**
   * Get order book depth
   */
  getOrderBookDepth(): {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  } {
    const bids = this.getOrdersBySide('buy')
      .filter(o => o.status === 'active')
      .map(o => ({ price: o.price, size: o.size }))
      .sort((a, b) => b.price - a.price);
    
    const asks = this.getOrdersBySide('sell')
      .filter(o => o.status === 'active')
      .map(o => ({ price: o.price, size: o.size }))
      .sort((a, b) => a.price - b.price);
    
    return { bids, asks };
  }
  
  /**
   * Calculate total exposure
   */
  getTotalExposure(): {
    buyExposure: number;
    sellExposure: number;
    netExposure: number;
  } {
    const activeOrders = this.getActiveOrders();
    
    const buyExposure = activeOrders
      .filter(o => o.side === 'buy')
      .reduce((sum, o) => sum + o.size, 0);
    
    const sellExposure = activeOrders
      .filter(o => o.side === 'sell')
      .reduce((sum, o) => sum + o.size * o.price, 0);
    
    return {
      buyExposure,
      sellExposure,
      netExposure: sellExposure - buyExposure,
    };
  }
  
  /**
   * Get order statistics
   */
  getOrderStats(period?: number): {
    totalOrders: number;
    filledOrders: number;
    cancelledOrders: number;
    fillRate: number;
    avgFillTime: number;
    totalVolume: number;
    totalFees: number;
  } {
    const cutoff = period ? Date.now() - period : 0;
    const relevantOrders = this.orderHistory.filter(o => o.timestamp > cutoff);
    
    const filledOrders = relevantOrders.filter(o => o.status === 'filled');
    const cancelledOrders = relevantOrders.filter(o => o.status === 'cancelled');
    
    const fillTimes = filledOrders.map(o => {
      if (o.fills.length > 0) {
        return o.fills[o.fills.length - 1].timestamp - o.timestamp;
      }
      return 0;
    }).filter(t => t > 0);
    
    const avgFillTime = fillTimes.length > 0 
      ? fillTimes.reduce((a, b) => a + b, 0) / fillTimes.length 
      : 0;
    
    const totalVolume = filledOrders.reduce((sum, o) => 
      sum + o.fills.reduce((s, f) => s + f.size * f.price, 0), 0
    );
    
    const totalFees = filledOrders.reduce((sum, o) => 
      sum + o.fills.reduce((s, f) => s + f.fee, 0), 0
    );
    
    return {
      totalOrders: relevantOrders.length,
      filledOrders: filledOrders.length,
      cancelledOrders: cancelledOrders.length,
      fillRate: relevantOrders.length > 0 ? filledOrders.length / relevantOrders.length : 0,
      avgFillTime,
      totalVolume,
      totalFees,
    };
  }
  
  /**
   * Monitor order execution
   */
  async monitorOrders() {
    const activeOrders = this.getActiveOrders();
    
    for (const order of activeOrders) {
      // Check if order has been filled
      // In production, would check on-chain state
      
      // For now, simulate random fills
      if (Math.random() < 0.1) { // 10% chance of fill
        const fillSize = order.size * (0.1 + Math.random() * 0.9);
        const fillPrice = order.price * (0.99 + Math.random() * 0.02);
        
        this.recordFill(order.id, {
          price: fillPrice,
          size: fillSize,
          timestamp: Date.now(),
          fee: fillSize * fillPrice * 0.0005, // 0.05% fee
        });
      }
    }
  }
  
  /**
   * Generate unique order ID
   */
  private generateOrderId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get P&L for filled orders
   */
  calculatePnL(currentPrices: { twist: number; usdc: number }): {
    realizedPnL: number;
    unrealizedPnL: number;
    totalPnL: number;
    fees: number;
  } {
    let realizedPnL = 0;
    let fees = 0;
    
    // Calculate realized P&L from filled orders
    const filledOrders = this.orderHistory.filter(o => o.status === 'filled');
    
    for (const order of filledOrders) {
      for (const fill of order.fills) {
        if (order.side === 'buy') {
          // Bought TWIST, calculate P&L based on current price
          const currentValue = fill.size * currentPrices.twist;
          const cost = fill.size * fill.price;
          realizedPnL += currentValue - cost;
        } else {
          // Sold TWIST, P&L is immediate
          realizedPnL += fill.size * (fill.price - currentPrices.twist);
        }
        fees += fill.fee;
      }
    }
    
    // For simplicity, no unrealized P&L for active orders
    const unrealizedPnL = 0;
    
    return {
      realizedPnL,
      unrealizedPnL,
      totalPnL: realizedPnL + unrealizedPnL,
      fees,
    };
  }
}