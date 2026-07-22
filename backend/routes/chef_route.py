import json

from flask import Blueprint, jsonify, request

from models import db, OrderBatch, OrderItem, Order, DishIngredient
from services.activity_store import log_event, summarize_dishes
from services.order_note_store import get_order_note

chef_bp = Blueprint("chef", __name__)


def _status_rank(s: str) -> int:
    # For sorting / filtering. Lower means earlier in kitchen workflow.
    if s == "accepted":
        return 1
    if s == "ready":
        return 2
    if s == "delivered":
        return 3
    return 99


def _item_to_row(item: OrderItem):
    batch = item.batch
    order = batch.order if batch else None
    table = order.table if order else None
    dish = item.dish

    note = ""
    try:
        if batch and batch.id:
            note = get_order_note(batch.id)
    except Exception:
        note = ""

    return {
        "item_id": item.id,
        "batch_id": batch.id if batch else None,
        "batch_status": batch.status if batch else None,
        "table_number": table.table_number if table else None,
        "qty": item.quantity,
        "is_custom": bool(item.is_custom),
        "dish_id": item.dish_id,
        "name": dish.name if dish else (item.custom_name or "Custom Dish"),
        "kitchen_status": item.kitchen_status or "queued",
        "note": note,
    }


@chef_bp.route("/queue", methods=["GET"])
def chef_queue():
    """
    Returns flattened queue rows (one per OrderItem) for accepted batches.
    """
    # In a real app we'd authenticate staff. For now, public inside local network.

    # Only show batches that were approved by manager (accepted) and not delivered.
    batches = (
        OrderBatch.query.filter(OrderBatch.status.in_(["accepted", "ready"]))
        .order_by(OrderBatch.created_at.asc())
        .all()
    )

    rows = []
    for b in batches:
        for it in (b.items or []):
            if (it.kitchen_status or "queued") != "queued":
                continue
            rows.append(_item_to_row(it))

    # Sort: accepted first, then by batch time, then table.
    rows.sort(
        key=lambda r: (
            _status_rank(str(r.get("batch_status") or "")),
            r.get("batch_id") or 0,
            r.get("table_number") or 0,
            r.get("item_id") or 0,
        )
    )

    return jsonify({"queue": rows, "count": len(rows)})


@chef_bp.route("/items/<int:item_id>/done", methods=["POST"])
def chef_item_done(item_id: int):
    item = OrderItem.query.get(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    batch = item.batch
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    # Mark item done for kitchen.
    item.kitchen_status = "done"

    # If all items in this batch are done (or already delivered), mark batch as ready.
    try:
        all_done = True
        for it in (batch.items or []):
            if (it.kitchen_status or "queued") not in ("done", "delivered"):
                all_done = False
                break
        if all_done and batch.status == "accepted":
            batch.status = "ready"

        db.session.commit()
        try:
            order = batch.order if batch else None
            table = order.table if order else None
            tno = table.table_number if table else None
            name = item.dish.name if item.dish else (item.custom_name or "Custom Dish")
            log_event(
                "chef_done",
                f"Chef finished: {name} x{int(item.quantity or 1)} · Table {tno} (Batch #{batch.id})",
                table_number=tno,
                order_id=order.id if order else None,
                batch_id=batch.id if batch else None,
                item_id=item.id,
                meta={"dish_summary": f"{name} x{int(item.quantity or 1)}"},
            )
            if all_done and batch.status == "ready":
                log_event(
                    "order_ready",
                    f"Order ready for serving · Table {tno} (Batch #{batch.id})",
                    table_number=tno,
                    order_id=order.id if order else None,
                    batch_id=batch.id,
                    meta={"dish_summary": summarize_dishes(batch.items, max_items=2)},
                )
        except Exception:
            pass
        return jsonify({"success": True, "batch_status": batch.status})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@chef_bp.route("/items/<int:item_id>/recipe", methods=["GET"])
def chef_item_recipe(item_id: int):
    item = OrderItem.query.get(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    dish = item.dish

    # Custom: attempt to parse stored recipe json if present.
    if item.is_custom:
        recipe = None
        if item.custom_recipe_json:
            try:
                recipe = json.loads(item.custom_recipe_json)
            except Exception:
                recipe = None

        return jsonify(
            {
                "item_id": item.id,
                "is_custom": True,
                "name": item.custom_name or (dish.name if dish else "Custom Dish"),
                "recipe": recipe,
            }
        )

    # Standard dish: show ingredient list from DishIngredient mapping.
    ingredients = []
    if dish:
        rows = DishIngredient.query.filter_by(dish_id=dish.id).all()
        for di in rows:
            ing = di.ingredient
            if not ing:
                continue
            ingredients.append(
                {
                    "name": ing.name,
                    "amount": f"{di.quantity_required} {ing.unit}",
                }
            )

    return jsonify(
        {
            "item_id": item.id,
            "is_custom": False,
            "name": dish.name if dish else (item.custom_name or "Dish"),
            "ingredients": ingredients,
            "steps": [],
        }
    )
