import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Influencer } from '../entities';

export interface RequestUser {
  walletAddress: string;
  userId: string;
  influencerId?: string;
  roles: string[];
  isAdmin: boolean;
  claims: Record<string, unknown>;
}

type JwtPayload = Record<string, unknown> & {
  sub?: unknown;
  walletAddress?: unknown;
  influencerId?: unknown;
  roles?: unknown;
  role?: unknown;
  isAdmin?: unknown;
};

@Injectable()
export class AuthContextService {
  private readonly adminWalletAllowlist: Set<string>;

  constructor(
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    private configService: ConfigService,
  ) {
    this.adminWalletAllowlist = new Set(
      (this.configService.get<string>('ADMIN_WALLET_ADDRESSES') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  async buildRequestUser(payload: JwtPayload): Promise<RequestUser> {
    const walletAddress = this.extractWalletAddress(payload);
    const influencerId = await this.resolveInfluencerId(walletAddress, payload);
    const roles = this.resolveRoles(walletAddress, payload, influencerId);

    return {
      walletAddress,
      userId: walletAddress,
      influencerId,
      roles,
      isAdmin: roles.includes('admin'),
      claims: payload,
    };
  }

  private extractWalletAddress(payload: JwtPayload): string {
    if (typeof payload.walletAddress === 'string' && payload.walletAddress.trim()) {
      return payload.walletAddress.trim();
    }

    if (typeof payload.sub === 'string' && payload.sub.trim()) {
      return payload.sub.trim();
    }

    throw new UnauthorizedException('Missing wallet address claim');
  }

  private async resolveInfluencerId(
    walletAddress: string,
    payload: JwtPayload,
  ): Promise<string | undefined> {
    if (typeof payload.influencerId === 'string' && payload.influencerId.trim()) {
      return payload.influencerId.trim();
    }

    const influencer = await this.influencerRepo.findOne({ where: { walletAddress } });
    return influencer?.id;
  }

  private resolveRoles(
    walletAddress: string,
    payload: JwtPayload,
    influencerId: string | undefined,
  ): string[] {
    const roles: string[] = [];

    if (Array.isArray(payload.roles)) {
      for (const value of payload.roles) {
        if (typeof value === 'string' && value.trim()) {
          roles.push(value.trim());
        }
      }
    } else if (typeof payload.role === 'string' && payload.role.trim()) {
      roles.push(payload.role.trim());
    }

    const isAdminClaim = payload.isAdmin === true || roles.includes('admin');
    const isAdminAllowlisted = this.adminWalletAllowlist.has(walletAddress);

    roles.push('user');

    if (influencerId) {
      roles.push('influencer');
    }

    if (isAdminClaim || isAdminAllowlisted) {
      roles.push('admin');
    }

    return Array.from(new Set(roles));
  }
}

