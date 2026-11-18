# FLOWIE delivery clarification and separate payment contract

This contract separates delivery only when the address is unknown. If checkout already knows the address, the existing `DELIVERY_TARIFF_RUB` remains in the main bouquet payment. Money values are integer RUB; Alfa uses ISO-4217 numeric currency `643` and kopecks only at the bank boundary.

## Create order

`POST /api/orders`

Additional request fields:

```json
{
  "askRecipientAddress": true,
  "askRecipientTime": true,
  "recipientPhone": "+79990000000"
}
```

- `askRecipientAddress` and `askRecipientTime` are strict booleans and default to `false` for compatibility.
- If either flag is `true`, `recipientPhone` is mandatory and the corresponding address/time may be omitted. FLOWIE contacts the recipient outside this API flow.
- If `askRecipientAddress=false`, `deliveryAddress` is mandatory. The configured `DELIVERY_TARIFF_RUB` is charged in the main payment even when `askRecipientTime=true`; unknown time alone never makes delivery price unknown.
- Optional `deliveryCoords` accepts `{ "lat": 56.8527, "lon": 53.2115 }` or a validated `"lat,lon"` string and is stored as a normalized JSON string for the post-order pin.
- If `askRecipientAddress=true`, the order starts with `deliveryStatus=DETAILS_PENDING`, `deliveryCost=null`, and the main `totalPrice` contains products only.
- A known address uses `deliveryStatus=INCLUDED_IN_MAIN` when no detail is pending, otherwise `DETAILS_PENDING`; `deliveryCost` and `totalPrice` include the configured tariff.
- `deliveryCost=null` means unknown/pending, never free. `deliveryCost=0` is allowed only as an explicit staff decision after clarification.

Relevant response fields:

```json
{
  "askRecipientAddress": true,
  "askRecipientTime": true,
  "deliveryStatus": "DETAILS_PENDING",
  "deliveryCost": null,
  "itemsTotal": 5000,
  "totalPrice": 5000,
  "deliveryInvoice": null
}
```

## Staff resolves details and issues the delivery invoice

`POST /api/admin/orders/:orderId/delivery-quote`

Requires existing admin authentication (`X-TG-InitData` or the supported admin session) and an active `admin`, `moderator`, or `florist` role.

```json
{
  "quoteKey": "3f85a2ac-4192-4f81-b2f4-73a689cb61f7",
  "deliveryAddress": "Ижевск, Пушкинская улица, 10",
  "deliveryTime": "19 ноября, 18:00–20:00",
  "amount": 700
}
```

- The main bouquet payment must already be `CONFIRMED`; cancelled orders cannot be quoted.
- UUID `quoteKey` is mandatory. Address/time are required for whichever clarification flags were requested.
- For an address that was unknown (`askRecipientAddress=true`), `amount` is a safe integer `>= 0`: positive creates a separate invoice; zero explicitly waives delivery and creates no bank invoice.
- For an address already known, `amount` is omitted: staff resolves the requested time, the existing delivery tariff stays in the main payment, and no separate invoice is created.
- Identical retries return the same invoice. Reusing a key with changed data or attempting to replace an existing invoice returns `409`.
- The operation preserves the original clarification flags as audit facts, saves resolved details, and moves `deliveryStatus` to `PAYMENT_PENDING`, `WAIVED`, or `INCLUDED_IN_MAIN`.
- The invoice is valid for 24 hours by default (`DELIVERY_INVOICE_TTL_HOURS`, bounded server-side). Expiry never turns its amount into zero.

## Client reads and pays its delivery invoice

- `GET /api/payments/delivery?orderId=:id`
- `POST /api/payments/delivery/alfa-register` with `{ "orderId": 123 }`
- `GET /api/payments/delivery/alfa-status?orderId=:id`
- Alfa callback: `POST /api/payments/delivery/alfa-callback`

Only the owning customer can use the first three endpoints. The callback identifies an invoice only by its isolated bank order ID and then verifies the bank directly.

Invoice statuses: `PAYMENT_PENDING`, `PAID`, `CANCELLED`, `EXPIRED`, `RECONCILIATION_REQUIRED`. A zero-cost waiver has no invoice.

- Registration is idempotent and concurrency-locked independently from the bouquet payment.
- The bank order number is prefixed `flowie-delivery-`; metadata and charge ID are stored on `DeliveryInvoice`, never on the main `Order` payment fields.
- Status/callback accept success only for exact invoice amount in kopecks and currency `643`.
- A paid invoice sets `Order.deliveryStatus=PAID`; it does not change the main `paymentStatus`, `paidAt`, or `totalPrice`.
- An expired invoice with no bank order is renewed safely on the next registration. If a bank order already exists, the client must sync status first; a bank-declined/expired result releases it and extends the same invoice for retry.

## Cancellation and dispatch invariant

- Cancelling an order cancels an unpaid delivery invoice. Its real bank order ID is preserved so a late successful callback becomes `RECONCILIATION_REQUIRED`; a paid delivery invoice also becomes `RECONCILIATION_REQUIRED` so a refund/reconciliation cannot be hidden.
- Transition to `IN_DELIVERY` is rejected at the database boundary unless `deliveryStatus` is `PAID`, `WAIVED`, `INCLUDED_IN_MAIN` (or `NOT_REQUIRED` for migrated legacy orders), the address is resolved, and requested time is resolved.
- Therefore a missing quote, unpaid/expired delivery invoice, or unresolved requested detail cannot be interpreted as free delivery and cannot be dispatched.
