from flask import Blueprint, request, jsonify
from sqlalchemy import func
from models import db, Manager, OrderBatch, Order, OrderItem, Dish, Ingredient, RestaurantTable, DishIngredient
from services.order_service import approve_order_batch, reject_order_batch
from services.inventory_service import get_available_dishes
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
import jwt
from datetime import datetime, timedelta
from config import Config
import os
import uuid
from services.close_request_store import clear_close_request
from services.activity_store import list_events, log_event, summarize_dishes
from services.time_service import now_local_naive
from services.order_note_store import get_order_note, clear_order_note
import json
import socket
import ipaddress
import subprocess
import re

manager_bp = Blueprint('manager', __name__)

# Simple token storage (in production use Redis)
active_sessions = {}


def _restaurant_meta(manager: 'Manager' = None):
    m = manager or Manager.query.first()
    return {
        'restaurant_name': (getattr(m, 'restaurant_name', None) or 'DineFlow Kitchen') if m else 'DineFlow Kitchen',
        'address': (getattr(m, 'address', None) or '') if m else '',
        'gstin': (getattr(m, 'gstin', None) or '') if m else '',
        'phone_number': (getattr(m, 'phone_number', None) or '') if m else '',
        'email': (getattr(m, 'email', None) or '') if m else '',
        'gst_rate': float(getattr(m, 'gst_rate', None) or 5) if m else 5,
        'bill_terms': (getattr(m, 'bill_terms', None) or '') if m else '',
        'qr_image_path': (getattr(m, 'qr_image_path', None) or '') if m else '',
        'show_restaurant_name': bool(getattr(m, 'bill_show_restaurant_name', True)) if m else True,
        'show_address': bool(getattr(m, 'bill_show_address', True)) if m else True,
        'show_gstin': bool(getattr(m, 'bill_show_gstin', True)) if m else True,
        'show_phone': bool(getattr(m, 'bill_show_phone', True)) if m else True,
        'custom_dish_profit_margin': float(getattr(m, 'custom_dish_profit_margin', None) or 30) if m else 30,
    }


def _uploads_dir():
    # Save into frontend/assets/images so Flask can serve it as a static asset.
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", "frontend", "assets", "images"))


def _allowed_image_filename(filename: str) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext in (".png", ".jpg", ".jpeg", ".gif", ".webp")


def _public_origin_candidates() -> list[str]:
    """
    Return best-effort IPv4 addresses for building QR links on a LAN/hotspot.
    Filters loopback/link-local and prefers typical hotspot/LAN ranges.
    """
    candidates: list[str] = []

    # Windows: parse ipconfig to get all IPv4 addresses (includes hotspot adapters like 192.168.137.1)
    try:
        out = subprocess.check_output(["ipconfig"], stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="ignore")
        for m in re.finditer(r"IPv4 Address[^:]*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", out, flags=re.IGNORECASE):
            candidates.append(m.group(1))
    except Exception:
        pass

    # Linux: parse `ip -4 addr` (best effort)
    try:
        out = subprocess.check_output(["ip", "-4", "addr"], stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="ignore")
        for m in re.finditer(r"inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/", out):
            candidates.append(m.group(1))
    except Exception:
        pass

    # From hostname resolution
    try:
        _name, _aliases, ips = socket.gethostbyname_ex(socket.gethostname())
        for ip in ips or []:
            candidates.append(ip)
    except Exception:
        pass

    # From default route (often yields active interface IP)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            candidates.append(s.getsockname()[0])
        finally:
            s.close()
    except Exception:
        pass

    # Normalize + filter
    out: list[str] = []
    seen = set()
    for ip in candidates:
        ip = (ip or "").strip()
        if not ip or ip in seen:
            continue
        seen.add(ip)
        try:
            addr = ipaddress.ip_address(ip)
        except Exception:
            continue
        if addr.version != 4:
            continue
        if addr.is_loopback or addr.is_unspecified or addr.is_link_local:
            continue
        out.append(ip)

    def _score(ip: str) -> int:
        # Prefer Windows hotspot default IP first.
        if ip == "192.168.137.1":
            return 0
        # Prefer typical private LANs
        if ip.startswith("192.168."):
            return 10
        if ip.startswith("10."):
            return 20
        if ip.startswith("172."):
            return 30
        return 50

    out.sort(key=lambda x: (_score(x), x))
    return out


@manager_bp.route("/public-origin", methods=["GET"])
def manager_public_origin():
    """
    Returns a best-effort origin URL to embed into QR codes so other devices
    on the same Wi-Fi/hotspot can open the dashboards.

    Env override: DINEFLOW_PUBLIC_ORIGIN / PUBLIC_ORIGIN / APP_PUBLIC_ORIGIN
    """
    token = request.headers.get("Authorization")
    if not token or token not in active_sessions:
        return jsonify({"error": "Unauthorized"}), 401

    # If the manager dashboard itself was opened via a LAN IP, we still compute
    # candidates because a laptop can have multiple networks (Wi-Fi + hotspot).
    try:
        req_origin = (request.host_url or "").rstrip("/")
    except Exception:
        req_origin = ""

    # Explicit override (recommended for stable deployments)
    override = (
        (os.environ.get("DINEFLOW_PUBLIC_ORIGIN") or "").strip()
        or (os.environ.get("PUBLIC_ORIGIN") or "").strip()
        or (os.environ.get("APP_PUBLIC_ORIGIN") or "").strip()
    )
    if override:
        return jsonify({"origin": override.rstrip("/"), "request_origin": req_origin, "candidates": []})

    port = ""
    try:
        if ":" in (request.host or ""):
            port = (request.host or "").split(":", 1)[1].strip()
    except Exception:
        port = ""

    scheme = "http"
    try:
        scheme = (request.scheme or "http").strip() or "http"
    except Exception:
        scheme = "http"

    ips = _public_origin_candidates()
    best_ip = ips[0] if ips else ""
    best_origin = f"{scheme}://{best_ip}{(':' + port) if port else ''}" if best_ip else ""

    # Prefer best_origin (hotspot/LAN) when available; fall back to request origin.
    origin = best_origin or req_origin or ""

    return jsonify({"origin": origin, "best_origin": best_origin, "request_origin": req_origin, "candidates": ips})


@manager_bp.route('/uploads/image', methods=['POST'])
def upload_image():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'No file selected'}), 400

    if not _allowed_image_filename(f.filename):
        return jsonify({'error': 'Only png, jpg, jpeg, gif, webp images are allowed'}), 400

    # Basic size guard (10 MB) if content-length is present
    try:
        if request.content_length and request.content_length > 10 * 1024 * 1024:
            return jsonify({'error': 'File too large (max 10MB)'}), 413
    except Exception:
        pass

    upload_dir = _uploads_dir()
    os.makedirs(upload_dir, exist_ok=True)

    original = secure_filename(f.filename)
    ext = os.path.splitext(original)[1].lower()
    unique = f"dish_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:10]}{ext}"
    save_path = os.path.join(upload_dir, unique)

    try:
        f.save(save_path)
        # Path stored in DB should be relative to /frontend root.
        return jsonify({'success': True, 'path': f"assets/images/{unique}"}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════
# TABLES (QR codes / customer access)
# ════════════════════════════════════════════════════════════════════════

@manager_bp.route('/tables', methods=['GET'])
def list_tables():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    tables = RestaurantTable.query.filter_by(is_active=True).order_by(RestaurantTable.table_number.asc()).all()
    return jsonify({
        'tables': [
            {
                'id': t.id,
                'table_number': t.table_number,
                'table_token': t.table_token,
                'is_active': t.is_active,
                'created_at': t.created_at.isoformat()
            } for t in tables
        ]
    })


@manager_bp.route('/tables/ensure', methods=['POST'])
def ensure_tables():
    """
    Ensure tables 1..count exist (create any missing ones) and return the list.
    Body: { "count": 12 }
    """
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}
    try:
        count = int(data.get('count', 0))
    except Exception:
        count = 0

    if count <= 0 or count > 50:
        return jsonify({'error': 'Count must be between 1 and 50'}), 400

    try:
        existing = RestaurantTable.query.filter(RestaurantTable.table_number >= 1, RestaurantTable.table_number <= count).all()
        existing_by_num = {t.table_number: t for t in existing}

        for n in range(1, count + 1):
            if n in existing_by_num:
                # Reactivate if previously deleted/disabled
                existing_by_num[n].is_active = True
                continue
            t = RestaurantTable(table_number=n, is_active=True)
            db.session.add(t)

        db.session.commit()

        tables = RestaurantTable.query.filter(RestaurantTable.table_number >= 1, RestaurantTable.table_number <= count).order_by(RestaurantTable.table_number.asc()).all()
        return jsonify({
            'success': True,
            'count': count,
            'tables': [
                {
                    'id': t.id,
                    'table_number': t.table_number,
                    'table_token': t.table_token
                } for t in tables
            ]
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/tables/clear', methods=['POST'])
def clear_tables():
    """
    Deactivate all tables (removes "current generated QRs" without breaking FK history).
    """
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        RestaurantTable.query.update({RestaurantTable.is_active: False})
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@manager_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    
    
    manager = Manager.query.filter_by(email=email).first()
    if manager and password and check_password_hash(manager.password_hash, password):
        token = jwt.encode({
            'manager_id': manager.id,
            'exp': datetime.utcnow() + timedelta(hours=24)
        }, Config.SECRET_KEY, algorithm='HS256')
        
        active_sessions[token] = manager.id
        return jsonify({
            'success': True,
            'token': token,
            'manager': {'id': manager.id, 'name': manager.name}
        })
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401


@manager_bp.route('/settings', methods=['GET', 'PUT'])
def manager_settings():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    manager_id = active_sessions.get(token)
    manager = Manager.query.get(manager_id) if manager_id else Manager.query.first()
    if not manager:
        return jsonify({'error': 'Manager not found'}), 404

    if request.method == 'GET':
        return jsonify({'settings': {
            'restaurant_name': getattr(manager, 'restaurant_name', None) or 'DineFlow Kitchen',
            'address': getattr(manager, 'address', None) or '',
            'gstin': getattr(manager, 'gstin', None) or '',
            'phone_number': getattr(manager, 'phone_number', None) or '',
            'gst_rate': float(getattr(manager, 'gst_rate', None) or 5),
            'bill_terms': getattr(manager, 'bill_terms', None) or '',
            'qr_image_path': getattr(manager, 'qr_image_path', None) or '',
            'show_restaurant_name': bool(getattr(manager, 'bill_show_restaurant_name', True)),
            'show_address': bool(getattr(manager, 'bill_show_address', True)),
            'show_gstin': bool(getattr(manager, 'bill_show_gstin', True)),
            'show_phone': bool(getattr(manager, 'bill_show_phone', True)),
            'custom_dish_profit_margin': float(getattr(manager, 'custom_dish_profit_margin', None) or 30),
            'email': manager.email,
        }})

    data = request.get_json() or {}
    manager.restaurant_name = (data.get('restaurant_name') or '').strip() or None
    manager.address = (data.get('address') or '').strip() or None
    manager.gstin = (data.get('gstin') or '').strip() or None
    manager.phone_number = (data.get('phone_number') or '').strip() or None
    try:
        gr = data.get('gst_rate', None)
        manager.gst_rate = float(gr) if (gr is not None and str(gr).strip() != '') else None
    except Exception:
        manager.gst_rate = manager.gst_rate

    manager.bill_terms = (data.get('bill_terms') or '').strip() or None
    manager.qr_image_path = (data.get('qr_image_path') or '').strip() or None

    try:
        if 'custom_dish_profit_margin' in data:
            pm = data.get('custom_dish_profit_margin', None)
            manager.custom_dish_profit_margin = float(pm) if (pm is not None and str(pm).strip() != '') else manager.custom_dish_profit_margin
            if manager.custom_dish_profit_margin is not None and manager.custom_dish_profit_margin < 0:
                manager.custom_dish_profit_margin = 0.0
            if manager.custom_dish_profit_margin is not None and manager.custom_dish_profit_margin > 500:
                manager.custom_dish_profit_margin = 500.0
    except Exception:
        manager.custom_dish_profit_margin = manager.custom_dish_profit_margin

    if 'show_restaurant_name' in data: manager.bill_show_restaurant_name = bool(data.get('show_restaurant_name'))
    if 'show_address' in data: manager.bill_show_address = bool(data.get('show_address'))
    if 'show_gstin' in data: manager.bill_show_gstin = bool(data.get('show_gstin'))
    if 'show_phone' in data: manager.bill_show_phone = bool(data.get('show_phone'))

    try:
        db.session.commit()
        return jsonify({'success': True, 'settings': _restaurant_meta(manager)})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@manager_bp.route('/dashboard/orders', methods=['GET'])
def dashboard_orders():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Pending batches (status='sent')
    pending_batches = OrderBatch.query.filter_by(status='sent').all()
    
    orders = []
    for batch in pending_batches:
        order = batch.order
        table = order.table if order else None

        items = []
        total = 0.0
        for it in (batch.items or []):
            dish = it.dish
            name = dish.name if dish else (it.custom_name or "Custom Dish")
            qty = int(it.quantity or 0)
            unit_price = float(it.unit_price or 0)
            unit_cost = 0.0
            category = None

            if dish is not None:
                try:
                    unit_cost = float(dish.base_price or 0)
                except Exception:
                    unit_cost = 0.0
                category = getattr(dish, "category", None)
            else:
                # Custom dish: base_cost is embedded in custom_recipe_json
                try:
                    obj = json.loads(it.custom_recipe_json or "{}")
                    unit_cost = float(obj.get("base_cost") or 0)
                    category = obj.get("category") or None
                except Exception:
                    unit_cost = 0.0
                    category = None

            # "Margin" in the manager UI is treated as markup percent (same as Pricing slider):
            # (selling_price - cost) / cost * 100
            margin_pct = 0.0
            try:
                if unit_cost > 0:
                    margin_pct = ((unit_price - unit_cost) / unit_cost) * 100.0
            except Exception:
                margin_pct = 0.0

            line_total = unit_price * float(qty or 0)
            total += line_total
            items.append(
                {
                    "dish_id": dish.id if dish else None,
                    "dish": name,
                    "qty": qty,
                    "unit_cost": unit_cost,
                    "unit_price": unit_price,
                    "margin_percent": round(margin_pct, 1),
                    "category": category,
                    "line_total": round(line_total, 2),
                    "is_custom": bool(getattr(it, "is_custom", False)),
                }
            )

        orders.append(
            {
                "batch_id": batch.id,
                "order_id": order.id if order else None,
                "table_number": table.table_number if table else None,
                "note": get_order_note(batch.id),
                "items": items,
                "total": round(total, 2),
                "created_at": batch.created_at.isoformat() if batch.created_at else None,
            }
        )
    
    return jsonify({'pending_orders': orders})


@manager_bp.route('/orders/live', methods=['GET'])
def list_live_orders():
    """
    Manager: show all non-pending batches that are still in progress for open orders.
    This is for tracking (accepted/ready/delivered) after manager approval.
    """
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    q = (request.args.get('q') or '').strip().lower()
    try:
        limit = int(request.args.get('limit', 200))
    except Exception:
        limit = 200
    limit = max(1, min(400, limit))

    batches = (
        OrderBatch.query.join(Order, OrderBatch.order_id == Order.id)
        .filter(Order.status == "open")
        .filter(OrderBatch.status.in_(["accepted", "ready", "delivered"]))
        .order_by(OrderBatch.created_at.desc().nullslast(), OrderBatch.id.desc())
        .limit(limit)
        .all()
    )

    rows = []
    for b in (batches or []):
        o = b.order
        t = o.table if o else None
        table_no = t.table_number if t else None

        # Last event time: for delivered items, use the latest delivered_at
        last_event = None
        try:
            for it in (b.items or []):
                if getattr(it, "delivered_at", None):
                    if not last_event or it.delivered_at > last_event:
                        last_event = it.delivered_at
        except Exception:
            last_event = None

        if not last_event:
            last_event = b.created_at

        if q:
            hay = f"{o.id if o else ''} {b.id} {table_no or ''} {b.status}".lower()
            if q not in hay:
                continue

        items = []
        total = 0.0
        for it in (b.items or []):
            name = it.dish.name if it.dish else (it.custom_name or "Custom Dish")
            qty = int(it.quantity or 0)
            price = float(it.unit_price or 0)
            items.append({"dish": name, "qty": qty, "price": price})
            total += price * qty

        rows.append(
            {
                "batch_id": b.id,
                "order_id": o.id if o else None,
                "table_number": table_no,
                "status": b.status,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "last_event_at": last_event.isoformat() if last_event else None,
                "items": items,
                "total": round(total, 2),
            }
        )

    return jsonify({"live_batches": rows})

@manager_bp.route('/orders/<int:batch_id>/<action>', methods=['PATCH'])
def manage_order(batch_id, action):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if action == 'approve':
        success, message = approve_order_batch(batch_id)
        if success:
            return jsonify({'success': True, 'message': message})
        return jsonify({'error': message}), 400
    elif action == 'reject':
        success = reject_order_batch(batch_id)
        if success:
            try:
                clear_order_note(batch_id)
            except Exception:
                pass
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to reject'}), 400
    return jsonify({'error': 'Invalid action'}), 400


@manager_bp.route('/activity', methods=['GET'])
def manager_activity():
    """
    Temporary in-memory activity feed (clears on server restart).
    """
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        limit = int(request.args.get('limit', 50))
    except Exception:
        limit = 50
    try:
        since_id = request.args.get('since_id', None)
        since_id = int(since_id) if since_id is not None and str(since_id).strip() != '' else None
    except Exception:
        since_id = None

    return jsonify({'events': list_events(limit=limit, since_id=since_id)})


@manager_bp.route('/tables/<int:table_number>/close', methods=['POST'])
def manager_close_table(table_number: int):
    """
    Manager-side close (collect payment and close bill) for the table's latest open order.
    Safety: don't allow closing until every item is delivered.
    """
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

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

    pending = (
        OrderItem.query.join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
        .filter(OrderBatch.order_id == order.id)
        .filter((OrderItem.kitchen_status.is_(None)) | (OrderItem.kitchen_status != "delivered"))
        .count()
    )
    if pending > 0:
        return jsonify({"error": "Cannot close order: some items are not delivered yet"}), 400

    try:
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

@manager_bp.route('/menu', methods=['GET'])
def get_menu():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    dishes = get_available_dishes()
    return jsonify({'menu': dishes})

@manager_bp.route('/inventory', methods=['GET'])
def get_inventory():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    ingredients = Ingredient.query.filter_by(is_active=True).all()
    return jsonify({
        'ingredients': [
            {
                'id': ing.id,
                'name': ing.name,
                'unit': ing.unit,
                'current_quantity': ing.current_quantity,
                'purchase_price_per_unit': ing.purchase_price_per_unit,
                'low_stock_threshold': ing.low_stock_threshold,
                'is_active': ing.is_active,
                'created_at': ing.created_at.isoformat()
            } for ing in ingredients
        ]
    })


# ════════════════════════════════════════════════════════════════════════════
# INGREDIENTS CRUD
# ════════════════════════════════════════════════════════════════════════════

@manager_bp.route('/ingredients', methods=['POST'])
def add_ingredient():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    
    # Validate required fields
    if not data.get('name') or not data.get('unit'):
        return jsonify({'error': 'Name and unit are required'}), 400
    
    # Check if ingredient with same name already exists
    existing = Ingredient.query.filter_by(name=data.get('name')).first()
    if existing:
        return jsonify({'error': 'Ingredient with this name already exists'}), 400
    
    try:
        ingredient = Ingredient(
            name=data.get('name'),
            unit=data.get('unit'),
            current_quantity=float(data.get('current_quantity', 0)),
            purchase_price_per_unit=float(data.get('purchase_price_per_unit', 0)),
            low_stock_threshold=float(data.get('low_stock_threshold', 0)),
            is_active=True
        )
        db.session.add(ingredient)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{ingredient.name} added to inventory',
            'ingredient': {
                'id': ingredient.id,
                'name': ingredient.name,
                'unit': ingredient.unit,
                'current_quantity': ingredient.current_quantity,
                'purchase_price_per_unit': ingredient.purchase_price_per_unit,
                'low_stock_threshold': ingredient.low_stock_threshold
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/ingredients/<int:ingredient_id>', methods=['PUT'])
def edit_ingredient(ingredient_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    ingredient = Ingredient.query.get(ingredient_id)
    if not ingredient:
        return jsonify({'error': 'Ingredient not found'}), 404
    
    data = request.get_json()
    
    try:
        if 'name' in data:
            # Check for duplicates (excluding self)
            duplicate = Ingredient.query.filter_by(name=data['name']).filter(Ingredient.id != ingredient_id).first()
            if duplicate:
                return jsonify({'error': 'Another ingredient with this name already exists'}), 400
            ingredient.name = data['name']
        
        if 'unit' in data:
            ingredient.unit = data['unit']
        if 'current_quantity' in data:
            ingredient.current_quantity = float(data['current_quantity'])
        if 'purchase_price_per_unit' in data:
            ingredient.purchase_price_per_unit = float(data['purchase_price_per_unit'])
        if 'low_stock_threshold' in data:
            ingredient.low_stock_threshold = float(data['low_stock_threshold'])
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{ingredient.name} updated',
            'ingredient': {
                'id': ingredient.id,
                'name': ingredient.name,
                'unit': ingredient.unit,
                'current_quantity': ingredient.current_quantity,
                'purchase_price_per_unit': ingredient.purchase_price_per_unit,
                'low_stock_threshold': ingredient.low_stock_threshold
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/ingredients/<int:ingredient_id>', methods=['DELETE'])
def delete_ingredient(ingredient_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    ingredient = Ingredient.query.get(ingredient_id)
    if not ingredient:
        return jsonify({'error': 'Ingredient not found'}), 400
    
    try:
        ingredient.is_active = False
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{ingredient.name} removed from inventory'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# DISHES CRUD
# ════════════════════════════════════════════════════════════════════════════

@manager_bp.route('/dishes', methods=['GET', 'POST'])
def dishes():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'GET':
        dishes = Dish.query.filter_by(is_active=True).order_by(Dish.created_at.desc()).all()
        return jsonify({
            'dishes': [
                {
                    'id': d.id,
                    'name': d.name,
                    'description': d.description,
                    'category': getattr(d, 'category', None),
                    'photo_path': d.photo_path,
                    'base_price': d.base_price,
                    'selling_price': d.selling_price,
                    'is_visible': d.is_visible,
                    'is_active': d.is_active,
                    'ingredient_count': int(len(getattr(d, 'ingredients', []) or [])),
                    'created_at': d.created_at.isoformat()
                } for d in dishes
            ]
        })

    # POST: create dish
    data = request.get_json() or {}

    # Validate required fields
    if not data.get('name'):
        return jsonify({'error': 'Dish name is required'}), 400

    # Check if dish with same name already exists
    existing = Dish.query.filter_by(name=data.get('name')).first()
    if existing:
        return jsonify({'error': 'Dish with this name already exists'}), 400

    try:
        dish = Dish(
            name=data.get('name'),
            description=data.get('description', ''),
            category=(data.get('category') or None),
            photo_path=data.get('photo_path'),
            base_price=float(data.get('base_price', 0)),
            selling_price=(float(data['selling_price']) if data.get('selling_price') is not None else None),
            is_visible=data.get('is_visible', True),
            is_active=True
        )
        db.session.add(dish)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{dish.name} added to menu',
            'dish': {
                'id': dish.id,
                'name': dish.name,
                'description': dish.description,
                'category': getattr(dish, 'category', None),
                'photo_path': dish.photo_path,
                'base_price': dish.base_price,
                'selling_price': dish.selling_price,
                'is_visible': dish.is_visible,
                'ingredients': []
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/dishes/<int:dish_id>', methods=['PUT'])
def edit_dish(dish_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish = Dish.query.get(dish_id)
    if not dish:
        return jsonify({'error': 'Dish not found'}), 404
    
    data = request.get_json()
    
    try:
        if 'name' in data:
            # Check for duplicates (excluding self)
            duplicate = Dish.query.filter_by(name=data['name']).filter(Dish.id != dish_id).first()
            if duplicate:
                return jsonify({'error': 'Another dish with this name already exists'}), 400
            dish.name = data['name']
        
        if 'description' in data:
            dish.description = data['description']
        if 'category' in data:
            dish.category = (data['category'] or None)
        if 'photo_path' in data:
            dish.photo_path = data['photo_path']
        if 'base_price' in data:
            dish.base_price = float(data['base_price'])
        if 'selling_price' in data:
            dish.selling_price = (float(data['selling_price']) if data['selling_price'] is not None else None)
        if 'is_visible' in data:
            dish.is_visible = data['is_visible']
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{dish.name} updated',
            'dish': {
                'id': dish.id,
                'name': dish.name,
                'description': dish.description,
                'category': getattr(dish, 'category', None),
                'photo_path': dish.photo_path,
                'base_price': dish.base_price,
                'selling_price': dish.selling_price,
                'is_visible': dish.is_visible
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/dishes/<int:dish_id>', methods=['DELETE'])
def delete_dish(dish_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish = Dish.query.get(dish_id)
    if not dish:
        return jsonify({'error': 'Dish not found'}), 404
    
    try:
        # Remove all associated ingredients
        DishIngredient.query.filter_by(dish_id=dish_id).delete()
        
        # Mark as inactive instead of deleting
        dish.is_active = False
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{dish.name} removed from menu'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# DISH INGREDIENTS (Recipe) CRUD
# ════════════════════════════════════════════════════════════════════════════

@manager_bp.route('/dishes/<int:dish_id>/ingredients', methods=['POST'])
def add_dish_ingredient(dish_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish = Dish.query.get(dish_id)
    if not dish:
        return jsonify({'error': 'Dish not found'}), 404
    
    data = request.get_json()
    ingredient_id = data.get('ingredient_id')
    quantity_required = float(data.get('quantity_required', 0))
    
    if not ingredient_id:
        return jsonify({'error': 'Ingredient ID is required'}), 400
    
    # Check if ingredient exists
    ingredient = Ingredient.query.get(ingredient_id)
    if not ingredient:
        return jsonify({'error': 'Ingredient not found'}), 404
    
    # Check if this ingredient is already in the dish
    existing = DishIngredient.query.filter_by(
        dish_id=dish_id,
        ingredient_id=ingredient_id
    ).first()
    if existing:
        return jsonify({'error': 'This ingredient is already in the recipe'}), 400
    
    try:
        dish_ingredient = DishIngredient(
            dish_id=dish_id,
            ingredient_id=ingredient_id,
            quantity_required=quantity_required
        )
        db.session.add(dish_ingredient)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{ingredient.name} added to {dish.name}',
            'dish_ingredient': {
                'id': dish_ingredient.id,
                'ingredient_id': ingredient_id,
                'ingredient_name': ingredient.name,
                'quantity_required': quantity_required,
                'unit': ingredient.unit
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/dishes/<int:dish_id>/ingredients/<int:ing_id>', methods=['PUT'])
def edit_dish_ingredient(dish_id, ing_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish_ingredient = DishIngredient.query.filter_by(
        dish_id=dish_id,
        ingredient_id=ing_id
    ).first()
    
    if not dish_ingredient:
        return jsonify({'error': 'Ingredient not found in this dish'}), 404
    
    data = request.get_json()
    
    try:
        if 'quantity_required' in data:
            dish_ingredient.quantity_required = float(data['quantity_required'])
        
        db.session.commit()
        
        ingredient = dish_ingredient.ingredient
        return jsonify({
            'success': True,
            'message': f'{ingredient.name} quantity updated',
            'dish_ingredient': {
                'id': dish_ingredient.id,
                'ingredient_id': ing_id,
                'ingredient_name': ingredient.name,
                'quantity_required': dish_ingredient.quantity_required,
                'unit': ingredient.unit
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/dishes/<int:dish_id>/ingredients/<int:ing_id>', methods=['DELETE'])
def remove_dish_ingredient(dish_id, ing_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish_ingredient = DishIngredient.query.filter_by(
        dish_id=dish_id,
        ingredient_id=ing_id
    ).first()
    
    if not dish_ingredient:
        return jsonify({'error': 'Ingredient not found in this dish'}), 404
    
    try:
        ingredient_name = dish_ingredient.ingredient.name
        db.session.delete(dish_ingredient)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{ingredient_name} removed from recipe'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@manager_bp.route('/dishes/<int:dish_id>/ingredients', methods=['GET'])
def get_dish_ingredients(dish_id):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401
    
    dish = Dish.query.get(dish_id)
    if not dish:
        return jsonify({'error': 'Dish not found'}), 404
    
    ingredients = DishIngredient.query.filter_by(dish_id=dish_id).all()
    
    return jsonify({
        'dish_id': dish_id,
        'dish_name': dish.name,
        'ingredients': [
            {
                'id': di.id,
                'ingredient_id': di.ingredient_id,
                'ingredient_name': di.ingredient.name,
                'quantity_required': di.quantity_required,
                'unit': di.ingredient.unit,
                'price_per_unit': di.ingredient.purchase_price_per_unit,
                'total_cost': di.quantity_required * di.ingredient.purchase_price_per_unit
            } for di in ingredients
        ]
    })


# ═══════════════════════════════════════════════════════════════
# CLOSED ORDERS / BILLS
# ═══════════════════════════════════════════════════════════════

def _order_bill_json(order: Order):
    table = order.table if order else None

    # Aggregate items by dish name + price across all batches
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
    rate = float(_restaurant_meta().get('gst_rate') or 5)
    gst = round(subtotal * (rate / 100.0), 2)
    service = 0.0
    total = round(subtotal + gst + service, 2)

    return {
        'restaurant': _restaurant_meta(),
        "order_id": order.id,
        "table_number": table.table_number if table else None,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "closed_at": order.closed_at.isoformat() if order.closed_at else None,
        "items": line_items,
        "subtotal": subtotal,
        "gst": gst,
        "service_charge": service,
        "total": total,
    }


@manager_bp.route('/orders/closed', methods=['GET'])
def list_closed_orders():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    q = (request.args.get('q') or '').strip().lower()
    try:
        limit = int(request.args.get('limit', 100))
    except Exception:
        limit = 100
    limit = max(1, min(300, limit))

    orders_q = Order.query.filter_by(status='closed').order_by(Order.closed_at.desc().nullslast(), Order.id.desc())
    orders = orders_q.limit(limit).all()

    rows = []
    for o in orders:
        table = o.table
        table_no = table.table_number if table else None
        if q:
            hay = f"{o.id} {table_no or ''}".lower()
            if q not in hay:
                continue
        rows.append({
            "order_id": o.id,
            "table_number": table_no,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "closed_at": o.closed_at.isoformat() if o.closed_at else None,
            "subtotal": float(o.total_amount or 0),
        })

    return jsonify({"orders": rows})


@manager_bp.route('/orders/<int:order_id>/bill', methods=['GET'])
def get_order_bill(order_id: int):
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    return jsonify({"bill": _order_bill_json(order)})


# ===============================
# ANALYTICS
# ===============================
@manager_bp.route('/analytics', methods=['GET'])
def manager_analytics():
    token = request.headers.get('Authorization')
    if not token or token not in active_sessions:
        return jsonify({'error': 'Unauthorized'}), 401

    # Range: YYYY-MM-DD
    from_s = (request.args.get('from') or '').strip()
    to_s = (request.args.get('to') or '').strip()

    # "All time" support: when both are blank, use earliest closed order date.
    if not from_s and not to_s:
        try:
            min_closed = (
                db.session.query(func.min(Order.closed_at))
                .filter(Order.status == 'closed')
                .filter(Order.closed_at.isnot(None))
                .scalar()
            )
        except Exception:
            min_closed = None

        if min_closed:
            start = min_closed.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start = (now_local_naive() - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

        end = now_local_naive().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    else:
        start = None
        end = None

    try:
        if start is None:
            if from_s:
                start = datetime.strptime(from_s, '%Y-%m-%d')
            else:
                start = now_local_naive() - timedelta(days=30)
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    except Exception:
        start = (now_local_naive() - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

    try:
        if end is None:
            if to_s:
                end = datetime.strptime(to_s, '%Y-%m-%d')
            else:
                end = now_local_naive()
            # End is exclusive (next day midnight)
            end = end.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    except Exception:
        end = (now_local_naive().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1))

    rate = 5.0
    try:
        m = Manager.query.first()
        if m and getattr(m, 'gst_rate', None) is not None:
            rate = float(m.gst_rate)
    except Exception:
        rate = 5.0

    closed_q = (
        Order.query.filter(Order.status == 'closed')
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= start)
        .filter(Order.closed_at < end)
    )

    orders_closed = closed_q.count()
    subtotal_sum = float(closed_q.with_entities(func.coalesce(func.sum(Order.total_amount), 0)).scalar() or 0)
    gst_sum = round(subtotal_sum * (rate / 100.0), 2)
    total_sum = round(subtotal_sum + gst_sum, 2)

    avg_order = round((subtotal_sum / orders_closed), 2) if orders_closed else 0.0

    # Items sold (closed range)
    total_items_sold = int(
        (
            db.session.query(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
            .join(Order, OrderBatch.order_id == Order.id)
            .filter(Order.status == 'closed')
            .filter(Order.closed_at.isnot(None))
            .filter(Order.closed_at >= start)
            .filter(Order.closed_at < end)
            .scalar()
        )
        or 0
    )

    # Orders by day (fill gaps for charts)
    rows = (
        closed_q.with_entities(
            func.date(Order.closed_at).label('d'),
            func.count(Order.id).label('c'),
            func.coalesce(func.sum(Order.total_amount), 0).label('s'),
        )
        .group_by('d')
        .order_by('d')
        .all()
    )

    by_day = {str(d): {'orders': int(c or 0), 'subtotal': float(s or 0)} for d, c, s in rows}

    series = []
    day = start
    last_day = end - timedelta(days=1)
    while day.date() <= last_day.date():
        key = day.date().isoformat()
        rec = by_day.get(key, {'orders': 0, 'subtotal': 0.0})
        day_sub = float(rec['subtotal'] or 0)
        day_gst = round(day_sub * (rate / 100.0), 2)
        series.append({
            'date': key,
            'orders': int(rec['orders'] or 0),
            'subtotal': day_sub,
            'gst': day_gst,
            'total': round(day_sub + day_gst, 2)
        })
        day = day + timedelta(days=1)

    # ---- Top performing dishes (by revenue) ----
    def _dish_agg(range_start: datetime, range_end: datetime):
        q = (
            db.session.query(
                OrderItem.dish_id,
                Dish.name.label('dish_name'),
                Dish.category.label('dish_category'),
                OrderItem.custom_name.label('custom_name'),
                func.sum(OrderItem.quantity).label('orders'),
                func.sum(OrderItem.quantity * OrderItem.unit_price).label('revenue'),
                func.sum(OrderItem.quantity * func.coalesce(Dish.base_price, 0)).label('cost'),
            )
            .join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
            .join(Order, OrderBatch.order_id == Order.id)
            .outerjoin(Dish, OrderItem.dish_id == Dish.id)
            .filter(Order.status == 'closed')
            .filter(Order.closed_at.isnot(None))
            .filter(Order.closed_at >= range_start)
            .filter(Order.closed_at < range_end)
            .group_by(OrderItem.dish_id, Dish.name, Dish.category, OrderItem.custom_name)
        )
        out = {}
        for dish_id, dish_name, dish_category, custom_name, orders, revenue, cost in q.all():
            name = dish_name or custom_name or 'Custom Dish'
            key = f"{dish_id or 'custom'}::{name}"  # stable for custom rows
            out[key] = {
                'dish_id': dish_id,
                'name': name,
                'category': (dish_category or None),
                'orders': int(orders or 0),
                'revenue': float(revenue or 0),
                'cost': float(cost or 0),
            }
        return out

    # Previous period (same length) for trend
    delta = end - start
    if delta.total_seconds() <= 0:
        delta = timedelta(days=30)
    prev_end = start
    prev_start = start - delta

    cur_map = _dish_agg(start, end)
    prev_map = _dish_agg(prev_start, prev_end)

    top_dishes = []
    for key, cur in cur_map.items():
        prev = prev_map.get(key, {'revenue': 0.0})
        prev_rev = float(prev.get('revenue') or 0)
        cur_rev = float(cur.get('revenue') or 0)
        if prev_rev <= 0:
            trend = 100.0 if cur_rev > 0 else 0.0
        else:
            trend = ((cur_rev - prev_rev) / prev_rev) * 100.0

        margin = None
        if cur.get('dish_id') is not None and cur_rev > 0:
            margin = ((cur_rev - float(cur.get('cost') or 0)) / cur_rev) * 100.0

        top_dishes.append({
            'name': cur['name'],
            'category': cur.get('category'),
            'orders': int(cur.get('orders') or 0),
            'revenue': round(cur_rev, 2),
            'margin_percent': round(margin, 1) if margin is not None else None,
            'trend_percent': round(trend, 1),
        })

    top_dishes.sort(key=lambda x: (x['revenue'], x['orders']), reverse=True)
    top_dishes = top_dishes[:10]

    # Table performance
    table_rows = (
        closed_q.join(RestaurantTable, Order.table_id == RestaurantTable.id)
        .with_entities(RestaurantTable.table_number, func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
        .group_by(RestaurantTable.table_number)
        .order_by(func.coalesce(func.sum(Order.total_amount), 0).desc())
        .limit(10)
        .all()
    )
    top_tables = [{'table_number': int(tn), 'orders': int(c), 'subtotal': float(s or 0)} for tn, c, s in table_rows]

    open_orders = Order.query.filter_by(status='open').count()

    return jsonify({
        'range': {
            'from': start.date().isoformat(),
            'to': (end - timedelta(days=1)).date().isoformat(),
        },
        'gst_rate': rate,
        'summary': {
            'orders_closed': orders_closed,
            'orders_open': int(open_orders or 0),
            'items_sold': int(total_items_sold or 0),
            'revenue_subtotal': round(subtotal_sum, 2),
            'revenue_gst': gst_sum,
            'revenue_total': total_sum,
            'avg_order_value': avg_order,
        },
        'series': series,
        'top_dishes': top_dishes,
        'top_tables': top_tables,
        'generated_at': now_local_naive().isoformat()
    })

    # Top dishes in range (Python aggregate for custom items)
    items = (
        OrderItem.query.join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
        .join(Order, OrderBatch.order_id == Order.id)
        .filter(Order.status == 'closed')
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= start)
        .filter(Order.closed_at < end)
        .all()
    )

    dish_map = {}
    total_items_sold = 0
    for it in items:
        name = it.dish.name if it.dish else (it.custom_name or 'Custom Dish')
        qty = int(it.quantity or 0)
        amt = float(it.unit_price or 0) * qty
        total_items_sold += qty
        if name not in dish_map:
            dish_map[name] = {'name': name, 'qty': 0, 'revenue': 0.0}
        dish_map[name]['qty'] += qty
        dish_map[name]['revenue'] += amt

    top = list(dish_map.values())
    top.sort(key=lambda x: (x['revenue'], x['qty']), reverse=True)
    top = top[:10]

    # Table performance
    table_rows = (
        closed_q.join(RestaurantTable, Order.table_id == RestaurantTable.id)
        .with_entities(RestaurantTable.table_number, func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
        .group_by(RestaurantTable.table_number)
        .order_by(func.coalesce(func.sum(Order.total_amount), 0).desc())
        .limit(10)
        .all()
    )
    top_tables = [{'table_number': int(tn), 'orders': int(c), 'subtotal': float(s or 0)} for tn, c, s in table_rows]

    open_orders = Order.query.filter_by(status='open').count()

    return jsonify({
        'range': {
            'from': start.date().isoformat(),
            'to': (end - timedelta(days=1)).date().isoformat(),
        },
        'gst_rate': rate,
        'summary': {
            'orders_closed': orders_closed,
            'orders_open': int(open_orders or 0),
            'items_sold': int(total_items_sold or 0),
            'revenue_subtotal': round(subtotal_sum, 2),
            'revenue_gst': gst_sum,
            'revenue_total': total_sum,
            'avg_order_value': avg_order,
        },
        'series': series,
        'top_dishes': top,
        'top_tables': top_tables,
        'generated_at': now_local_naive().isoformat()
    })
