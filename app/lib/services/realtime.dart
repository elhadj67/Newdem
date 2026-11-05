import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/config.dart';
import '../core/token_store.dart';

/// Passerelle Socket.IO avec reconnexion automatique.
///  - JWT passé à la connexion (auth.token). Un socket invalide est rejeté.
///  - Reconnexion auto ; à chaque (re)connexion, les abonnements (salons de
///    course, présence conducteur) sont REJOUÉS pour retrouver le bon état.
///  - `reconnectWithFreshToken()` force une reconnexion avec un access token
///    rafraîchi (après rotation).
class RealtimeService {
  final TokenStore _tokens;
  io.Socket? _socket;
  // Émissions à rejouer après (re)connexion (idempotentes).
  final List<Map<String, dynamic>> _subs = [];
  RealtimeService(this._tokens);

  Future<void> connect() async {
    final token = await _tokens.access();
    _socket = io.io(
      Config.wsBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(1000)
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .setAuth({'token': token})
          .build(),
    );
    _socket!.onConnect((_) => _replay());
    _socket!.connect();
  }

  void _replay() {
    for (final s in _subs) {
      _socket?.emit(s['event'] as String, s['data']);
    }
  }

  void _track(String event, Map<String, dynamic> data) {
    _subs.removeWhere((s) => s['event'] == event);
    _subs.add({'event': event, 'data': data});
  }

  void subscribeTrip(String tripId) {
    _track('trip:subscribe', {'tripId': tripId});
    _socket?.emit('trip:subscribe', {'tripId': tripId});
  }

  void driverOnline(String driverId) {
    _track('driver:online', {'driverId': driverId});
    _socket?.emit('driver:online', {'driverId': driverId});
  }

  /// Arrête de rejouer un abonnement (course terminée, conducteur hors ligne).
  void untrack(String event) => _subs.removeWhere((s) => s['event'] == event);

  // La position est continue : émise directement, jamais rejouée.
  void sendLocation(String driverId, double lng, double lat, {String? tripId}) =>
      _socket?.emit('driver:location', {
        'driverId': driverId, 'lng': lng, 'lat': lat,
        if (tripId != null) 'tripId': tripId,
      });

  void on(String event, void Function(dynamic) handler) => _socket?.on(event, handler);
  void off(String event) => _socket?.off(event);

  /// Reconnexion avec un access token frais (après rotation JWT).
  Future<void> reconnectWithFreshToken() async {
    final token = await _tokens.access();
    _socket?.auth = {'token': token};
    _socket?.disconnect();
    _socket?.connect();
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _subs.clear();
  }
}
