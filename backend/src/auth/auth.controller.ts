import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './auth.decorators';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('otp/request')
  request(@Body() b: { phone: string }) {
    return this.auth.requestOtp(b.phone);
  }

  /** Renvoie { accessToken, refreshToken, user }. */
  @Public()
  @Post('otp/verify')
  verify(@Body() b: { phone: string; code: string }) {
    return this.auth.verifyOtp(b.phone, b.code);
  }

  /** Échange un refresh token contre une nouvelle paire (rotation). */
  @Public()
  @Post('refresh')
  refresh(@Body() b: { refreshToken: string }) {
    return this.auth.refresh(b.refreshToken);
  }

  /** Révoque le refresh token (déconnexion). */
  @Public()
  @Post('logout')
  logout(@Body() b: { refreshToken: string }) {
    return this.auth.logout(b.refreshToken);
  }
}
