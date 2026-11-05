import 'package:flutter_test/flutter_test.dart';
import 'package:newdem_app/models/models.dart';

void main() {
  group('GeoPoint', () {
    test('sérialise dans l\'ordre {lng, lat} attendu par l\'API', () {
      final p = const GeoPoint(lng: -17.44, lat: 14.69, label: 'Dakar');
      final j = p.toJson();
      expect(j['lng'], -17.44);
      expect(j['lat'], 14.69);
      expect(j['label'], 'Dakar');
    });
  });

  group('VehicleType', () {
    test('mappe depuis la chaîne API', () {
      expect(VehicleTypeX.from('moto'), VehicleType.moto);
      expect(VehicleTypeX.from('car'), VehicleType.car);
    });
    test('libellés en français', () {
      expect(VehicleType.car.label, 'Voiture');
      expect(VehicleType.moto.label, 'Moto');
    });
  });

  group('PaymentMethod', () {
    test('valeurs API', () {
      expect(PaymentMethod.orangeMoney.api, 'orange_money');
      expect(PaymentMethod.wave.api, 'wave');
      expect(PaymentMethod.cash.api, 'cash');
    });
  });

  group('TripEstimate', () {
    test('parse et retrouve le tarif par type', () {
      final est = TripEstimate.fromJson({
        'distanceKm': 6.2,
        'durationMin': 22,
        'quotes': [
          {'vehicleType': 'car', 'fare': 2900, 'commissionPct': 0.18},
          {'vehicleType': 'moto', 'fare': 1450, 'commissionPct': 0.18},
        ],
      });
      expect(est.distanceKm, 6.2);
      expect(est.fareFor(VehicleType.car), 2900);
      expect(est.fareFor(VehicleType.moto), 1450);
    });
  });

  group('TripSummary', () {
    test('parse une ligne d\'historique', () {
      final t = TripSummary.fromJson({
        'id': 'abc',
        'vehicleType': 'moto',
        'status': 'completed',
        'from': 'Sacré-Cœur',
        'to': 'Plateau',
        'fare': 1450,
        'commission': 261,
        'paymentMethod': 'wave',
        'date': '2026-07-14T10:00:00.000Z',
      });
      expect(t.vehicleType, VehicleType.moto);
      expect(t.fare, 1450);
      expect(t.commission, 261);
      expect(t.to, 'Plateau');
    });
  });
}
