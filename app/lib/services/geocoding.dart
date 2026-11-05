import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import '../models/models.dart';

/// Recherche d'adresses via Nominatim (OpenStreetMap) — pas de clé requise.
/// Nominatim impose un User-Agent identifiable et ~1 req/s : à respecter,
/// ou passer par un self-host / Photon en production.
class GeocodingService {
  final _dio = Dio(BaseOptions(
    baseUrl: 'https://nominatim.openstreetmap.org',
    headers: {'User-Agent': 'NewdemApp/0.1 (contact@newdem.sn)'},
  ));

  Future<List<GeoPoint>> search(String query) async {
    if (query.trim().length < 3) return [];
    final res = await _dio.get('/search', queryParameters: {
      'q': query,
      'format': 'json',
      'countrycodes': 'sn',
      'limit': 6,
    });
    return (res.data as List)
        .map((e) => GeoPoint(
              lng: double.parse(e['lon'] as String),
              lat: double.parse(e['lat'] as String),
              label: (e['display_name'] as String).split(',').first,
            ))
        .toList();
  }
}

/// Position actuelle de l'appareil, avec demande de permission.
class LocationService {
  Future<GeoPoint?> current() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      return null;
    }
    final pos = await Geolocator.getCurrentPosition();
    return GeoPoint(lng: pos.longitude, lat: pos.latitude, label: 'Position actuelle');
  }
}
