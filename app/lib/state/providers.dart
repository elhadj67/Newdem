import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../core/api_client.dart';
import '../core/token_store.dart';
import '../services/auth_api.dart';
import '../services/trips_api.dart';
import '../services/drivers_api.dart';
import '../services/kyc_api.dart';
import '../services/realtime.dart';
import '../services/geocoding.dart';
import '../services/connectivity.dart';
import '../services/outbox.dart';
import '../core/cache.dart';
import '../models/models.dart';

// -------------------- fournisseurs de base --------------------
final tokenStoreProvider = Provider((_) => TokenStore());
final apiClientProvider = Provider((ref) => ApiClient(ref.read(tokenStoreProvider)));
final authApiProvider =
    Provider((ref) => AuthApi(ref.read(apiClientProvider), ref.read(tokenStoreProvider)));
final tripsApiProvider = Provider((ref) => TripsApi(ref.read(apiClientProvider)));
final driversApiProvider = Provider((ref) => DriversApi(ref.read(apiClientProvider)));
final kycApiProvider = Provider((ref) => KycApi(ref.read(apiClientProvider)));
final realtimeProvider = Provider((ref) => RealtimeService(ref.read(tokenStoreProvider)));
final geocodingProvider = Provider((_) => GeocodingService());
final locationProvider = Provider((_) => LocationService());
final connectivityProvider = Provider((_) => ConnectivityService());
final onlineProvider = StreamProvider<bool>((ref) => ref.read(connectivityProvider).online$);
final localCacheProvider = Provider((_) => LocalCache());
final outboxProvider =
    Provider((ref) => OutboxService(ref.read(apiClientProvider), ref.read(localCacheProvider)));

// -------------------- auth --------------------
class AuthState {
  final bool authenticated;
  final bool codeSent;
  final bool loading;
  final String? error;
  const AuthState({
    this.authenticated = false,
    this.codeSent = false,
    this.loading = false,
    this.error,
  });
  AuthState copy({bool? authenticated, bool? codeSent, bool? loading, String? error}) =>
      AuthState(
        authenticated: authenticated ?? this.authenticated,
        codeSent: codeSent ?? this.codeSent,
        loading: loading ?? this.loading,
        error: error,
      );
}

class AuthController extends StateNotifier<AuthState> {
  final AuthApi _api;
  AuthController(this._api) : super(const AuthState()) {
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    if (await _api.isLoggedIn) state = state.copy(authenticated: true);
  }

  Future<void> requestOtp(String phone) async {
    state = state.copy(loading: true, error: null);
    try {
      await _api.requestOtp(phone);
      state = state.copy(loading: false, codeSent: true);
    } catch (e) {
      state = state.copy(loading: false, error: 'Envoi du code impossible');
    }
  }

  Future<void> verifyOtp(String phone, String code) async {
    state = state.copy(loading: true, error: null);
    try {
      await _api.verifyOtp(phone, code);
      state = state.copy(loading: false, authenticated: true);
    } catch (e) {
      state = state.copy(loading: false, error: 'Code invalide');
    }
  }

  Future<void> logout() async {
    await _api.logout();
    state = const AuthState();
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref.read(authApiProvider)));

// -------------------- flux de course (passager) --------------------
enum TripPhase { home, quotes, matching, enroute, inTrip, payment, done }

class TripFlow {
  final TripPhase phase;
  final GeoPoint? origin;
  final GeoPoint? destination;
  final TripEstimate? estimate;
  final VehicleType type;
  final String? tripId;
  final int fare;
  final PaymentMethod method;
  final LatLng? driverPos;
  final String? error;

  const TripFlow({
    this.phase = TripPhase.home,
    this.origin,
    this.destination,
    this.estimate,
    this.type = VehicleType.car,
    this.tripId,
    this.fare = 0,
    this.method = PaymentMethod.cash,
    this.driverPos,
    this.error,
  });

  TripFlow copy({
    TripPhase? phase,
    GeoPoint? origin,
    GeoPoint? destination,
    TripEstimate? estimate,
    VehicleType? type,
    String? tripId,
    int? fare,
    PaymentMethod? method,
    LatLng? driverPos,
    String? error,
  }) =>
      TripFlow(
        phase: phase ?? this.phase,
        origin: origin ?? this.origin,
        destination: destination ?? this.destination,
        estimate: estimate ?? this.estimate,
        type: type ?? this.type,
        tripId: tripId ?? this.tripId,
        fare: fare ?? this.fare,
        method: method ?? this.method,
        driverPos: driverPos ?? this.driverPos,
        error: error,
      );
}

class TripController extends StateNotifier<TripFlow> {
  final TripsApi _trips;
  final RealtimeService _rt;
  final OutboxService _outbox;
  TripController(this._trips, this._rt, this._outbox) : super(const TripFlow());

  void setType(VehicleType t) => state = state.copy(type: t);

  Future<void> estimate(GeoPoint origin, GeoPoint destination) async {
    state = state.copy(origin: origin, destination: destination, error: null);
    try {
      final est = await _trips.estimate(origin, destination);
      state = state.copy(phase: TripPhase.quotes, estimate: est, fare: est.fareFor(state.type));
    } catch (e) {
      state = state.copy(error: 'Estimation impossible');
    }
  }

  Future<void> order() async {
    final o = state.origin!, d = state.destination!;
    state = state.copy(phase: TripPhase.matching);
    try {
      final trip = await _trips.request(state.type, o, d);
      state = state.copy(tripId: trip.id, fare: trip.fare);
      _listenTrip(trip.id);
    } catch (e) {
      state = state.copy(phase: TripPhase.quotes, error: 'Commande impossible');
    }
  }

  void _listenTrip(String tripId) {
    _rt.subscribeTrip(tripId);
    _rt.on('trip:assigned', (_) => state = state.copy(phase: TripPhase.enroute));
    _rt.on('trip:no_driver', (_) => state = state.copy(phase: TripPhase.quotes, error: 'Aucun chauffeur disponible'));
    _rt.on('trip:in_progress', (_) => state = state.copy(phase: TripPhase.inTrip));
    _rt.on('trip:completed', (_) => state = state.copy(phase: TripPhase.payment));
    _rt.on('driver:location', (data) {
      final m = data as Map;
      state = state.copy(driverPos: LatLng((m['lat'] as num).toDouble(), (m['lng'] as num).toDouble()));
    });
  }

  void selectMethod(PaymentMethod m) => state = state.copy(method: m);

  /// Confirme le paiement. Espèces -> terminé. Mobile money -> URL à ouvrir.
  Future<String?> pay() async {
    final id = state.tripId!;
    try {
      await _trips.complete(id, state.method);
      if (state.method == PaymentMethod.cash) {
        state = state.copy(phase: TripPhase.done);
        return null;
      }
      final url = state.method == PaymentMethod.wave
          ? await _trips.payWave(id)
          : await _trips.payOrangeMoney(id);
      state = state.copy(phase: TripPhase.done);
      return url;
    } catch (e) {
      state = state.copy(error: 'Paiement impossible');
      return null;
    }
  }

  void reset() {
    for (final e in ['trip:assigned', 'trip:no_driver', 'trip:in_progress', 'trip:completed', 'driver:location']) {
      _rt.off(e);
    }
    _rt.untrack('trip:subscribe');
    state = const TripFlow();
  }

  Future<void> rate(int stars, {String? comment}) async {
    final id = state.tripId;
    if (id == null) return;
    try {
      await _trips.rate(id, stars, comment: comment);
    } catch (_) {
      // Hors-ligne : on met la note en file d'attente, rejouée au retour du réseau.
      await _outbox.enqueue('POST', '/trips/$id/rate', {
        'stars': stars,
        if (comment != null) 'comment': comment,
      });
    }
  }
}

final tripControllerProvider = StateNotifierProvider<TripController, TripFlow>(
  (ref) => TripController(
    ref.read(tripsApiProvider),
    ref.read(realtimeProvider),
    ref.read(outboxProvider),
  ),
);
