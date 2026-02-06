import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Influencer } from '../entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../guards/optional-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { AuthContextService } from '../services/auth-context.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Influencer]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [AuthContextService, JwtAuthGuard, OptionalAuthGuard, RolesGuard, WsAuthGuard],
  exports: [
    JwtModule,
    AuthContextService,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    WsAuthGuard,
  ],
})
export class AuthModule {}
