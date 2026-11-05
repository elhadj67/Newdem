import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/theme.dart';
import 'state/providers.dart';
import 'screens/login_screen.dart';
import 'screens/passenger_screen.dart';
import 'screens/driver_screen.dart';
import 'screens/history_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr'); // formats de date en français
  runApp(const ProviderScope(child: NewdemApp()));
}

class NewdemApp extends StatelessWidget {
  const NewdemApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Newdem',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _Root(),
      );
}

/// Aiguillage : écran de connexion tant que l'utilisateur n'est pas authentifié.
class _Root extends ConsumerWidget {
  const _Root();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return auth.authenticated ? const _HomeShell() : const LoginScreen();
  }
}

/// Coquille avec bascule Passager / Chauffeur (comme le prototype).
class _HomeShell extends ConsumerStatefulWidget {
  const _HomeShell();
  @override
  ConsumerState<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<_HomeShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Ouvre le canal temps réel une fois authentifié.
    ref.read(realtimeProvider).connect();
  }

  @override
  Widget build(BuildContext context) {
    final online = ref.watch(onlineProvider).value ?? true;
    // Au retour du réseau, rejouer les écritures mises en file d'attente.
    ref.listen(onlineProvider, (prev, next) {
      if (next.value == true) ref.read(outboxProvider).flush();
    });
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Image.asset('assets/logo.png', height: 30, fit: BoxFit.contain),
        actions: [
          IconButton(
            icon: const Icon(Icons.history, color: NewdemColors.muted),
            tooltip: 'Mes courses',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const HistoryScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: NewdemColors.muted),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: Column(
        children: [
          if (!online)
            Container(
              width: double.infinity,
              color: NewdemColors.ink,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: const Text('Hors ligne', textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          Expanded(child: _tab == 0 ? const PassengerScreen() : const DriverScreen()),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Passager'),
          NavigationDestination(icon: Icon(Icons.two_wheeler_outlined), label: 'Chauffeur'),
        ],
      ),
    );
  }
}
