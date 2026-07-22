from models import db, OrderBatch, OrderItem, DishIngredient, CustomDishIngredient, Ingredient
from services.activity_store import log_event, summarize_dishes

def approve_order_batch(batch_id):
    """Approve batch: deduct inventory, change status to accepted"""
    batch = OrderBatch.query.get(batch_id)
    if not batch or batch.status != 'sent':
        return False, "Invalid batch"
    
    try:
        for item in batch.items:
            if item.is_custom:
                # Custom dish ingredients
                for cdi in (item.custom_dish_ingredients or []):
                    ingredient = cdi.ingredient
                    req_qty = float(cdi.quantity_required or 0) * float(item.quantity or 1)
                    if ingredient.current_quantity < req_qty:
                        return False, f"Low stock: {ingredient.name}"
                    ingredient.current_quantity -= req_qty
            else:
                # Standard dish
                dish = item.dish
                for di in dish.ingredients:
                    ingredient = di.ingredient
                    req_qty = di.quantity_required * item.quantity
                    if ingredient.current_quantity < req_qty:
                        return False, f"Low stock: {ingredient.name}"
                    ingredient.current_quantity -= req_qty
        
        batch.status = 'accepted'
        db.session.commit()
        try:
            order = batch.order
            table = order.table if order else None
            tno = table.table_number if table else None
            total = sum((float(it.unit_price or 0) * float(it.quantity or 0)) for it in (batch.items or []))
            items_qty = sum(int(it.quantity or 0) for it in (batch.items or []))
            items_count = len(list(batch.items or []))
            log_event(
                "order_accepted",
                f"Manager accepted Batch #{batch.id} for Table {tno} · ₹{round(total, 0):.0f}",
                table_number=tno,
                order_id=order.id if order else None,
                batch_id=batch.id,
                meta={
                    "items_qty": items_qty,
                    "items_count": items_count,
                    "amount": float(total or 0),
                    "dish_summary": summarize_dishes(batch.items, max_items=2),
                },
            )
        except Exception:
            pass
        return True, "Approved and inventory updated"
    except Exception as e:
        db.session.rollback()
        return False, str(e)

def reject_order_batch(batch_id):
    """Reject: delete batch"""
    batch = OrderBatch.query.get(batch_id)
    if batch and batch.status == 'sent':
        try:
            order = batch.order
            batch_total = sum((it.unit_price or 0) * (it.quantity or 0) for it in (batch.items or []))
            db.session.delete(batch)
            if order:
                # Keep bill accurate: subtract rejected batch amount.
                order.total_amount = float(order.total_amount or 0) - float(batch_total or 0)
                if order.total_amount < 0:
                    order.total_amount = 0
            db.session.commit()
            try:
                table = order.table if order else None
                tno = table.table_number if table else None
                items_qty = sum(int(it.quantity or 0) for it in (batch.items or []))
                items_count = len(list(batch.items or []))
                log_event(
                    "order_rejected",
                    f"Manager rejected Batch #{batch_id} for Table {tno}",
                    table_number=tno,
                    order_id=order.id if order else None,
                    batch_id=batch_id,
                    meta={
                        "items_qty": items_qty,
                        "items_count": items_count,
                        "amount": float(batch_total or 0),
                        "dish_summary": summarize_dishes(batch.items, max_items=2),
                    },
                )
            except Exception:
                pass
            return True
        except Exception:
            db.session.rollback()
            return False
    return False
