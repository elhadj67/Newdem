import 'dart:async';
import 'package:dio/dio.dart';
import 'config.dart';
import 'token_store.dart';

/// Client HTTP partagé.
///  - Ajoute l'access token à chaque requête.
///  - Sur 401, tente UNE rotation via /auth/refresh puis rejoue la requête ;
///    si le refresh échoue, efface les jetons (session terminée).
/// Un verrou évite les rafraîchissements concurrents.
class ApiClient {
  final Dio dio;
  final TokenStore _tokens;
  final Dio _bare; // sans intercepteur, pour l'appel /auth/refresh
  Completer<bool>? _refreshing;

  ApiClient(this._tokens)
      : dio = Dio(BaseOptions(
          baseUrl: Config.apiBase,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 15),
        )),
        _bare = Dio(BaseOptions(baseUrl: Config.apiBase)) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokens.access();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (e, handler) async {
        final req = e.requestOptions;
        final is401 = e.response?.statusCode == 401;
        final alreadyRetried = req.extra['retried'] == true;
        if (is401 && !alreadyRetried) {
          final ok = await _refresh();
          if (ok) {
            req.extra['retried'] = true;
            req.headers['Authorization'] = 'Bearer ${await _tokens.access()}';
            try {
              return handler.resolve(await dio.fetch(req));
            } catch (err) {
              return handler.next(err is DioException ? err : e);
            }
          }
          await _tokens.clear();
        }
        handler.next(e);
      },
    ));
  }

  /// Rotation du token (mutualisée si plusieurs requêtes échouent en même temps).
  Future<bool> _refresh() {
    if (_refreshing != null) return _refreshing!.future;
    final c = _refreshing = Completer<bool>();
    () async {
      try {
        final rt = await _tokens.refresh();
        if (rt == null) return c.complete(false);
        final res = await _bare.post('/auth/refresh', data: {'refreshToken': rt});
        await _tokens.save(res.data['accessToken'] as String, res.data['refreshToken'] as String);
        c.complete(true);
      } catch (_) {
        c.complete(false);
      } finally {
        _refreshing = null;
      }
    }();
    return c.future;
  }
}
