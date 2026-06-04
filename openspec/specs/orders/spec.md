# Orders

## Purpose

The Orders domain manages the complete lifecycle of a point-of-sale transaction: browsing products, managing a cart, processing payment, recording the order, and reviewing order history. It is the core transactional capability of Sakti POS, enabling cashiers to take orders and process payments (cash or QRIS), while managers and owners can review historical orders and daily summaries.

## Requirements

### R1: Cart Management

The system SHALL maintain an in-memory reactive cart that tracks products and quantities during a POS session.

**WHEN** a cashier taps a product in the product grid
**THEN** the system SHALL add the product to the cart with quantity 1, or increment the quantity by 1 if the product is already in the cart.

**WHEN** a cashier taps the minus button on a cart item with quantity 1
**THEN** the system SHALL remove the item from the cart.

**WHEN** a cashier taps the minus button on a cart item with quantity > 1
**THEN** the system SHALL decrement the quantity by 1.

**WHEN** a cashier taps the plus button on a cart item
**THEN** the system SHALL increment the quantity by 1.

**WHEN** a cashier confirms clearing the cart
**THEN** the system SHALL remove all items from the cart.

**WHEN** the cart is empty
**THEN** the system SHALL display an empty state message ("Keranjang kosong" / "Keranjang Kosong").

**WHEN** the cart contains items
**THEN** the system SHALL display the item count and running total in IDR.

### R2: Product Browsing and Filtering

The system SHALL display active products grouped by category, with category tabs for filtering and a search field for text-based filtering.

**WHEN** a cashier selects a category tab
**THEN** the system SHALL display only products belonging to that category.

**WHEN** a cashier enters search text
**THEN** the system SHALL filter the visible products to those whose name contains the search text (case-insensitive).

**WHEN** no category is selected and no search text is entered
**THEN** the system SHALL display all active products across all categories.

### R3: Order Creation

The system SHALL create an order atomically within a single transaction that inserts the order record, all order item records, and enqueues sync outbox entries.

**WHEN** a cashier confirms payment
**THEN** the system SHALL create one `orders` row and one `order_items` row per cart item, each with `is_synced = false`.

**WHEN** an order is created
**THEN** the system SHALL set the order status to `completed`.

**WHEN** an order is created
**THEN** the system SHALL record the `outletId`, `registerId` (if available), and `staffId` of the current session.

**WHEN** an order is created
**THEN** the system SHALL enqueue one sync outbox entry for the order and one for each order item (operation: `insert`).

**WHEN** order creation succeeds
**THEN** the system SHALL clear the cart, display the order number on screen for 2 seconds, and attempt to print a receipt if a default printer is configured.

**WHEN** order creation fails
**THEN** the system SHALL display an error toast ("Gagal membuat pesanan") and leave the cart unchanged.

### R4: Order Number Generation

The system SHALL generate order numbers in the format `YYYY-MM-DD-NNN`, where `YYYY-MM-DD` is the business date and `NNN` is a zero-padded 3-digit sequential number starting at 001 for each business day.

**WHEN** a new order is created on a business date
**THEN** the system SHALL query existing order numbers with the same date prefix, find the maximum numeric suffix, and increment by 1.

**WHEN** no orders exist for the current business date
**THEN** the system SHALL assign order number `YYYY-MM-DD-001`.

**WHEN** the business date is derived from the outlet timezone
**THEN** the system SHALL use the outlet's configured timezone to determine the business date from the current UTC timestamp.

### R5: Payment Processing

The system SHALL support two payment methods: `cash` and `qris`.

**WHEN** the payment method is `cash`
**THEN** the system SHALL require the cashier to enter an amount paid, validate that it is >= the cart total, and calculate change as `amountPaid - cartTotal`.

**WHEN** the payment method is `cash` and the amount paid is less than the cart total
**THEN** the system SHALL disable the confirm button.

**WHEN** the payment method is `qris`
**THEN** the system SHALL set `amountPaid` to the cart total and `changeAmount` to 0, with no amount input required.

**WHEN** payment is confirmed
**THEN** the system SHALL record `totalMinorUnits` (cart total), `paymentMethod`, `amountPaidMinorUnits`, and `changeAmountMinorUnits` on the order.

**WHEN** the payment dialog is open
**THEN** the system SHALL display a numpad for cash amount entry (digits 0-9, 000, and delete), the running total, and the calculated change.

### R6: Order Status

The system SHALL assign each order a status of either `completed` or `cancelled`.

**WHEN** an order is created via checkout
**THEN** the system SHALL set the status to `completed`.

**WHEN** a manager or owner cancels an order
**THEN** the system SHALL update the order status to `cancelled`, set `is_synced = false`, and enqueue a sync outbox entry (operation: `update`).

**WHEN** a cashier attempts to cancel an order
**THEN** the system SHALL NOT display the cancel action (hidden, not disabled).

### R7: Order History

The system SHALL display a chronological list of orders (newest first) with date range and status filtering.

**WHEN** the order history page loads
**THEN** the system SHALL default the date range to today's business date and show all statuses.

**WHEN** a date range filter is applied
**THEN** the system SHALL query orders whose `createdAt` falls within the UTC range derived from the business date range and outlet timezone.

**WHEN** a status filter is applied
**THEN** the system SHALL query only orders matching the selected status (`completed` or `cancelled`).

**WHEN** the order history is filtered by outlet
**THEN** the system SHALL only return orders for the currently selected outlet.

**WHEN** an order card is tapped
**THEN** the system SHALL expand the card to show line items (product name, quantity, subtotal), payment method, amount paid, change amount (for cash), and cashier name.

**WHEN** order items are loaded for an expanded card
**THEN** the system SHALL cache the items in memory to avoid re-fetching on subsequent expansions of the same order.

### R8: Product and Price Snapshots on Order Items

The system SHALL snapshot the product name and unit price at the time of order creation on each order item record.

**WHEN** an order item is created
**THEN** the system SHALL store the product's `name` as `productName` and `priceMinorUnits` as `unitPriceMinorUnits` at that moment.

**WHEN** a product's name or price is later modified in menu management
**THEN** existing order items SHALL retain the original name and price from when the order was placed.

**WHEN** an order item is created with an `originalPriceMinorUnits` from the product
**THEN** the system SHALL store it for potential future discount tracking.

### R9: Daily Summary Aggregation

The system SHALL compute and display a daily summary of completed orders for a given business date and outlet.

**WHEN** a daily summary is requested
**THEN** the system SHALL return `orderCount`, `totalRevenue`, `cashTotal`, and `qrisTotal` for all `completed` orders in the specified business date range.

**WHEN** no completed orders exist for the date
**THEN** the system SHALL return zero values for all summary fields.

**WHEN** the daily summary is displayed
**THEN** the system SHALL show four summary cards: order count, total revenue, cash total, and QRIS total.

### R10: Receipt Generation

The system SHALL generate receipt data containing business info, line items, order info, payment info, and totals.

**WHEN** an order is completed
**THEN** the system SHALL assemble a `ReceiptData` object with: business name and address (from outlet receipt header), itemized list with name/quantity/unitPrice/subtotal, order number, cashier name, creation timestamp, payment method, amount paid, change amount, and total.

**WHEN** a receipt printer is configured
**THEN** the system SHALL attempt to print the receipt asynchronously, logging errors without blocking the order flow.

**WHEN** the user taps "Cetak Ulang" (Reprint)
**THEN** the system SHALL re-send the last receipt data to the configured printer.

### R11: Offline-First Order Persistence

The system SHALL persist all orders and order items to the local SQLite database, ensuring no data loss when offline.

**WHEN** an order is created or cancelled
**THEN** the system SHALL write to the local database within a sync transaction.

**WHEN** the sync outbox contains unprocessed order changes
**THEN** the system SHALL mark them with `is_synced = false` for later synchronization.
