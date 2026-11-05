import '../core/api_client.dart';

/// Appels réservés au conducteur (profil déduit du JWT côté serveur).
class DriversApi {
  final ApiClient _api;
  DriversApi(this._api);

  Future<Map<String, dynamic>> me() async {
    final res = await _api.dio.get('/drivers/me');
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> wallet() async {
    final res = await _api.dio.get('/wallets/me');
    return res.data as Map<String, dynamic>;
  }

  Future<void> setOnline(bool online) =>
      _api.dio.post('/drivers/status', data: {'online': online});
}
