import 'package:latlong2/latlong.dart';

enum VehicleType { car, moto }

extension VehicleTypeX on VehicleType {
  String get api => name; // 'car' | 'moto'
  String get label => this == VehicleType.car ? 'Voiture' : 'Moto';
  static VehicleType from(String s) =>
      s == 'moto' ? VehicleType.moto : VehicleType.car;
}

enum PaymentMethod { cash, wave, orangeMoney }

extension PaymentMethodX on PaymentMethod {
  String get api => switch (this) {
        PaymentMethod.cash => 'cash',
        PaymentMethod.wave => 'wave',
        PaymentMethod.orangeMoney => 'orange_money',
      };
  String get label => switch (this) {
        PaymentMethod.cash => 'Espèces',
        PaymentMethod.wave => 'Wave',
        PaymentMethod.orangeMoney => 'Orange Money',
      };
}

/// Point géographique. Attention à l'ordre attendu par l'API : {lng, lat}.
class GeoPoint {
  final double lng;
  final double lat;
  final String? label;
  const GeoPoint({required this.lng, required this.lat, this.label});

  LatLng get latLng => LatLng(lat, lng);
  factory GeoPoint.fromLatLng(LatLng p, {String? label}) =>
      GeoPoint(lng: p.longitude, lat: p.latitude, label: label);

  Map<String, dynamic> toJson() =>
      {'lng': lng, 'lat': lat, if (label != null) 'label': label};
}

class FareQuote {
  final VehicleType vehicleType;
  final int fare; // FCFA
  final double commissionPct;
  FareQuote({required this.vehicleType, required this.fare, required this.commissionPct});

  factory FareQuote.fromJson(Map<String, dynamic> j) => FareQuote(
        vehicleType: VehicleTypeX.from(j['vehicleType'] as String),
        fare: (j['fare'] as num).toInt(),
        commissionPct: (j['commissionPct'] as num?)?.toDouble() ?? 0.18,
      );
}

class TripEstimate {
  final double distanceKm;
  final int durationMin;
  final List<FareQuote> quotes;
  TripEstimate({required this.distanceKm, required this.durationMin, required this.quotes});

  factory TripEstimate.fromJson(Map<String, dynamic> j) => TripEstimate(
        distanceKm: (j['distanceKm'] as num).toDouble(),
        durationMin: (j['durationMin'] as num).toInt(),
        quotes: (j['quotes'] as List)
            .map((e) => FareQuote.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  int fareFor(VehicleType t) =>
      quotes.firstWhere((q) => q.vehicleType == t).fare;
}

class Trip {
  final String id;
  final String status;
  final int fare;
  Trip({required this.id, required this.status, required this.fare});

  factory Trip.fromJson(Map<String, dynamic> j) => Trip(
        id: j['tripId'] as String? ?? j['id'] as String,
        status: j['status'] as String? ?? 'requested',
        fare: (j['fare'] as num?)?.toInt() ??
            (j['quotedFare'] as num?)?.toInt() ??
            0,
      );
}

/// Ligne d'historique (réponse de /trips/history).
class TripSummary {
  final String id;
  final VehicleType vehicleType;
  final String status;
  final String? from;
  final String? to;
  final int fare;
  final int? commission;
  final String? paymentMethod;
  final DateTime date;

  TripSummary({
    required this.id,
    required this.vehicleType,
    required this.status,
    required this.from,
    required this.to,
    required this.fare,
    required this.commission,
    required this.paymentMethod,
    required this.date,
  });

  factory TripSummary.fromJson(Map<String, dynamic> j) => TripSummary(
        id: j['id'] as String,
        vehicleType: VehicleTypeX.from(j['vehicleType'] as String),
        status: j['status'] as String,
        from: j['from'] as String?,
        to: j['to'] as String?,
        fare: (j['fare'] as num?)?.toInt() ?? 0,
        commission: (j['commission'] as num?)?.toInt(),
        paymentMethod: j['paymentMethod'] as String?,
        date: DateTime.parse(j['date'] as String),
      );
}
