import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthContextService } from '../services/auth-context.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private authContextService: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    request.user = await this.authContextService.buildRequestUser(payload);
    return true;
  }

  private extractBearerToken(request: any): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string') return undefined;

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return undefined;

    return token;
  }
}
