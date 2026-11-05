import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../core/cache.dart';

/// File d'attente d'écritures effectuées hors-ligne, rejouée au retour du réseau.
/// Réservée aux actions SÛRES à rejouer (ex. notation) — jamais un paiement
/// ou une commande de course. Un rejeu en double est absorbé côté serveur
/// (contrainte d'unicité) et donc simplement abandonné.
class OutboxService {
  final ApiClient _api;
  final LocalCache _cache;
  static const _key = 'outbox';
  OutboxService(this._api, this._cache);

  Future<List<Map>> _read() async {
    final v = await _cache.getJson(_key);
    return v is List ? v.cast<Map>() : <Map>[];
  }

  Future<void> enqueue(String method, String path, Map body) async {
    final list = await _read();
    list.add({'method': method, 'path': path, 'body': body});
    await _cache.setJson(_key, list);
  }

  /// Rejoue les actions en attente. Conserve seulement celles qui échouent
  /// faute de réseau (pas de réponse serveur) ; abandonne les 4xx définitifs.
  Future<void> flush() async {
    final list = await _read();
    if (list.isEmpty) return;
    final remaining = <Map>[];
    for (final a in list) {
      try {
        await _api.dio.request(
          a['path'] as String,
          data: a['body'],
          options: Options(method: a['method'] as String),
        );
      } on DioException catch (e) {
        if (e.response == null) remaining.add(a); // hors-ligne : on garde
        // sinon (réponse 4xx/5xx) : action abandonnée
      } catch (_) {
        remaining.add(a);
      }
    }
    await _cache.setJson(_key, remaining);
  }
}
