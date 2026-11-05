import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Cache clé-valeur JSON pour les données consultables hors-ligne (historique…).
class LocalCache {
  Future<SharedPreferences> get _p => SharedPreferences.getInstance();

  Future<void> setJson(String key, Object value) async =>
      (await _p).setString(key, jsonEncode(value));

  Future<dynamic> getJson(String key) async {
    final s = (await _p).getString(key);
    return s == null ? null : jsonDecode(s);
  }
}
