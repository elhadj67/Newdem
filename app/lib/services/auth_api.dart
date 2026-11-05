import '../core/api_client.dart';
import '../core/token_store.dart';

/// Appels d'authentification par OTP SMS avec jetons rotatifs.
class AuthApi {
  final ApiClient _api;
  final TokenStore _tokens;
  AuthApi(this._api, this._tokens);

  Future<void> requestOtp(String phone) async {
    await _api.dio.post('/auth/otp/request', data: {'phone': phone});
  }

  /// Vérifie le code, stocke access + refresh, renvoie l'utilisateur.
  Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
    final res = await _api.dio
        .post('/auth/otp/verify', data: {'phone': phone, 'code': code});
    await _tokens.save(res.data['accessToken'] as String, res.data['refreshToken'] as String);
    return res.data['user'] as Map<String, dynamic>;
  }

  /// Déconnexion : révoque le refresh côté serveur puis efface localement.
  Future<void> logout() async {
    final rt = await _tokens.refresh();
    if (rt != null) {
      try {
        await _api.dio.post('/auth/logout', data: {'refreshToken': rt});
      } catch (_) {}
    }
    await _tokens.clear();
  }

  /// Connecté si un refresh token est présent (l'access sera régénéré au besoin).
  Future<bool> get isLoggedIn async => (await _tokens.refresh()) != null;
}
