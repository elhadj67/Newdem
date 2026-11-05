import 'package:flutter/material.dart';

/// Identité Newdem (reprise du prototype / du dossier d'architecture).
class NewdemColors {
  static const teal = Color(0xFF0B6E6E);
  static const tealDark = Color(0xFF084F4F);
  static const ink = Color(0xFF0E1B1B);
  static const accent = Color(0xFFE4572E);
  static const wave = Color(0xFF12BFE3);
  static const orange = Color(0xFFFF7900);
  static const cash = Color(0xFF12B886);
  static const sand = Color(0xFFF4F8F7);
  static const line = Color(0xFFE2ECEA);
  static const muted = Color(0xFF6B7A78);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorSchemeSeed: NewdemColors.teal,
    scaffoldBackgroundColor: NewdemColors.sand,
    fontFamily: 'Roboto',
  );
  return base.copyWith(
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: NewdemColors.teal,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
  );
}
