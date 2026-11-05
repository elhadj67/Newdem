-- Barèmes initiaux (valeurs d'illustration, à caler sur l'étude terrain).
INSERT INTO pricing (vehicle_type, base_fare, per_km, per_min, minimum_fare, commission_pct) VALUES
  ('car',  500, 300, 25, 1000, 0.180),
  ('moto', 250, 150, 15,  500, 0.180);
