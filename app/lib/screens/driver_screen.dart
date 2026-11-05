import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/theme.dart';
import '../state/providers.dart';
import 'kyc_screen.dart';

final _fmt = NumberFormat.decimalPattern('fr');

/// Mode chauffeur : profil et portefeuille via /drivers/me et /wallets/me,
/// passage en ligne via /drivers/status + socket, offres en temps réel.
class DriverScreen extends ConsumerStatefulWidget {
  const DriverScreen({super.key});
  @override
  ConsumerState<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends ConsumerState<DriverScreen> {
  String? _driverId;
  String _kyc = 'pending';
  Map<String, dynamic>? _wallet;
  bool _online = false;
  bool _loading = true;
  Map<String, dynamic>? _offer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(driversApiProvider);
      final me = await api.me();
      final w = await api.wallet();
      if (!mounted) return;
      setState(() {
        _driverId = me['id'] as String?;
        _online = me['status'] == 'online';
        _kyc = me['kycStatus'] as String? ?? 'pending';
        _wallet = w;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleOnline(bool v) async {
    try {
      await ref.read(driversApiProvider).setOnline(v);
      final rt = ref.read(realtimeProvider);
      if (v && _driverId != null) {
        rt.driverOnline(_driverId!);
        rt.on('ride:offer', (d) => setState(() => _offer = Map<String, dynamic>.from(d as Map)));
      } else {
        rt.off('ride:offer');
        rt.untrack('driver:online');
        _offer = null;
      }
      setState(() => _online = v);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Passage en ligne refusé (solde ?)')),
        );
      }
    }
  }

  Future<void> _accept() async {
    final id = _offer?['tripId'] as String?;
    if (id != null) {
      await ref.read(tripsApiProvider).accept(id);
      setState(() => _offer = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final approved = _kyc == 'approved';
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        if (!approved) _kycBanner(),
        if (!approved) const SizedBox(height: 12),
        Card(
          child: SwitchListTile(
            value: _online,
            activeColor: NewdemColors.cash,
            title: Text(_online ? 'Vous êtes en ligne' : 'Hors ligne',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(approved
                ? (_online ? 'Vous recevez des courses' : 'Activez pour recevoir des courses')
                : 'Profil à vérifier avant de recevoir des courses'),
            onChanged: approved ? _toggleOnline : null,
          ),
        ),
        const SizedBox(height: 12),
        _walletCard(),
        if (_offer != null) ...[const SizedBox(height: 12), _offerCard()],
        if (_wallet != null) ...[const SizedBox(height: 16), _ledger()],
      ],
    );
  }

  Widget _kycBanner() => Material(
        color: const Color(0xFFFFF3EE),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () async {
            await Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const KycScreen()),
            );
            _load(); // rafraîchit le statut au retour
          },
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              const Icon(Icons.verified_user_outlined, color: NewdemColors.accent),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Vérifiez votre profil', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('Ajoutez vos pièces pour commencer à conduire',
                        style: TextStyle(fontSize: 12, color: NewdemColors.muted)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: NewdemColors.muted),
            ]),
          ),
        ),
      );

  Widget _walletCard() {
    final bal = (_wallet?['balance'] as num?)?.toInt() ?? 0;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [NewdemColors.teal, NewdemColors.tealDark]),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('PORTEFEUILLE CONDUCTEUR',
              style: TextStyle(color: Colors.white70, fontSize: 11, letterSpacing: .5)),
          const SizedBox(height: 6),
          Text('${_fmt.format(bal)} FCFA',
              style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('La commission Newdem est prélevée ici, même sur les courses en espèces.',
              style: TextStyle(color: Colors.white70, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _ledger() {
    final entries = (_wallet?['ledger'] as List?) ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Derniers mouvements', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final e in entries.take(8))
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text((e['note'] as String?) ?? (e['type'] as String), style: const TextStyle(fontSize: 13)),
            trailing: Text(
              '${(e['amount'] as num) >= 0 ? '+' : ''}${_fmt.format(e['amount'])} F',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: (e['amount'] as num) >= 0 ? NewdemColors.cash : NewdemColors.accent,
              ),
            ),
          ),
      ],
    );
  }

  Widget _offerCard() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFF2FAF9),
          border: Border.all(color: NewdemColors.teal, width: 1.5),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(children: [
          const Text('Nouvelle course', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('Distance : ${(((_offer?['distanceM'] as num?) ?? 0) / 1000).toStringAsFixed(1)} km',
              style: const TextStyle(color: NewdemColors.muted)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() => _offer = null),
                child: const Text('Refuser'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: FilledButton(onPressed: _accept, child: const Text('Accepter'))),
          ]),
        ]),
      );
}
