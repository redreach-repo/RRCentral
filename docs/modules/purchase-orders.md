Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: landed cost, per-warehouse stock splits, vendor master link depth

## What it does

Supplier purchase orders with lines. Staff receive qty via `rr_po_receive_line`, which bumps `products.stock_on_hand` when SKU matches and logs `inventory_movements` (`po_receive`). PO status rolls draft → ordered → partial → received. Optional `warehouse_id` stamps the PO (stock still rolls up on the product).

## Roles

- Staff: CRUD POs/lines + receive

## Tables / functions

- `purchase_orders`, `purchase_order_lines`
- `rr_po_receive_line(line_id, qty, user_email)`

## Alfred

Apply `20261230160000_purchase_orders.sql` and `20261304120000_warehouses_stub.sql`.
