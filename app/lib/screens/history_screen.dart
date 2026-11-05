import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';

final _fmt = NumberFormat.decimalPattern('fr');
final _date = DateFormat('d MMM y · HH:mm', 'fr');

const _statusLabel = {
  'completed': 'Terminée',
  'cancelled': 'Annulée',
  'no_driver': 'Sans chauffeur',
  'in_progress': 'En cours',
};

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  List<TripSummary>? _trips;
  String? _error;
  bool _offline = false;

  static const _cacheKey = 'history';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // 1) Afficher le cache immédiatement s'il existe.
    try {
      final cached = await ref.read(localCacheProvider).getJson(_cacheKey);
      if (cached is List && mounted) {
        setState(() => _trips = cached
            .map((e) => TripSummary.fromJson(e as Map<String, dynamic>))
            .toList());
      }
    } catch (_) {}

    // 2) Rafraîchir depuis le réseau ; en cas d'échec, garder le cache.
    try {
      final raw = await ref.read(tripsApiProvider).historyRaw();
      await ref.read(localCacheProvider).setJson(_cacheKey, raw);
      if (mounted) {
        setState(() {
          _trips = raw.map((e) => TripSummary.fromJson(e as Map<String, dynamic>)).toList();
          _offline = false;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _offline = true;
          if (_trips == null) _error = 'Aucune donnée hors-ligne.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mes courses')),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: NewdemColors.accent)))
          : _trips == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    if (_offline)
                      Container(
                        width: double.infinity,
                        color: const Color(0xFFFFF3EE),
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                        child: const Text('Hors ligne — données en cache',
                            style: TextStyle(color: NewdemColors.accent, fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                    Expanded(
                      child: _trips!.isEmpty
                          ? const Center(child: Text('Aucune course pour le moment.',
                              style: TextStyle(color: NewdemColors.muted)))
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView.separated(
                                padding: const EdgeInsets.all(16),
                                itemCount: _trips!.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 10),
                                itemBuilder: (_, i) => _tile(_trips![i]),
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _tile(TripSummary t) {
    final isCar = t.vehicleType == VehicleType.car;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: NewdemColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
                color: (isCar ? NewdemColors.teal : NewdemColors.accent).withOpacity(.12),
                borderRadius: BorderRadius.circular(10)),
            child: Icon(isCar ? Icons.directions_car : Icons.two_wheeler,
                color: isCar ? NewdemColors.teal : NewdemColors.accent, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t.to ?? 'Destination',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                if (t.from != null)
                  Text('depuis ${t.from}', maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: NewdemColors.muted, fontSize: 12)),
                const SizedBox(height: 4),
                Text(_date.format(t.date.toLocal()),
                    style: const TextStyle(color: NewdemColors.muted, fontSize: 11)),
                if (t.commission != null)
                  Text('Commission : ${_fmt.format(t.commission)} F',
                      style: const TextStyle(color: NewdemColors.accent, fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${_fmt.format(t.fare)} F',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 4),
              Text(_statusLabel[t.status] ?? t.status,
                  style: TextStyle(
                    fontSize: 11,
                    color: t.status == 'completed' ? NewdemColors.cash : NewdemColors.muted,
                    fontWeight: FontWeight.w600,
                  )),
            ],
          ),
        ],
      ),
    );
  }
}
