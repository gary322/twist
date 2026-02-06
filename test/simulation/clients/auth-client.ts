/**
 * Mock Auth Client for simulation
 */

export class AuthClient {
  private sessions = new Map<string, any>();
  private twoFactorEnabled = new Map<string, boolean>();

  async register(params: {
    email: string;
    password: string;
  }): Promise<{ success: boolean; userId: string; token: string }> {
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const token = this.generateToken();
    
    this.sessions.set(token, {
      userId,
      email: params.email,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });
    
    return {
      success: true,
      userId,
      token
    };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<{ success: boolean; token: string; requires2FA: boolean }> {
    // Simulate login
    const token = this.generateToken();
    const requires2FA = Math.random() > 0.7; // 30% have 2FA
    
    if (requires2FA) {
      this.sessions.set(token, {
        email: params.email,
        pending2FA: true,
        createdAt: Date.now()
      });
    } else {
      this.sessions.set(token, {
        email: params.email,
        userId: `user_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      });
    }
    
    return {
      success: true,
      token,
      requires2FA
    };
  }

  async verify2FA(params: {
    token: string;
    code: string;
  }): Promise<{ success: boolean; userId?: string }> {
    const session = this.sessions.get(params.token);
    if (!session || !session.pending2FA) {
      return { success: false };
    }
    
    // Simulate 2FA verification (always succeed in simulation)
    const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
    
    this.sessions.set(params.token, {
      ...session,
      userId,
      pending2FA: false,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    
    return {
      success: true,
      userId
    };
  }

  async enable2FA(userId: string): Promise<{ success: boolean; qrCode: string; secret: string }> {
    this.twoFactorEnabled.set(userId, true);
    
    return {
      success: true,
      qrCode: `data:image/png;base64,${this.generateMockQR()}`,
      secret: this.generateSecret()
    };
  }

  async validateSession(token: string): Promise<{ valid: boolean; userId?: string }> {
    const session = this.sessions.get(token);
    
    if (!session || session.pending2FA) {
      return { valid: false };
    }
    
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return { valid: false };
    }
    
    return {
      valid: true,
      userId: session.userId
    };
  }

  async logout(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async refreshToken(oldToken: string): Promise<{ success: boolean; newToken?: string }> {
    const session = this.sessions.get(oldToken);
    
    if (!session || session.pending2FA) {
      return { success: false };
    }
    
    const newToken = this.generateToken();
    this.sessions.set(newToken, {
      ...session,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    
    this.sessions.delete(oldToken);
    
    return {
      success: true,
      newToken
    };
  }

  async linkWallet(params: {
    userId: string;
    walletAddress: string;
    signature: string;
  }): Promise<{ success: boolean }> {
    // Simulate wallet linking
    return { success: true };
  }

  private generateToken(): string {
    return 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
  }

  private generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }
    return secret;
  }

  private generateMockQR(): string {
    // Return a simple base64 encoded mock QR code
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  get2FAEnabledCount(): number {
    return this.twoFactorEnabled.size;
  }
}