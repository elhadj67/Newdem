/// Configuration réseau. En dev, l'émulateur Android voit l'hôte via 10.0.2.2.
/// Surcharger au build : --dart-define=API_BASE=https://api.newdem.sn
class Config {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:3000',
  );

  // Le socket partage l'hôte de l'API (passerelle Socket.IO NestJS).
  static const wsBase = String.fromEnvironment(
    'WS_BASE',
    defaultValue: 'http://10.0.2.2:3000',
  );

  // Centre de carte par défaut : Dakar.
  static const dakarLat = 14.6928;
  static const dakarLng = -17.4467;
}
