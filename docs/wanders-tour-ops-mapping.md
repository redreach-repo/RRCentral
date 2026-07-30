# Wanders tour ops — module mapping (app)

Quick reference for UI ↔ data.

| UI (Tour products & ops) | Primary records |
|--------------------------|-----------------|
| Packages | `tour_packages` |
| Suppliers & coordinators | `wanders_partners` |
| Cost components | `package_cost_components` |
| Selling prices | `package_selling_prices` |
| Departures | `scheduled_departures` |
| Customer bookings | `customer_bookings` → `wanders_deals` |

Profitability:

- Package level: sum cost components (by currency) vs selling price (FX required when PHP→INR).
- Departure level: aggregate linked bookings; **do not** auto-profit across INR revenue vs PHP cost without an approved FX rate.
- Booking level: selling vs cost + margin fields on `customer_bookings`.
