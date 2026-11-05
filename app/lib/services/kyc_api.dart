import 'package:dio/dio.dart';
import '../core/api_client.dart';

/// Appels KYC conducteur.
class KycApi {
  final ApiClient _api;
  KycApi(this._api);

  Future<Map<String, dynamic>> status() async {
    final res = await _api.dio.get('/drivers/kyc');
    return res.data as Map<String, dynamic>;
  }

  /// Upload multipart d'une pièce (kind = id_card | license | registration | insurance).
  Future<void> upload(String kind, String filePath) async {
    final form = FormData.fromMap({
      'kind': kind,
      'file': await MultipartFile.fromFile(filePath),
    });
    await _api.dio.post('/drivers/kyc/documents', data: form);
  }

  Future<void> submit() => _api.dio.post('/drivers/kyc/submit');
}
