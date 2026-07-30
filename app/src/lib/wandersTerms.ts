/**
 * RR Wanders quotation terms — working commercial draft.
 * Governing law / jurisdiction clauses stay TBC until owner confirms.
 * Conditional clauses must be removed or marked Not applicable before issue.
 */

import { WANDERS_TERMS_VERSION } from './wandersConfig'

export type WandersTermsOptions = {
  includeFlightsClause?: boolean
  includePrivateServicesClause?: boolean
  includeGrandCabinClause?: boolean
  includeMinGroupSizeClause?: boolean
  depositPercent?: number
  holdBusinessDays?: number
  balanceDaysBefore?: string
  governingLaw?: string
  disputeJurisdiction?: string
  version?: string
}

export function buildWandersTermsText(opts: WandersTermsOptions = {}): string {
  const deposit = opts.depositPercent ?? 50
  const hold = opts.holdBusinessDays ?? 3
  const balance = opts.balanceDaysBefore || '30-45'
  const version = opts.version || WANDERS_TERMS_VERSION
  const law = opts.governingLaw || 'TBC'
  const courts = opts.disputeJurisdiction || 'TBC'
  const na = (include: boolean | undefined, text: string) =>
    include === false ? `${text}\n[Not applicable — removed for this quotation]` : text

  const clauses: string[] = [
    `RR WANDERS TERMS AND CONDITIONS — Version ${version}`,
    '',
    'IMPORTANT NOTICE',
    '1. Rates and availability — All rates are subject to availability and change until the required payment has been received and the booking has been confirmed.',
    '2. Validity of quotation — This quotation is valid only until the expiry date shown on it.',
    na(
      opts.includeMinGroupSizeClause !== false,
      '3. Group size and bracket rate — The quoted price is based on the stated number of passengers. If the final number changes or does not meet the specified minimum requirement, including a minimum of 10 passengers where applicable, the price will be recalculated.',
    ),
    na(
      opts.includeGrandCabinClause !== false,
      '4. Transport — Grand Cabin vans will be used where specified. For groups of 25 passengers or more, a tourist bus may be considered, subject to availability and a corresponding rate adjustment.',
    ),
    '5. Hotels — If a quoted hotel is unavailable, a similar hotel of a comparable category may be offered. Any price difference will be communicated before confirmation where possible.',
    na(
      opts.includePrivateServicesClause !== false,
      '6. Private services — Where stated, tour services will be private and exclusive to the confirmed group. This does not automatically include flights, hotels, public attractions or shared services.',
    ),
    '7. Itinerary changes — The itinerary may be changed when reasonably necessary because of local conditions, weather, safety, road closures, attraction availability, government restrictions or circumstances outside RR Wanders’ reasonable control.',
    na(
      opts.includeFlightsClause !== false,
      '8. Flights — Flights are excluded unless specifically listed as included. When RR Wanders arranges flights, they are charged separately. Airfares remain subject to availability and change until tickets are issued.',
    ),
    '9. Visa and document assistance — RR Wanders does not issue or guarantee visas. Where requested, RR Wanders may assist with document preparation or online application submission. Visa and entry decisions remain with the relevant authorities.',
    '',
    'DEPOSIT AND PAYMENT',
    `10. Guarantee deposit — A guarantee deposit of ${deposit}% of the total booking value is required to secure the reservation unless a different amount is stated in the quotation or Confirmation Invoice. The deposit is non-refundable once the booking has been confirmed or committed to suppliers, subject to applicable mandatory law.`,
    `11. Deposit deadline — The guarantee deposit must be paid within ${hold} business days of receiving the Confirmation Invoice.`,
    `12. Booking holding period — A provisional booking may be held for a maximum of ${hold} business days, subject to supplier conditions.`,
    `13. Full payment — Full payment must normally be received ${balance} days before departure according to the deadline on the Confirmation Invoice.`,
    '14. Bookings made close to departure — For bookings made fewer than 30 days before departure, full payment must be received within three days of the Confirmation Invoice or by an earlier supplier/ticketing deadline.',
    '15. Different currencies — Payments may be accepted in an approved currency. RR Wanders must receive the full net amount due after bank/conversion charges.',
    '16. Supplier payments — Customer payments may be used to secure third-party services. Once booked or financially committed, corresponding amounts may become non-refundable.',
    '',
    'DATE CHANGES / IMMIGRATION / CANCELLATION',
    '17–21. Date-transfer, passenger changes, passenger document responsibility and immigration decisions apply as set out in the RR Wanders commercial terms draft.',
    '22–30. Cancellation requests must be in writing. Confirmed non-refundable services are not refunded except to the extent recovered from suppliers and required by mandatory law. Refunds are processed only after supplier funds are received.',
    '',
    'ADDITIONAL CONDITIONS',
    '31–51. Force majeure, travel insurance recommendation, health disclosures, accurate passenger information, third-party suppliers, gifts/photography consent, privacy, minors, payment clearance, complaints and liability/mandatory rights apply as set out in the full terms draft.',
    '',
    `52. Governing law and disputes — Governing law: ${law}. Courts / dispute resolution: ${courts}. Until confirmed after legal review, no assumed jurisdiction (including UAE law) applies.`,
    '',
    'CUSTOMER ACCEPTANCE',
    'Payment of the deposit or full amount confirms that the customer has reviewed and accepted the quotation and itinerary, inclusions/exclusions, passenger and room details, payment schedule, cancellation/refund conditions, applicable supplier and airline terms, and this recorded RR Wanders terms version.',
    '',
    'These terms are a working commercial draft and require review against the laws of RR Wanders’ registered country and mandatory consumer rights in the customer’s country.',
  ]

  return clauses.join('\n')
}

export type AcceptedTermsSnapshot = {
  version: string
  text: string
  accepted_at: string
  accepted_by: string
  acceptance_method: string
  options: WandersTermsOptions
}
