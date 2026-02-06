/**
 * Bloom Filter implementation for efficient duplicate detection
 */

export class BloomFilter {
  private bits: Uint8Array;
  private hashCount: number;
  private size: number;
  
  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    // Calculate optimal bit array size
    this.size = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / Math.pow(Math.log(2), 2));
    
    // Calculate optimal number of hash functions
    this.hashCount = Math.ceil(this.size / expectedItems * Math.log(2));
    
    // Initialize bit array
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
  }
  
  /**
   * Add an item to the filter
   */
  add(item: string): void {
    const hashes = this.getHashes(item);
    
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      
      this.bits[byteIndex] |= (1 << bitIndex);
    }
  }
  
  /**
   * Check if an item might be in the filter
   */
  has(item: string): boolean {
    const hashes = this.getHashes(item);
    
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get the fill ratio of the filter
   */
  getFillRatio(): number {
    let setBits = 0;
    
    for (let i = 0; i < this.bits.length; i++) {
      const byte = this.bits[i];
      for (let j = 0; j < 8; j++) {
        if ((byte & (1 << j)) !== 0) {
          setBits++;
        }
      }
    }
    
    return setBits / this.size;
  }
  
  /**
   * Generate multiple hash values for an item
   */
  private getHashes(item: string): number[] {
    const hashes: number[] = [];
    
    // Use murmur hash variants
    for (let i = 0; i < this.hashCount; i++) {
      hashes.push(this.murmurHash3(item, i));
    }
    
    return hashes;
  }
  
  /**
   * MurmurHash3 implementation
   */
  private murmurHash3(key: string, seed: number = 0): number {
    const remainder = key.length & 3;
    const bytes = key.length - remainder;
    let h1 = seed;
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    let i = 0;
    
    while (i < bytes) {
      let k1 = 
        ((key.charCodeAt(i) & 0xff)) |
        ((key.charCodeAt(++i) & 0xff) << 8) |
        ((key.charCodeAt(++i) & 0xff) << 16) |
        ((key.charCodeAt(++i) & 0xff) << 24);
      ++i;
      
      k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
      
      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      const h1b = ((h1 & 0xffff) * 5 + ((((h1 >>> 16) * 5) & 0xffff) << 16)) & 0xffffffff;
      h1 = (h1b & 0xffff) + 0x6b64 + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16);
    }
    
    let k1 = 0;
    
    switch (remainder) {
      case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
      case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
      case 1: k1 ^= (key.charCodeAt(i) & 0xff);
        k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
        h1 ^= k1;
    }
    
    h1 ^= key.length;
    h1 ^= h1 >>> 16;
    h1 = ((h1 & 0xffff) * 0x85ebca6b + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
    h1 ^= h1 >>> 13;
    h1 = ((h1 & 0xffff) * 0xc2b2ae35 + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff;
    h1 ^= h1 >>> 16;
    
    return h1 >>> 0;
  }
  
  /**
   * Export filter state for persistence
   */
  export(): { bits: string; size: number; hashCount: number } {
    return {
      bits: Buffer.from(this.bits).toString('base64'),
      size: this.size,
      hashCount: this.hashCount
    };
  }
  
  /**
   * Import filter state from persistence
   */
  static import(data: { bits: string; size: number; hashCount: number }): BloomFilter {
    const filter = Object.create(BloomFilter.prototype);
    filter.bits = new Uint8Array(Buffer.from(data.bits, 'base64'));
    filter.size = data.size;
    filter.hashCount = data.hashCount;
    return filter;
  }
}