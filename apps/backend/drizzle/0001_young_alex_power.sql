CREATE INDEX "idx_allocations_order_item" ON "order_item_allocations" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_allocations_lot" ON "order_item_allocations" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product" ON "order_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "lots_initial_qty_positive" CHECK ("inventory_lots"."initial_qty" > 0);--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "lots_available_qty_range" CHECK ("inventory_lots"."available_qty" >= 0 AND "inventory_lots"."available_qty" <= "inventory_lots"."initial_qty");--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "lots_purchase_price_non_negative" CHECK ("inventory_lots"."purchase_price" >= 0);--> statement-breakpoint
ALTER TABLE "order_item_allocations" ADD CONSTRAINT "allocations_qty_positive" CHECK ("order_item_allocations"."allocated_qty" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_requested_qty_positive" CHECK ("order_items"."requested_qty" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_buffer_non_negative" CHECK ("products"."min_buffer_stock" >= 0);