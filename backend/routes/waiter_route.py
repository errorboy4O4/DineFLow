from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from models import db, Manager, RestaurantTable, Order, OrderBatch, OrderItem
from services.close_request_store import has_close_request, clear_close_request
from services.activity_store import log_event, summarize_dishes
from services.time_service import now_local_naive
from services.order_note_store import clear_order_note

waiter_bp = Blueprint("waiter", __name__)


def _table_state(table: RestaurantTable):
    """
    Compute waiter UI state from DB.
    States: free | occupied | ready | waiting
    """
    order = (
        Order.query.filter_by(table_id=table.id, status="open")
        .order_by(Order.created_at.desc())
        .first()
    )
    if not order:
        return {
            "table_number": table.table_number,
            "status": "free",
            "guests": 0,
            "since": None,
            "spend": 0,
        }

    batches = (
        OrderBatch.query.filter_by(order_id=order.id)
        .order_by(OrderBatch.created_at.asc())
        .all()
    )
    has_ready = any(b.status == "ready" for b in batches)
    has_waiting = any(b.status in ("sent", "accepted") for b in batches)

    status = "occupied"
    # Payment/close request should be visible to waiter (logic-only store).
    if has_close_request(table.table_number):
        status = "waiting"
    if has_ready:
        status = "ready"
    elif has_waiting:
        status = "waiting"

    since = order.created_at.isoformat() if order.created_at else None
    return {
        "table_number": table.table_number,
        "status": status,
        "guests": 0,
        "since": since,
        "spend": float(order.total_amount or 0),
        "order_id": order.id,
        "close_requested": has_close_request(table.table_number),
    }


@waiter_bp.route("/tables/status", methods=["GET"])
def waiter_tables_status():
    tables = (
        RestaurantTable.query.filter_by(is_active=True)
        .order_by(RestaurantTable.table_number.asc())
        .all()
    )
    payload = [_table_state(t) for t in tables]
    return jsonify({"tables": payload})


@waiter_bp.route("/orders/ready-items", methods=["GET"])
def waiter_ready_items():
    """
    Items ready to deliver: batch.status=ready and item.kitchen_status=done
    """
    batches = (
        OrderBatch.query.filter_by(status="ready")
        .order_by(OrderBatch.created_at.asc())
        .all()
    )

    rows = []
    for b in batches:
        order = b.order
        table = order.table if order else None
        for it in (b.items or []):
            if (it.kitchen_status or "queued") != "done":
                continue
            rows.append(
                {
                    "item_id": it.id,
                    "batch_id": b.id,
                    "table_number": table.table_number if table else None,
                    "dish": it.dish.name if it.dish else (it.custom_name or "Custom Dish"),
                    "qty": it.quantity,
                    "note": "",
                }
            )

    return jsonify({"ready_items": rows, "count": len(rows)})


@waiter_bp.route("/orders/served-today", methods=["GET"])
def waiter_served_today():
    """
    Served today: show delivered items with a delivery time.
    """
    now = now_local_naive()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    try:
        limit = int(request.args.get("limit", 40))
    except Exception:
        limit = 40
    limit = max(1, min(200, limit))

    base_q = (
        OrderItem.query.join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
        .join(Order, OrderBatch.order_id == Order.id)
        .filter(OrderItem.kitchen_status == "delivered")
        .filter(OrderItem.delivered_at.isnot(None))
        .filter(OrderItem.delivered_at >= start)
        .filter(OrderItem.delivered_at < end)
    )

    item_count = int(base_q.count() or 0)
    try:
        items_qty = int(
            base_q.with_entities(db.func.coalesce(db.func.sum(OrderItem.quantity), 0)).scalar() or 0
        )
    except Exception:
        items_qty = 0
    try:
        batch_count = int(
            base_q.with_entities(db.func.count(db.func.distinct(OrderBatch.id))).scalar() or 0
        )
    except Exception:
        batch_count = 0
    try:
        order_count = int(
            base_q.with_entities(db.func.count(db.func.distinct(Order.id))).scalar() or 0
        )
    except Exception:
        order_count = 0

    items = (
        base_q.order_by(OrderItem.delivered_at.desc().nullslast(), OrderItem.id.desc())
        .limit(limit)
        .all()
    )

    rows = []
    for it in items:
        batch = it.batch
        order = batch.order if batch else None
        table = order.table if order else None
        rows.append(
            {
                "item_id": it.id,
                "batch_id": batch.id if batch else None,
                "table_number": table.table_number if table else None,
                "dish": it.dish.name if it.dish else (it.custom_name or "Custom Dish"),
                "qty": it.quantity,
                "time": it.delivered_at.isoformat(),
            }
        )

    # Backward compatible: keep "count" as item count.
    return jsonify(
        {
            "served": rows,
            "count": item_count,
            "item_count": item_count,
            "items_qty": items_qty,
            "batch_count": batch_count,
            "order_count": order_count,
        }
    )


@waiter_bp.route("/bill/<int:table_number>", methods=["GET"])
def waiter_bill(table_number: int):
    table = RestaurantTable.query.filter_by(table_number=table_number, is_active=True).first()
    if not table:
        return jsonify({"error": "Table not found"}), 404

    order = (
        Order.query.filter_by(table_id=table.id, status="open")
        .order_by(Order.created_at.desc())
        .first()
    )
    if not order:
        return jsonify(
            {
                "restaurant": {
                    "restaurant_name": (getattr(Manager.query.first(), "restaurant_name", None) or "DineFlow Kitchen"),
                    "address": (getattr(Manager.query.first(), "address", None) or ""),
                    "gstin": (getattr(Manager.query.first(), "gstin", None) or ""),
                    "phone_number": (getattr(Manager.query.first(), "phone_number", None) or ""),
                    "gst_rate": float(getattr(Manager.query.first(), "gst_rate", None) or 5),
                    "bill_terms": (getattr(Manager.query.first(), "bill_terms", None) or ""),
                    "qr_image_path": (getattr(Manager.query.first(), "qr_image_path", None) or ""),
                    "show_restaurant_name": bool(getattr(Manager.query.first(), "bill_show_restaurant_name", True)),
                    "show_address": bool(getattr(Manager.query.first(), "bill_show_address", True)),
                    "show_gstin": bool(getattr(Manager.query.first(), "bill_show_gstin", True)),
                    "show_phone": bool(getattr(Manager.query.first(), "bill_show_phone", True)),
                },
                "table_number": table_number,
                "order": None,
                "items": [],
                "subtotal": 0,
                "gst": 0,
                "service_charge": 0,
                "total": 0,
            }
        )

    # Aggregate items by dish name + price
    items = {}
    for b in (order.batches or []):
        for it in (b.items or []):
            name = it.dish.name if it.dish else (it.custom_name or "Custom Dish")
            key = f"{name}::{float(it.unit_price or 0)}"
            if key not in items:
                items[key] = {"name": name, "qty": 0, "unit_price": float(it.unit_price or 0)}
            items[key]["qty"] += int(it.quantity or 0)

    line_items = []
    for v in items.values():
        line_items.append(
            {
                "name": v["name"],
                "qty": v["qty"],
                "amount": round(v["qty"] * v["unit_price"], 2),
            }
        )
    line_items.sort(key=lambda x: x["name"])

    subtotal = float(order.total_amount or 0)
    rate = float(getattr(Manager.query.first(), "gst_rate", None) or 5)
    gst = round(subtotal * (rate / 100.0), 2)
    service = 0.0
    total = round(subtotal + gst + service, 2)

    return jsonify(
        {
            "restaurant": {
                "restaurant_name": (getattr(Manager.query.first(), "restaurant_name", None) or "DineFlow Kitchen"),
                "address": (getattr(Manager.query.first(), "address", None) or ""),
                "gstin": (getattr(Manager.query.first(), "gstin", None) or ""),
                "phone_number": (getattr(Manager.query.first(), "phone_number", None) or ""),
                    "gst_rate": float(getattr(Manager.query.first(), "gst_rate", None) or 5),
                    "bill_terms": (getattr(Manager.query.first(), "bill_terms", None) or ""),
                    "qr_image_path": (getattr(Manager.query.first(), "qr_image_path", None) or ""),
                    "show_restaurant_name": bool(getattr(Manager.query.first(), "bill_show_restaurant_name", True)),
                    "show_address": bool(getattr(Manager.query.first(), "bill_show_address", True)),
                    "show_gstin": bool(getattr(Manager.query.first(), "bill_show_gstin", True)),
                    "show_phone": bool(getattr(Manager.query.first(), "bill_show_phone", True)),
            },
            "table_number": table_number,
            "order": {
                "id": order.id,
                "status": order.status,
                "created_at": order.created_at.isoformat() if order.created_at else None,
            },
            "items": line_items,
            "subtotal": subtotal,
            "gst": gst,
            "service_charge": service,
            "total": total,
        }
    )


@waiter_bp.route("/items/<int:item_id>/deliver", methods=["POST"])
def waiter_deliver_item(item_id: int):
    it = OrderItem.query.get(item_id)
    if not it:
        return jsonify({"error": "Item not found"}), 404

    batch = it.batch
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    # Mark as delivered (service).
    it.kitchen_status = "delivered"
    if not it.delivered_at:
        it.delivered_at = now_local_naive()

    try:
        # If all items in batch are delivered, mark batch delivered.
        all_delivered = True
        for x in (batch.items or []):
            if (x.kitchen_status or "queued") != "delivered":
                all_delivered = False
                break
        if all_delivered and batch.status == "ready":
            batch.status = "delivered"

        db.session.commit()
        try:
            if all_delivered and batch.status == "delivered":
                clear_order_note(batch.id)
        except Exception:
            pass
        try:
            order = batch.order if batch else None
            table = order.table if order else None
            tno = table.table_number if table else None
            name = it.dish.name if it.dish else (it.custom_name or "Custom Dish")
            log_event(
                "waiter_delivered",
                f"Waiter delivered: {name} x{int(it.quantity or 1)} · Table {tno} (Batch #{batch.id})",
                table_number=tno,
                order_id=order.id if order else None,
                batch_id=batch.id if batch else None,
                item_id=it.id,
                meta={"dish_summary": f"{name} x{int(it.quantity or 1)}"},
            )
            if all_delivered and batch.status == "delivered":
                log_event(
                    "batch_delivered",
                    f"All items delivered · Table {tno} (Batch #{batch.id})",
                    table_number=tno,
                    order_id=order.id if order else None,
                    batch_id=batch.id,
                )
        except Exception:
            pass
        return jsonify({"success": True, "batch_status": batch.status})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@waiter_bp.route("/tables/<int:table_number>/close", methods=["POST"])
def waiter_close_table(table_number: int):
    data = request.get_json(silent=True) or {}
    payment_method = data.get("payment_method")
    if payment_method is None:
        payment_method = data.get("method")
    if (payment_method is None) or (isinstance(payment_method, str) and payment_method.strip() == ""):
        try:
            payment_method = request.args.get("payment_method")
        except Exception:
            payment_method = payment_method
    if (payment_method is None) or (isinstance(payment_method, str) and payment_method.strip() == ""):
        try:
            payment_method = request.headers.get("X-Payment-Method")
        except Exception:
            payment_method = payment_method
    if not isinstance(payment_method, str):
        payment_method = ""
    payment_method = payment_method.strip() or "Cash"

    table = RestaurantTable.query.filter_by(table_number=table_number, is_active=True).first()
    if not table:
        return jsonify({"error": "Table not found"}), 404

    order = (
        Order.query.filter_by(table_id=table.id, status="open")
        .order_by(Order.created_at.desc())
        .first()
    )
    if not order:
        return jsonify({"success": True})

    # Safety: don't allow closing until every item is delivered.
    pending = (
        OrderItem.query.join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
        .filter(OrderBatch.order_id == order.id)
        .filter((OrderItem.kitchen_status.is_(None)) | (OrderItem.kitchen_status != "delivered"))
        .count()
    )
    if pending > 0:
        return jsonify({"error": "Cannot close table: some items are not delivered yet"}), 400

    try:
        # Clear close request as table is being closed.
        clear_close_request(table_number)
        order.status = "closed"
        order.closed_at = now_local_naive()
        db.session.commit()
        try:
            subtotal = float(order.total_amount or 0)
            rate = float(getattr(Manager.query.first(), "gst_rate", None) or 5)
            gst = round(subtotal * (rate / 100.0), 2)
            service = 0.0
            amount = round(subtotal + gst + service, 2)
            log_event(
                "payment_received",
                f"Payment received · Order closed · Table {table_number} (Order #{order.id})",
                table_number=table_number,
                order_id=order.id,
                meta={"amount": float(amount or 0), "payment_method": payment_method},
            )
        except Exception:
            pass
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
