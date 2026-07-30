# Zoho field / module mapping — RR Wanders tour ops

## In-app modules (implemented locally)

| App entity | Store / table | Purpose |
|------------|---------------|---------|
| Tour package | `tour_packages` | Product catalogue (market, meal tiers, currencies, status) |
| Partner | `wanders_partners` | Suppliers + coordinators (Christine, Koko, …) |
| Cost component | `package_cost_components` | PHP (or other) cost lines; sum by currency |
| Selling price | `package_selling_prices` | INR (or other) sell + margin snapshot |
| Scheduled departure | `scheduled_departures` | Jan/Feb/Mar windows; capacity; min group; P&L fields |
| Customer booking | `customer_bookings` | Links deal ↔ package ↔ departure ↔ partners |
| Customer lead/deal | `wanders_deals` | Sales pipeline only — not a package record |
| Passenger | `wanders_passengers` | Private pax/passport |

## Suggested Zoho CRM custom modules (admin action required)

These do **not** exist in Zoho for this project yet. API names below are **proposals** and must be confirmed by a Zoho admin before any integration.

| Proposed Zoho module | Proposed API name | Maps from |
|----------------------|-------------------|-----------|
| Tour_Packages | `Tour_Packages` | `tour_packages` |
| Tour_Partners | `Tour_Partners` | `wanders_partners` |
| Package_Cost_Components | `Package_Cost_Components` | `package_cost_components` |
| Package_Selling_Prices | `Package_Selling_Prices` | `package_selling_prices` |
| Scheduled_Departures | `Scheduled_Departures` | `scheduled_departures` |
| Customer_Bookings | `Customer_Bookings` | `customer_bookings` |

### Critical fields to create (if modules are approved)

**Tour_Packages:** Code, Advertising_Market, Destination, Travel_Period, Min_Group_Size, Meal_Tiers, Costing_Method, Supplier_Currency, Customer_Selling_Currency, Status, Primary_Supplier, Primary_Coordinator  

**Tour_Partners:** Partner_Type, Status, Communication_Route, Next_Involvement, Booking_Stage_Responsibility, Currency  

**Scheduled_Departures:** Departure_Date, Capacity, Booked_Pax, Min_Group_Size, Min_Group_Met, Booking_Deadline, Supplier_Confirmation_Status, Revenue, Costs, Profit (+ currency fields)  

**Customer_Bookings:** Deal/Lead lookup, Package lookup, Departure lookup, Supplier lookup, Coordinator lookup, Pax_Count, Meal_Tier, Selling_Amount, Cost_Amount, Status  

## Do not use

- Zoho **Lead Description** (or Notes) as the system of record for packages, partners, departures or costs.

## Standard Leads module

Existing Zoho Leads (if used externally) should remain enquiry/person records only. Link to `Customer_Bookings` / `wanders_deals` when sync is eventually built — do not overload Lead fields with product ops.
