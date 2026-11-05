import '../core/api_client.dart';
import '../models/models.dart';

/// Appels liés aux courses (l'id passager est déduit du JWT côté serveur).
class TripsApi {
  final ApiClient _api;
  TripsApi(this._api);

  Future<TripEstimate> estimate(GeoPoint origin, GeoPoint destination) async {
    final res = await _api.dio.post('/trips/estimate',
        data: {'origin': origin.toJson(), 'destination': destination.toJson()});
    return TripEstimate.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Trip> request(VehicleType type, GeoPoint origin, GeoPoint destination) async {
    final res = await _api.dio.post('/trips', data: {
      'vehicleType': type.api,
      'origin': origin.toJson(),
      'destination': destination.toJson(),
    });
    return Trip.fromJson(res.data as Map<String, dynamic>);
  }

  // Transitions conducteur
  Future<void> accept(String id) => _api.dio.post('/trips/$id/accept');
  Future<void> arriving(String id) => _api.dio.post('/trips/$id/arriving');
  Future<void> start(String id) => _api.dio.post('/trips/$id/start');

  Future<void> complete(String id, PaymentMethod method, {double? km, double? min}) {
    return _api.dio.post('/trips/$id/complete', data: {
      'method': method.api,
      if (km != null && min != null) 'actual': {'km': km, 'min': min},
    });
  }

  /// Renvoie l'URL de paiement à ouvrir (Wave ou Orange Money).
  Future<String> payWave(String id) async {
    final res = await _api.dio.post('/trips/$id/pay/wave');
    return (res.data['wave_launch_url'] ?? res.data['payment_url']) as String;
  }

  Future<String> payOrangeMoney(String id) async {
    final res = await _api.dio.post('/trips/$id/pay/orange-money');
    return res.data['payment_url'] as String;
  }

  Future<void> rate(String id, int stars, {String? comment}) {
    return _api.dio.post('/trips/$id/rate',
        data: {'stars': stars, if (comment != null) 'comment': comment});
  }

  Future<List<TripSummary>> history({int limit = 20, DateTime? before}) async {
    final res = await _api.dio.get('/trips/history', queryParameters: {
      'limit': limit,
      if (before != null) 'before': before.toIso8601String(),
    });
    return (res.data as List)
        .map((e) => TripSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Réponse brute (pour la mise en cache hors-ligne).
  Future<List<dynamic>> historyRaw({int limit = 20}) async {
    final res = await _api.dio.get('/trips/history', queryParameters: {'limit': limit});
    return res.data as List<dynamic>;
  }
}
