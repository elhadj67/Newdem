import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Conserve les jetons (access + refresh) de façon sécurisée.
class TokenStore {
  static const _access = 'newdem_access';
  static const _refresh = 'newdem_refresh';
  final _storage = const FlutterSecureStorage();

  Future<void> save(String access, String refresh) async {
    await _storage.write(key: _access, value: access);
    await _storage.write(key: _refresh, value: refresh);
  }

  Future<void> saveAccess(String access) => _storage.write(key: _access, value: access);

  Future<String?> access() => _storage.read(key: _access);
  Future<String?> refresh() => _storage.read(key: _refresh);

  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }
}
