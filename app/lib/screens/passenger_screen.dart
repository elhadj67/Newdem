import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/providers.dart';

final _fmt = NumberFormat.decimalPattern('fr');

class PassengerScreen extends ConsumerStatefulWidget {
  const PassengerScreen({super.key});
  @override
  ConsumerState<PassengerScreen> createState() => _PassengerScreenState();
}

class _PassengerScreenState extends ConsumerState<PassengerScreen> {
  final _map = MapController();
  final _search = TextEditingController();
  Timer? _debounce;

  GeoPoint _pickup = const GeoPoint(lng: Config.dakarLng, lat: Config.dakarLat, label: 'Dakar');
  List<GeoPoint> _results = [];
  bool _searching = false;
  int _stars = 5;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    final pos = await ref.read(locationProvider).current();
    if (pos != null && mounted) {
      setState(() => _pickup = pos);
      _map.move(pos.latLng, 14);
    }
  }

  void _onSearchChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      if (q.trim().length < 3) {
        setState(() => _results = []);
        return;
      }
      setState(() => _searching = true);
      try {
        final r = await ref.read(geocodingProvider).search(q);
        if (mounted) setState(() => _results = r);
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final flow = ref.watch(tripControllerProvider);
    return Stack(
      children: [
        _mapView(flow),
        Align(alignment: Alignment.bottomCenter, child: _sheet(context, flow)),
      ],
    );
  }

  Widget _mapView(TripFlow flow) {
    final markers = <Marker>[
      _marker(_pickup.latLng, NewdemColors.teal, Icons.my_location),
      if (flow.destination != null) _marker(flow.destination!.latLng, NewdemColors.accent, Icons.place),
      if (flow.driverPos != null) _marker(flow.driverPos!, NewdemColors.ink, Icons.local_taxi),
    ];
    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: LatLng(Config.dakarLat, Config.dakarLng),
        initialZoom: 12.5,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'sn.newdem.app',
        ),
        MarkerLayer(markers: markers),
      ],
    );
  }

  Marker _marker(LatLng p, Color color, IconData icon) => Marker(
        point: p,
        width: 40,
        height: 40,
        child: Container(
          decoration: BoxDecoration(color: color, shape: BoxShape.circle, boxShadow: const [
            BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 2)),
          ]),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      );

  Widget _sheet(BuildContext context, TripFlow flow) {
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.62),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 20),
      child: SingleChildScrollView(
        child: switch (flow.phase) {
          TripPhase.home => _home(),
          TripPhase.quotes => _quotes(flow),
          TripPhase.matching => _matching(),
          TripPhase.enroute => _enroute(),
          TripPhase.inTrip => _inTrip(flow),
          TripPhase.payment => _payment(context, flow),
          TripPhase.done => _done(),
        },
      ),
    );
  }

  Widget _handle() => Center(
      child: Container(width: 38, height: 4, margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: NewdemColors.line, borderRadius: BorderRadius.circular(9))));

  Widget _title(String t, [String? s]) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          if (s != null) Padding(padding: const EdgeInsets.only(top: 2),
              child: Text(s, style: const TextStyle(color: NewdemColors.muted, fontSize: 13))),
        ],
      );

  // ------- home : recherche d'adresses -------
  Widget _home() {
    final ctrl = ref.read(tripControllerProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _handle(),
        _title('Où allez-vous ?', 'Depuis ${_pickup.label}'),
        const SizedBox(height: 12),
        TextField(
          controller: _search,
          onChanged: _onSearchChanged,
          decoration: InputDecoration(
            hintText: 'Rechercher une adresse à Dakar',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _searching
                ? const Padding(padding: EdgeInsets.all(12),
                    child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
                : null,
            filled: true,
            fillColor: NewdemColors.sand,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 8),
        for (final p in _results)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined, color: NewdemColors.teal),
            title: Text(p.label ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
            onTap: () {
              FocusScope.of(context).unfocus();
              ctrl.estimate(_pickup, p);
            },
          ),
      ],
    );
  }

  Widget _quotes(TripFlow flow) {
    final ctrl = ref.read(tripControllerProvider.notifier);
    final est = flow.estimate!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _handle(),
        _title('Choisissez votre course', 'Vers ${flow.destination!.label} · ${est.distanceKm} km'),
        const SizedBox(height: 12),
        for (final t in VehicleType.values)
          _rideCard(t, est.fareFor(t), flow.type == t, () => ctrl.setType(t)),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: ctrl.order,
          child: Text('Commander · ${_fmt.format(est.fareFor(flow.type))} FCFA'),
        ),
        if (flow.error != null)
          Padding(padding: const EdgeInsets.only(top: 10),
              child: Text(flow.error!, style: const TextStyle(color: NewdemColors.accent))),
      ],
    );
  }

  Widget _rideCard(VehicleType t, int fare, bool on, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: on ? NewdemColors.teal : NewdemColors.line, width: 1.5),
            borderRadius: BorderRadius.circular(16),
            color: on ? const Color(0xFFF2FAF9) : Colors.white,
          ),
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                    color: t == VehicleType.car ? NewdemColors.teal : NewdemColors.accent,
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(t == VehicleType.car ? Icons.directions_car : Icons.two_wheeler, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Text(t.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              const Spacer(),
              Text('${_fmt.format(fare)} FCFA', style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      );

  Widget _matching() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(children: [
          const CircularProgressIndicator(color: NewdemColors.teal),
          const SizedBox(height: 16),
          _title("Recherche d'un chauffeur…"),
        ]),
      );

  Widget _enroute() => Column(children: [
        _handle(),
        const ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(backgroundColor: NewdemColors.teal, child: Icon(Icons.person, color: Colors.white)),
          title: Text('Votre chauffeur arrive', style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('Suivez son approche sur la carte'),
        ),
      ]);

  Widget _inTrip(TripFlow flow) => Column(children: [
        _handle(),
        _title('Course en cours', 'Vers ${flow.destination!.label}'),
        const SizedBox(height: 8),
        const LinearProgressIndicator(color: NewdemColors.teal, backgroundColor: NewdemColors.line),
      ]);

  Widget _payment(BuildContext context, TripFlow flow) {
    final ctrl = ref.read(tripControllerProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _handle(),
        _title('Comment payez-vous ?', 'Course terminée · ${_fmt.format(flow.fare)} FCFA'),
        const SizedBox(height: 8),
        for (final m in PaymentMethod.values)
          RadioListTile<PaymentMethod>(
            contentPadding: EdgeInsets.zero,
            value: m,
            groupValue: flow.method,
            activeColor: NewdemColors.teal,
            title: Text(m.label),
            onChanged: (v) => ctrl.selectMethod(v!),
          ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () async {
            final url = await ctrl.pay();
            if (url != null) {
              await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
            }
          },
          child: Text(flow.method == PaymentMethod.cash
              ? 'Confirmer le paiement en espèces'
              : 'Payer avec ${flow.method.label}'),
        ),
      ],
    );
  }

  // ------- done : notation -------
  Widget _done() {
    final ctrl = ref.read(tripControllerProvider.notifier);
    return Column(children: [
      _handle(),
      const Icon(Icons.check_circle, color: NewdemColors.cash, size: 44),
      const SizedBox(height: 6),
      _title('Course terminée', 'Notez votre chauffeur'),
      const SizedBox(height: 8),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(5, (i) {
          final n = i + 1;
          return IconButton(
            onPressed: () => setState(() => _stars = n),
            icon: Icon(n <= _stars ? Icons.star : Icons.star_border,
                color: const Color(0xFFF2A93B), size: 34),
          );
        }),
      ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: () async {
          await ctrl.rate(_stars);
          ctrl.reset();
          setState(() {
            _stars = 5;
            _search.clear();
            _results = [];
          });
        },
        child: const Text('Envoyer et terminer'),
      ),
    ]);
  }
}
