from flask import Blueprint, jsonify, request
import json
import re
import math

from models import db, RestaurantTable, Dish, Order, OrderBatch, OrderItem, Ingredient, Manager, CustomDishIngredient
from services.inventory_service import get_available_dishes
from services.close_request_store import set_close_request
from services.ai_service import generate_custom_dish_recipe, generate_custom_dish_steps
from services.activity_store import log_event, summarize_dishes
from services.order_note_store import set_order_note, get_order_note

customer_bp = Blueprint("customer", __name__)

_NON_FOOD_MESSAGE = "I don't have any knowledge in this field. Ask me anything you want to eat."

def _norm_name(s: str) -> str:
    s = str(s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())

def _tokens(s: str):
    base = _norm_name(s)
    toks = []
    for t in base.split():
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        toks.append(t)
    return [t for t in toks if t]


def _is_food_related_prompt(category: str, prompt: str) -> bool:
    """
    Lightweight guardrail:
    - Reject clearly non-food queries (coding/math/general requests).
    - Accept if prompt contains common food words/flavors OR mentions any known ingredient name.

    We keep this intentionally conservative to avoid false rejections.
    """
    p = str(prompt or "").strip()
    if not p:
        return False

    pt = set(_tokens(p))

    # Hard negatives (non-food intent)
    neg = {
        "code", "coding", "program", "programming", "developer", "bug", "debug", "error", "stack", "trace",
        "python", "java", "javascript", "typescript", "react", "vue", "angular", "html", "css", "sql", "database",
        "api", "token", "key", "jwt", "server", "backend", "frontend", "flask", "django", "node", "npm", "git", "github",
        "math", "algebra", "calculus", "integral", "derivative", "equation", "physics", "chemistry",
        "history", "politics", "finance", "stock", "bitcoin", "crypto",
    }
    if pt.intersection(neg):
        return False

    # Positives (food intent)
    pos = {
        "eat", "eating", "food", "dish", "meal", "recipe", "cook", "cooking", "hungry", "craving",
        "breakfast", "lunch", "dinner", "snack", "dessert", "sweet", "spicy", "mild", "tangy", "salty", "sour",
        "drink", "beverage", "juice", "shake", "tea", "coffee",
        "veg", "vegan", "vegetarian", "jain", "keto", "protein", "healthy", "light", "low", "calorie", "gluten",
    }
    if pt.intersection(pos):
        return True

    # Ingredient-name match (uses existing inventory table; no extra DB changes)
    try:
        p_norm = _norm_name(p)
        for ing in (_inventory_ingredients() or [])[:250]:
            name = getattr(ing, "name", None)
            if not name:
                continue
            n = _norm_name(name)
            if n and n in p_norm:
                return True
    except Exception:
        pass

    # If we couldn't detect food intent, treat as non-food.
    return False

def _inventory_ingredients():
    try:
        return Ingredient.query.filter_by(is_active=True).all()
    except Exception:
        # Backward-compatible with older DBs that may not have ingredients.is_active
        return Ingredient.query.all()

def _manager_custom_margin_percent() -> float:
    m = Manager.query.first()
    try:
        v = float(getattr(m, "custom_dish_profit_margin", None) or 30.0) if m else 30.0
    except Exception:
        v = 30.0
    if v < 0:
        v = 0.0
    if v > 500:
        v = 500.0
    return float(v)

def _as_float(v, default=0.0) -> float:
    try:
        if v is None:
            return float(default)
        out = float(v)
        if math.isnan(out) or math.isinf(out):
            return float(default)
        return out
    except Exception:
        try:
            s = str(v).strip()
            # Extract first number from strings like "2 tbsp" / "0.5 kg"
            m = re.search(r"(-?\d+(?:\.\d+)?)", s)
            if m:
                out = float(m.group(1))
            else:
                out = float(s)
            if math.isnan(out) or math.isinf(out):
                return float(default)
            return out
        except Exception:
            return float(default)

def _sanitize_custom_ingredients(ai_ingredients):
    """
    Returns (sanitized_rows, missing_names)
    sanitized_rows: [{ingredient: Ingredient, qty: float}]
    """
    raw_rows = ai_ingredients if isinstance(ai_ingredients, list) else []
    rows = []
    for r in raw_rows:
        if isinstance(r, str) and r.strip():
            rows.append({"name": r.strip()})
        elif isinstance(r, dict):
            rows.append(r)
    ing_rows = _inventory_ingredients() or []
    by_id = {int(i.id): i for i in ing_rows if i and getattr(i, "id", None) is not None}
    by_norm = {_norm_name(i.name): i for i in ing_rows if i and i.name}

    # Precompute token sets for fuzzy matching
    cand_tokens = []
    for ing in ing_rows:
        if not ing or not getattr(ing, "name", None):
            continue
        cand_tokens.append((ing, set(_tokens(ing.name))))

    sanitized = []
    missing = []
    for r in rows:
        if not isinstance(r, dict):
            continue

        ing = None
        # Prefer ID-based mapping when AI returns it.
        ing_id = r.get("ingredient_id", None)
        try:
            if ing_id is not None and str(ing_id).strip() != "":
                s = str(ing_id).strip()
                m = re.search(r"\d+", s)
                ing = by_id.get(int(m.group(0))) if m else None
        except Exception:
            ing = None

        name = (r.get("name") or "").strip()
        if not ing and name:
            ing = by_norm.get(_norm_name(name))

        # Fuzzy: map "chicken breast" -> "chicken", "mixed vegetables" -> "vegetables"
        if not ing and name:
            q_tokens = set(_tokens(name))
            best = None
            best_score = 0.0
            if q_tokens:
                for cand, tset in cand_tokens:
                    if not tset:
                        continue
                    inter = len(q_tokens.intersection(tset))
                    score = inter / max(1, len(q_tokens))
                    if score > best_score:
                        best_score = score
                        best = cand
            if best and best_score >= 0.6:
                ing = best

        if not ing:
            missing.append(name or str(ing_id or ""))
            continue
        qty_raw = r.get("qty", None) if "qty" in r else r.get("quantity", None)
        qty = _as_float(qty_raw, 0.0)
        # If qty is missing, assume a small sensible amount (prevents empty lists).
        if (qty <= 0 or qty < 1e-6) and qty_raw is None:
            unit = str(getattr(ing, "unit", "") or "").lower()
            if "pc" in unit:
                qty = 1.0
            elif unit == "g":
                qty = 10.0
            elif unit == "kg":
                qty = 0.05
            elif unit == "l":
                qty = 0.1
            else:
                qty = 0.05
        # Guard tiny/invalid amounts so customer sees only actually used ingredients.
        if qty <= 0 or qty < 1e-6:
            continue
        sanitized.append({"ingredient": ing, "qty": qty})

    # de-dup by ingredient id (sum qty)
    merged = {}
    for r in sanitized:
        ing = r["ingredient"]
        qty = float(r["qty"])
        if not ing:
            continue
        merged[ing.id] = (merged.get(ing.id, 0.0) + qty)

    out = []
    for ing_id, qty in merged.items():
        ing = next((x for x in ing_rows if x.id == ing_id), None)
        if ing:
            out.append({"ingredient": ing, "qty": float(qty)})

    return out, missing


def _fallback_custom_ingredients(category: str, prompt: str):
    """
    Deterministic ingredient selection from inventory when AI returns unmappable ingredients.
    Returns sanitized_rows compatible with _custom_base_cost.
    """
    ing_rows = _inventory_ingredients() or []
    by_norm = {_norm_name(i.name): i for i in ing_rows if i and getattr(i, "name", None)}

    def pick(name: str, qty: float, picked: list):
        ing = by_norm.get(_norm_name(name))
        if not ing:
            return
        picked.append({"ingredient": ing, "qty": float(qty)})

    cat = str(category or "").strip().lower()
    toks = set(_tokens(prompt or "") + _tokens(category or ""))

    picked = []

    def ensure_savory_base():
        pick("Cooking Oil", 0.01, picked)
        pick("Salt", 0.006, picked)
        pick("Turmeric Powder", 0.002, picked)
        pick("Red Chilli Powder", 0.003, picked)
        pick("Garam Masala", 0.003, picked)
        pick("Onion", 0.12, picked)
        pick("Tomato", 0.15, picked)

    if "dessert" in cat or "desserts" in cat:
        pick("Milk", 0.35, picked)
        pick("Sugar", 0.03, picked)
        pick("Fresh Cream", 0.04, picked)
        if "banana" in toks:
            pick("Banana", 1, picked)
        else:
            pick("Curd / Yogurt", 0.12, picked)
        pick("Butter", 0.01, picked)

    elif "beverage" in cat or "beverages" in cat:
        if "lassi" in toks or "yogurt" in toks or "curd" in toks:
            pick("Curd / Yogurt", 0.3, picked)
            pick("Cumin Seeds", 0.002, picked)
            pick("Salt", 0.003, picked)
            pick("Sugar", 0.01, picked)
        else:
            pick("Milk", 0.35, picked)
            pick("Sugar", 0.02, picked)
            if "protein" in toks:
                pick("RAW Plant Protein Powder", 0.03, picked)
            pick("Banana", 1, picked)

    else:
        ensure_savory_base()

        if "thali" in cat:
            pick("Rice", 0.2, picked)
            pick("Wheat Flour", 0.12, picked)

        if "paneer" in toks:
            pick("Paneer", 0.22, picked)
        elif "chicken" in toks:
            pick("Chicken Breast", 0.25, picked)
        elif "egg" in toks:
            pick("Eggs", 2, picked)
        elif "potato" in toks or "aloo" in toks:
            pick("Potato", 0.25, picked)
        else:
            # Default veg base
            pick("Potato", 0.2, picked)
            pick("Green Peas", 0.12, picked)

        if "spinach" in toks or "palak" in toks:
            pick("Spinach", 0.1, picked)
        if "carrot" in toks:
            pick("Carrot", 0.08, picked)
        if "capsicum" in toks or "pepper" in toks:
            pick("Capsicum", 0.08, picked)

    # De-dup by ingredient id (sum qty)
    merged = {}
    for r in picked:
        ing = r.get("ingredient")
        qty = float(r.get("qty") or 0)
        if not ing or qty <= 0:
            continue
        merged[ing.id] = merged.get(ing.id, 0.0) + qty

    out = []
    for ing_id, qty in merged.items():
        ing = next((x for x in ing_rows if x.id == ing_id), None)
        if ing and qty > 0:
            out.append({"ingredient": ing, "qty": float(qty)})

    # Keep it concise (6-12 ingredients)
    out.sort(key=lambda r: float(r.get("qty") or 0), reverse=True)
    return out[:12]

def _custom_base_cost(sanitized_rows) -> float:
    cost = 0.0
    for r in (sanitized_rows or []):
        ing = r.get("ingredient")
        qty = float(r.get("qty") or 0)
        if not ing or qty <= 0:
            continue
        cost += float(getattr(ing, "purchase_price_per_unit", 0) or 0) * qty
    return float(cost)

def _custom_price(base_cost: float, margin_percent: float) -> float:
    c = float(base_cost or 0.0)
    m = float(margin_percent or 0.0)
    return float(round(c + (c * (m / 100.0)), 2))


def _cap_qty_for_one_serving(name: str, unit: str, qty: float) -> float:
    n = _norm_name(name)
    u = str(unit or "").strip().lower()
    q = float(qty or 0)
    if q <= 0:
        return 0.0

    spiceish = any(k in n for k in ["salt", "turmeric", "cumin", "coriander", "chilli", "masala"])
    fatish = any(k in n for k in ["oil", "ghee", "butter"])

    if u in ("pcs", "pc"):
        if "banana" in n:
            return min(q, 2.0)
        if "egg" in n:
            return min(q, 2.0)
        return min(q, 4.0)

    if u == "g":
        if spiceish:
            return min(q, 10.0)
        return min(q, 80.0)

    if u == "l":
        if "milk" in n:
            return min(q, 0.5)
        return min(q, 0.35)

    if u == "kg":
        if spiceish:
            return min(q, 0.02)
        if fatish:
            return min(q, 0.05)
        if "cream" in n or "curd" in n or "yogurt" in n:
            return min(q, 0.25)
        if "cheese" in n:
            return min(q, 0.12)
        # protein/veg
        return min(q, 0.35)

    # Default clamp
    return min(q, 1.0)


def _normalize_one_serving(sanitized_rows):
    out = []
    for r in (sanitized_rows or []):
        ing = r.get("ingredient")
        if not ing:
            continue
        qty = float(r.get("qty") or 0)
        capped = _cap_qty_for_one_serving(getattr(ing, "name", ""), getattr(ing, "unit", ""), qty)
        if capped <= 0:
            continue
        out.append({"ingredient": ing, "qty": float(round(capped, 4))})

    # De-dup by ingredient id (sum qty after capping)
    merged = {}
    for r in out:
        ing = r["ingredient"]
        merged[ing.id] = merged.get(ing.id, 0.0) + float(r["qty"])

    final = []
    ing_rows = _inventory_ingredients() or []
    for ing_id, qty in merged.items():
        ing = next((x for x in ing_rows if x.id == ing_id), None)
        if ing and qty > 0:
            final.append({"ingredient": ing, "qty": float(round(qty, 4))})
    return final


def _ensure_steps_and_notes(dish: dict, sanitized_rows, category: str, prompt: str):
    d = dish if isinstance(dish, dict) else {}

    steps = d.get("steps")
    if isinstance(steps, list):
        steps = [str(s).strip() for s in steps if isinstance(s, str) and s.strip()]
    else:
        steps = []

    notes = d.get("notes")
    if not isinstance(notes, str):
        notes = ""

    d["steps"] = steps
    d["notes"] = notes.strip()
    d["servings"] = 1
    return d

def _can_request_close_for_order(order: Order) -> bool:
    if not order or order.status != "open":
        return False
    # Can request close only if every item in this order is delivered.
    pending = (
        OrderItem.query.join(OrderBatch, OrderItem.order_batch_id == OrderBatch.id)
        .filter(OrderBatch.order_id == order.id)
        .filter((OrderItem.kitchen_status.is_(None)) | (OrderItem.kitchen_status != "delivered"))
        .count()
    )
    return pending == 0

def _table_from_auth(table_number, table_token):
    if table_number is None or table_token is None:
        return None
    try:
        n = int(table_number)
    except Exception:
        return None
    token = str(table_token).strip()
    if not token:
        return None
    table = RestaurantTable.query.filter_by(table_number=n, table_token=token, is_active=True).first()
    return table


def _dish_price(dish: Dish) -> float:
    # Prefer selling_price if set, else fall back to base_price
    try:
        return float(dish.selling_price if dish.selling_price is not None else dish.base_price)
    except Exception:
        return 0.0


def _batch_to_json(batch: OrderBatch):
    order = batch.order
    table = order.table if order else None
    return {
        "batch_id": batch.id,
        "order_id": order.id if order else None,
        "status": batch.status,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "table_number": table.table_number if table else None,
        "note": get_order_note(batch.id),
        "items": [
            {
                "dish_id": it.dish_id,
                "name": it.dish.name if it.dish else (it.custom_name or "Custom Dish"),
                "qty": it.quantity,
                "unit_price": it.unit_price,
                "is_custom": bool(it.is_custom),
            }
            for it in (batch.items or [])
        ],
        "total": sum((it.unit_price or 0) * (it.quantity or 0) for it in (batch.items or [])),
    }


def _check_stock_for_dish(dish: Dish, qty: int):
    # Validate stock for the requested qty at order time.
    for di in (dish.ingredients or []):
        ing = di.ingredient
        required = float(di.quantity_required or 0) * float(qty)
        if ing is None:
            continue
        if float(ing.current_quantity or 0) < required:
            return False, f"Low stock: {ing.name}"
    return True, None


@customer_bp.route("/tables", methods=["GET"])
def customer_tables():
    # Public endpoint: tables + tokens are meant to be scannable via QR anyway.
    tables = (
        RestaurantTable.query.filter_by(is_active=True)
        .order_by(RestaurantTable.table_number.asc())
        .all()
    )
    return jsonify(
        {
            "tables": [
                {
                    "id": t.id,
                    "table_number": t.table_number,
                    "table_token": t.table_token,
                }
                for t in tables
            ]
        }
    )


@customer_bp.route("/menu", methods=["GET"])
def customer_menu():
    # Optional query params can be used later for auth/validation.
    # For now we return available dishes based on inventory.
    return jsonify({"menu": get_available_dishes()})

@customer_bp.route("/ai/custom-dish", methods=["POST"])
def customer_ai_custom_dish():
    data = request.get_json() or {}

    # Require valid table session to use AI.
    table_number = data.get('table_number')
    table_token = data.get('table_token')
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({'error': 'Invalid table'}), 401

    category = data.get('category') or ''
    prompt = data.get('prompt') or ''
    
    if not category or not category.strip():
        return jsonify({'error': 'Category is required'}), 400
    
    if not prompt or not prompt.strip():
        return jsonify({'error': 'Description is required'}), 400

    # Strict guardrail: AI custom dish is only for food-related requests.
    if not _is_food_related_prompt(category, prompt):
        return jsonify({"error": _NON_FOOD_MESSAGE}), 400

    try:
        result = generate_custom_dish_recipe({
            'category': category,
            'prompt': prompt,
        })

        dish = result if isinstance(result, dict) else {}

        # If the AI provider returns a structured refusal, pass it through as a strict message.
        try:
            ai_err = dish.get("error") if isinstance(dish, dict) else None
        except Exception:
            ai_err = None
        if isinstance(ai_err, str) and ai_err.strip():
            return jsonify({"error": ai_err.strip()}), 400

        # Keep only ingredients we actually have, so pricing and fulfillment match inventory.
        sanitized, missing = _sanitize_custom_ingredients(dish.get("ingredients"))
        if len(sanitized) == 0:
            # Different approach: fall back to a deterministic ingredient set from inventory
            # (prevents hard failures when AI returns unmappable ingredient names).
            sanitized = _fallback_custom_ingredients(category, prompt)
            dish["used_fallback_ingredients"] = True
            if len(sanitized) == 0:
                hint = ""
                try:
                    if missing:
                        hint = f" Missing: {', '.join([str(x) for x in missing[:6]])}."
                except Exception:
                    hint = ""
                return jsonify({'error': 'Could not map ingredients to inventory. Please try generating again.' + hint}), 400

        # Normalize for 1 person portion.
        sanitized = _normalize_one_serving(sanitized)

        base_cost = _custom_base_cost(sanitized)
        margin = _manager_custom_margin_percent()
        price = _custom_price(base_cost, margin)

        dish["ingredients"] = [
            {"name": r["ingredient"].name, "qty": float(r["qty"]), "unit": r["ingredient"].unit}
            for r in sanitized
        ]

        # Let AI generate chef-ready steps using the *normalized* ingredient amounts.
        try:
            steps_obj = generate_custom_dish_steps(
                {
                    "name": dish.get("name"),
                    "category": dish.get("category") or category,
                    "prompt": prompt,
                    "description": dish.get("description") or "",
                },
                dish["ingredients"],
            )
            dish["steps"] = steps_obj.get("steps") or []
            dish["notes"] = steps_obj.get("notes") or (dish.get("notes") or "")
            dish["servings"] = 1
        except Exception as e:
            return jsonify({"error": str(e) or "AI could not generate cooking steps. Please try again."}), 400
        dish["base_cost"] = float(round(base_cost, 2))
        dish["profit_margin_percent"] = float(round(margin, 2))
        dish["price"] = float(price)

        # Make the brief preview more compelling + show price without changing UI structure.
        try:
            desc = str(dish.get("description") or "").strip()
        except Exception:
            desc = ""
        if not desc:
            desc = "A fresh, made-to-order special crafted just for you."
        dish["description"] = f"{desc} | Price: Rs {int(round(price))}"

        # Optionally surface missing items for debugging (not shown by UI)
        if missing:
            dish["missing_ingredients"] = list(dict.fromkeys(missing))[:10]

        return jsonify({'success': True, 'dish': dish}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"AI Error: {str(e)}")
        return jsonify({'error': str(e)}), 400



@customer_bp.route("/orders/active", methods=["GET"])
def customer_active_order():
    table_number = request.args.get("table_number")
    table_token = request.args.get("table_token")
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({"error": "Invalid table"}), 401

    order = Order.query.filter_by(table_id=table.id, status="open").order_by(Order.created_at.desc()).first()
    if not order:
        return jsonify({"active_order": None, "active_orders": [], "can_request_close": False})

    # IMPORTANT: Track page should not go blank after waiter delivers.
    # If all batches are delivered but the order is still open (bill not closed),
    # we still return the latest batches so customer can request bill close.
    all_batches = (
        OrderBatch.query.filter_by(order_id=order.id)
        .order_by(OrderBatch.created_at.desc())
        .all()
    )
    undelivered = [b for b in all_batches if b.status != "delivered"]

    payload_all = [_batch_to_json(b) for b in all_batches]
    payload_active = [_batch_to_json(b) for b in undelivered]

    latest = payload_active[0] if payload_active else (payload_all[0] if payload_all else None)
    list_for_ui = payload_active if payload_active else payload_all

    return jsonify(
        {
            "active_order": latest,
            "active_orders": list_for_ui,
            "can_request_close": _can_request_close_for_order(order),
        }
    )


@customer_bp.route("/orders/history", methods=["GET"])
def customer_order_history():
    table_number = request.args.get("table_number")
    table_token = request.args.get("table_token")
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({"error": "Invalid table"}), 401

    # Return recent batches for this table (across open/closed orders).
    batches = (
        OrderBatch.query.join(Order, OrderBatch.order_id == Order.id)
        .filter(Order.table_id == table.id)
        .order_by(OrderBatch.created_at.desc())
        .limit(25)
        .all()
    )

    return jsonify({"orders": [_batch_to_json(b) for b in batches]})


@customer_bp.route("/orders/place", methods=["POST"])
def customer_place_order():
    data = request.get_json() or {}
    table_number = data.get("table_number")
    table_token = data.get("table_token")
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({"error": "Invalid table"}), 401

    note = data.get("note")
    if note is None:
        note = data.get("special_request")
    if note is None:
        note = data.get("notes")
    if not isinstance(note, str):
        note = ""
    note = note.strip()

    items = data.get("items") or []
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "No items provided"}), 400

    normalized = []
    for it in items:
        if not isinstance(it, dict):
            continue
        dish_id = it.get("dish_id") or it.get("id")
        qty = it.get("quantity") or it.get("qty") or 0
        try:
            dish_id = int(dish_id)
            qty = int(qty)
        except Exception:
            continue
        if dish_id <= 0 or qty <= 0:
            continue
        normalized.append((dish_id, qty))

    if len(normalized) == 0:
        return jsonify({"error": "No valid items provided"}), 400

    # Find or create an open order for this table.
    order = Order.query.filter_by(table_id=table.id, status="open").order_by(Order.created_at.desc()).first()
    if not order:
        order = Order(table_id=table.id, status="open", total_amount=0)
        db.session.add(order)
        db.session.flush()  # get order.id

    batch = OrderBatch(order_id=order.id, status="sent")
    db.session.add(batch)
    db.session.flush()  # get batch.id

    # Add items
    total = 0.0
    for dish_id, qty in normalized:
        dish = Dish.query.get(dish_id)
        if not dish or not dish.is_active or not dish.is_visible:
            db.session.rollback()
            return jsonify({"error": f"Dish not available (id {dish_id})"}), 400

        ok, msg = _check_stock_for_dish(dish, qty)
        if not ok:
            db.session.rollback()
            return jsonify({"error": msg}), 400

        unit_price = _dish_price(dish)
        oi = OrderItem(
            order_batch_id=batch.id,
            dish_id=dish.id,
            quantity=qty,
            unit_price=unit_price,
            is_custom=False,
            kitchen_status="queued",
        )
        db.session.add(oi)
        total += unit_price * qty

    # Update order running total (simple roll-up).
    order.total_amount = float(order.total_amount or 0) + float(total or 0)

    try:
        db.session.commit()
        # Reload relationships for response
        created = OrderBatch.query.get(batch.id)
        try:
            if note:
                set_order_note(created.id, note)
        except Exception:
            pass
        try:
            tno = table.table_number if table else None
            items_count = sum(int(it.quantity or 0) for it in (created.items or []))
            total = sum((float(it.unit_price or 0) * float(it.quantity or 0)) for it in (created.items or []))
            log_event(
                "order_placed",
                f"Table {tno} placed an order · Batch #{created.id} · {items_count} items · ₹{round(total, 0):.0f}",
                table_number=tno,
                order_id=order.id if order else None,
                batch_id=created.id,
                meta={
                    "items_qty": int(items_count or 0),
                    "amount": float(total or 0),
                    "dish_summary": summarize_dishes(created.items, max_items=2),
                },
            )
        except Exception:
            pass
        return jsonify({"success": True, "batch": _batch_to_json(created)}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@customer_bp.route("/orders/request-close", methods=["POST"])
def customer_request_close():
    """
    Customer requests waiter for payment / closing the bill.
    Body: { table_number, table_token }
    """
    data = request.get_json() or {}
    table_number = data.get("table_number")
    table_token = data.get("table_token")
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({"error": "Invalid table"}), 401

    order = (
        Order.query.filter_by(table_id=table.id, status="open")
        .order_by(Order.created_at.desc())
        .first()
    )
    if not order:
        return jsonify({"error": "No open order for this table"}), 400

    if not _can_request_close_for_order(order):
        return jsonify({"error": "Cannot request bill close until all items are delivered"}), 400

    # Logic-only: store request in memory so waiter can see it.
    set_close_request(table.table_number)
    return jsonify({"success": True}), 200


@customer_bp.route("/orders/custom", methods=["POST"])
def customer_create_custom_dish_order():
    """
    Create a custom dish order from AI-generated recipe.
    Requires manager approval before kitchen receives it.
    Body: { table_number, table_token, dish_data }
    """
    data = request.get_json() or {}
    table_number = data.get("table_number")
    table_token = data.get("table_token")
    dish_data = data.get("dish_data") or {}

    note = data.get("note")
    if note is None:
        note = data.get("special_request")
    if note is None:
        note = dish_data.get("note") if isinstance(dish_data, dict) else None
    if note is None:
        note = dish_data.get("special_request") if isinstance(dish_data, dict) else None
    if not isinstance(note, str):
        note = ""
    note = note.strip()
    
    table = _table_from_auth(table_number, table_token)
    if not table:
        return jsonify({"error": "Invalid table"}), 401

    if not dish_data or not dish_data.get('name'):
        return jsonify({"error": "Invalid dish data"}), 400

    try:
        sanitized, missing = _sanitize_custom_ingredients(dish_data.get("ingredients"))
        if len(sanitized) == 0:
            sanitized = _fallback_custom_ingredients(dish_data.get("category") or "", dish_data.get("name") or "")
            if len(sanitized) == 0:
                return jsonify({"error": "Invalid ingredients for custom dish"}), 400

        sanitized = _normalize_one_serving(sanitized)

        base_cost = _custom_base_cost(sanitized)
        margin = _manager_custom_margin_percent()
        unit_price = _custom_price(base_cost, margin)

        # Find or create an open order for this table
        order = Order.query.filter_by(table_id=table.id, status="open").order_by(Order.created_at.desc()).first()
        if not order:
            order = Order(table_id=table.id, status="open", total_amount=0)
            db.session.add(order)
            db.session.flush()

        # Create batch with "sent" status (pending manager approval)
        batch = OrderBatch(order_id=order.id, status="sent")
        db.session.add(batch)
        db.session.flush()

        # Create order item as custom dish
        payload_recipe = dict(dish_data or {})
        payload_recipe["ingredients"] = [
            {"name": r["ingredient"].name, "qty": float(r["qty"]), "unit": r["ingredient"].unit}
            for r in sanitized
        ]

        # Prefer steps coming from the preview response; if missing, generate again for the chef.
        steps_in = payload_recipe.get("steps")
        if not isinstance(steps_in, list) or len([s for s in steps_in if isinstance(s, str) and s.strip()]) < 4:
            try:
                steps_obj = generate_custom_dish_steps(
                    {
                        "name": payload_recipe.get("name") or dish_data.get("name") or "Custom Dish",
                        "category": payload_recipe.get("category") or dish_data.get("category") or "",
                        "prompt": payload_recipe.get("prompt") or payload_recipe.get("description") or payload_recipe.get("name") or "",
                        "description": payload_recipe.get("description") or "",
                    },
                    payload_recipe["ingredients"],
                )
                payload_recipe["steps"] = steps_obj.get("steps") or []
                payload_recipe["notes"] = steps_obj.get("notes") or (payload_recipe.get("notes") or "")
            except Exception as e:
                return jsonify({"error": str(e) or "AI could not generate cooking steps. Please try again."}), 400
        else:
            payload_recipe["steps"] = [str(s).strip() for s in steps_in if isinstance(s, str) and s.strip()]
            if not isinstance(payload_recipe.get("notes"), str):
                payload_recipe["notes"] = ""

        payload_recipe["servings"] = 1
        payload_recipe["base_cost"] = float(round(base_cost, 2))
        payload_recipe["profit_margin_percent"] = float(round(margin, 2))
        payload_recipe["price"] = float(unit_price)
        if missing:
            payload_recipe["missing_ingredients"] = list(dict.fromkeys(missing))[:10]

        custom_recipe_json = json.dumps(payload_recipe)
        
        oi = OrderItem(
            order_batch_id=batch.id,
            dish_id=None,
            quantity=1,
            unit_price=unit_price,
            is_custom=True,
            custom_name=dish_data.get('name'),
            custom_recipe_json=custom_recipe_json,
            kitchen_status="queued",
        )
        db.session.add(oi)
        db.session.flush()  # get oi.id for ingredient mapping

        for r in sanitized:
            ing = r["ingredient"]
            qty = float(r["qty"])
            db.session.add(CustomDishIngredient(
                order_item_id=oi.id,
                ingredient_id=ing.id,
                quantity_required=qty,
            ))
        
        # Update order running total
        order.total_amount = float(order.total_amount or 0) + float(unit_price or 0) * float(oi.quantity or 1)
        
        db.session.commit()
        
        # Reload for response
        created_batch = OrderBatch.query.get(batch.id)
        try:
            if note:
                set_order_note(created_batch.id, note)
        except Exception:
            pass
        try:
            tno = table.table_number if table else None
            nm = dish_data.get("name") or "Custom Dish"
            log_event(
                "custom_submitted",
                f"Table {tno} submitted a custom dish for approval: {nm} · Batch #{created_batch.id}",
                table_number=tno,
                order_id=order.id if order else None,
                batch_id=created_batch.id,
                meta={"dish_summary": summarize_dishes(created_batch.items, max_items=2)},
            )
        except Exception:
            pass
        return jsonify({
            "success": True, 
            "message": "Custom dish sent to manager for approval",
            "batch": _batch_to_json(created_batch)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
