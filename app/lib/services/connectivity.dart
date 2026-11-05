import 'package:connectivity_plus/connectivity_plus.dart';

/// Expose l'état réseau (en ligne / hors ligne).
class ConnectivityService {
  final _c = Connectivity();

  bool _isOnline(List<ConnectivityResult> r) =>
      r.any((x) => x != ConnectivityResult.none);

  Stream<bool> get online$ => _c.onConnectivityChanged.map(_isOnline);

  Future<bool> isOnline() async => _isOnline(await _c.checkConnectivity());
}
