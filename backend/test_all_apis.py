"""
conftest.py – Shared fixtures for Sprint 2 API tests
=====================================================
Place this file alongside the 4 test_*_route.py files, inside your backend/ folder.
"""

import sys
import os
import json
import pytest
from datetime import datetime
from werkzeug.security import generate_password_hash

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from models import (
    db, Manager, RestaurantTable, Ingredient, Dish,
    DishIngredient, Order, OrderBatch, OrderItem, CustomDishIngredient,
)
from config import Config


# ═══════════════════════════════════════════════════════════════════
# APP FACTORY (in-memory SQLite, no seed data, fully isolated)
# ═══════════════════════════════════════════════════════════════════

def _create_test_app():
    from flask import Flask, jsonify
    from flask_cors import CORS

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = Config.SECRET_KEY

    CORS(app)
    db.init_app(app)

    from routes.chef_route import chef_bp
    from routes.waiter_route import waiter_bp
    from routes.customers_route import customer_bp
    from routes.manager_route import manager_bp

    app.register_blueprint(chef_bp, url_prefix="/api/chef")
    app.register_blueprint(waiter_bp, url_prefix="/api/waiter")
    app.register_blueprint(customer_bp, url_prefix="/api/customer")
    app.register_blueprint(manager_bp, url_prefix="/api/manager")

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    with app.app_context():
        db.create_all()

    return app


# ═══════════════════════════════════════════════════════════════════
# SESSION / AUTOUSE FIXTURES
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def app():
    return _create_test_app()


@pytest.fixture(autouse=True)
def _reset_db(app):
    """Drop + recreate all tables before every single test."""
    with app.app_context():
        db.drop_all()
        db.create_all()

    # Clear in-memory stores
    from services.close_request_store import _requests as _cr
    _cr.clear()
    from services.order_note_store import _NOTES_BY_BATCH
    _NOTES_BY_BATCH.clear()
    import services.activity_store as _as
    with _as._lock:
        _as._events.clear()
        _as._next_id = 1
    yield


@pytest.fixture()
def client(app):
    return app.test_client()


# ═══════════════════════════════════════════════════════════════════
# HELPER / SEED FUNCTIONS  (importable by each test module)
# ═══════════════════════════════════════════════════════════════════

def seed_manager(app, name="Admin", email="admin@test.com", password="pass123"):
    with app.app_context():
        m = Manager(
            name=name, email=email,
            password_hash=generate_password_hash(password),
            restaurant_name="Test Kitchen", gst_rate=5.0,
            custom_dish_profit_margin=30.0,
        )
        db.session.add(m)
        db.session.commit()
        return m.id


def login(client, email="admin@test.com", password="pass123"):
    r = client.post("/api/manager/login", json={"email": email, "password": password})
    return r.get_json().get("token")


def auth(token):
    return {"Authorization": token}


def seed_table(app, number=1):
    with app.app_context():
        t = RestaurantTable(table_number=number, is_active=True)
        db.session.add(t)
        db.session.commit()
        return t.id, t.table_token


def seed_ingredient(app, name="Salt", unit="kg", qty=10.0, price=20.0):
    with app.app_context():
        ing = Ingredient(name=name, unit=unit, current_quantity=qty,
                         purchase_price_per_unit=price, is_active=True)
        db.session.add(ing)
        db.session.commit()
        return ing.id


def seed_dish(app, name="Dal Tadka", base_price=30, selling_price=80,
              category="Main Course", ingredient_ids=None, qty_required=0.1):
    with app.app_context():
        d = Dish(name=name, base_price=base_price, selling_price=selling_price,
                 category=category, is_visible=True, is_active=True)
        db.session.add(d)
        db.session.flush()
        for iid in (ingredient_ids or []):
            db.session.add(DishIngredient(dish_id=d.id, ingredient_id=iid,
                                          quantity_required=qty_required))
        db.session.commit()
        return d.id


def seed_full_order(app, table_number=1, dish_name="Test Dish",
                    batch_status="sent", kitchen_status="queued"):
    """
    Seeds: table → ingredient → dish → order → batch → item.
    Returns dict with all IDs.
    """
    tid, ttoken = seed_table(app, table_number)
    iid = seed_ingredient(app, f"Ing_{dish_name}", "kg", 50, 10)
    did = seed_dish(app, dish_name, 20, 60, "Main Course", [iid], 0.05)

    with app.app_context():
        order = Order(table_id=tid, status="open", total_amount=60)
        db.session.add(order)
        db.session.flush()
        batch = OrderBatch(order_id=order.id, status=batch_status)
        db.session.add(batch)
        db.session.flush()
        item = OrderItem(
            order_batch_id=batch.id, dish_id=did, quantity=1,
            unit_price=60, is_custom=False, kitchen_status=kitchen_status,
        )
        db.session.add(item)
        db.session.commit()
        return {
            "table_id": tid, "table_token": ttoken, "table_number": table_number,
            "ingredient_id": iid, "dish_id": did,
            "order_id": order.id, "batch_id": batch.id, "item_id": item.id,
        }


# ═══════════════════════════════════════════════════════════════════════════
# SOURCE: test_manager_route.py
# ═══════════════════════════════════════════════════════════════════════════




# ───────────────────── helpers ─────────────────────

def _mgr_setup(app, client):
    seed_manager(app)
    return login(client)


def _delivered_order(app):
    """Seed an order where every item is already delivered."""
    ids = seed_full_order(app, batch_status="delivered", kitchen_status="delivered")
    with app.app_context():
        it = OrderItem.query.get(ids["item_id"])
        it.delivered_at = datetime.now()
        db.session.commit()
    return ids


# ═══════════════════════════════════════════════════════
#  AUTH  –  POST /api/manager/login
# ═══════════════════════════════════════════════════════

class TestManagerLogin:

    def test_login_valid_credentials(self, app, client):
        """Login with correct email & password → 200 + token."""
        seed_manager(app)
        r = client.post("/api/manager/login",
                        json={"email": "admin@test.com", "password": "pass123"})
        assert r.status_code == 200
        d = r.get_json()
        assert d["success"] is True
        assert "token" in d

    def test_login_wrong_password(self, app, client):
        """Wrong password → 401."""
        seed_manager(app)
        r = client.post("/api/manager/login",
                        json={"email": "admin@test.com", "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_email(self, app, client):
        """Non-existent email → 401."""
        seed_manager(app)
        r = client.post("/api/manager/login",
                        json={"email": "ghost@test.com", "password": "pass123"})
        assert r.status_code == 401

    def test_login_empty_body(self, app, client):
        """Empty JSON body → 401 (or 400)."""
        seed_manager(app)
        r = client.post("/api/manager/login", json={})
        assert r.status_code in [400, 401]

    def test_login_missing_password(self, app, client):
        """Only email, no password → 401."""
        seed_manager(app)
        r = client.post("/api/manager/login",
                        json={"email": "admin@test.com"})
        assert r.status_code in [400, 401]

    def test_access_protected_without_token(self, client):
        """Any protected route without Authorization header → 401."""
        r = client.get("/api/manager/tables")
        assert r.status_code == 401

    def test_access_protected_with_invalid_token(self, client):
        """Invalid token string → 401."""
        r = client.get("/api/manager/tables",
                       headers={"Authorization": "invalid_garbage"})
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
#  SETTINGS  –  GET / PUT /api/manager/settings
# ═══════════════════════════════════════════════════════

class TestManagerSettings:

    def test_get_settings(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/settings", headers=auth(tok))
        assert r.status_code == 200
        s = r.get_json()["settings"]
        assert s["restaurant_name"] == "Test Kitchen"
        assert s["gst_rate"] == 5.0

    def test_get_settings_unauthorized(self, client):
        r = client.get("/api/manager/settings")
        assert r.status_code == 401

    def test_update_restaurant_name(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/settings", headers=auth(tok),
                       json={"restaurant_name": "Spice Garden"})
        assert r.status_code == 200
        r2 = client.get("/api/manager/settings", headers=auth(tok))
        assert r2.get_json()["settings"]["restaurant_name"] == "Spice Garden"

    def test_update_gst_rate(self, app, client):
        tok = _mgr_setup(app, client)
        client.put("/api/manager/settings", headers=auth(tok), json={"gst_rate": 18})
        r = client.get("/api/manager/settings", headers=auth(tok))
        assert r.get_json()["settings"]["gst_rate"] == 18

    def test_update_profit_margin(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/settings", headers=auth(tok),
                       json={"custom_dish_profit_margin": 50})
        assert r.status_code == 200

    def test_margin_clamped_negative(self, app, client):
        tok = _mgr_setup(app, client)
        client.put("/api/manager/settings", headers=auth(tok),
                   json={"custom_dish_profit_margin": -10})
        r = client.get("/api/manager/settings", headers=auth(tok))
        assert r.get_json()["settings"]["custom_dish_profit_margin"] >= 0

    def test_margin_clamped_high(self, app, client):
        tok = _mgr_setup(app, client)
        client.put("/api/manager/settings", headers=auth(tok),
                   json={"custom_dish_profit_margin": 999})
        r = client.get("/api/manager/settings", headers=auth(tok))
        assert r.get_json()["settings"]["custom_dish_profit_margin"] <= 500

    def test_update_bill_toggles(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/settings", headers=auth(tok),
                       json={"show_restaurant_name": False, "show_gstin": False})
        assert r.status_code == 200

    def test_update_bill_terms(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/settings", headers=auth(tok),
                       json={"bill_terms": "Thank you for visiting!"})
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  TABLES  –  CRUD
# ═══════════════════════════════════════════════════════

class TestManagerTables:

    def test_list_tables_empty(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/tables", headers=auth(tok))
        assert r.status_code == 200
        assert r.get_json()["tables"] == []

    def test_ensure_tables_creates(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/tables/ensure", headers=auth(tok),
                        json={"count": 5})
        assert r.status_code == 200
        assert len(r.get_json()["tables"]) == 5

    def test_ensure_tables_idempotent(self, app, client):
        tok = _mgr_setup(app, client)
        client.post("/api/manager/tables/ensure", headers=auth(tok), json={"count": 3})
        r = client.post("/api/manager/tables/ensure", headers=auth(tok), json={"count": 5})
        assert r.status_code == 200
        assert len(r.get_json()["tables"]) == 5

    def test_ensure_tables_zero(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/tables/ensure", headers=auth(tok), json={"count": 0})
        assert r.status_code == 400

    def test_ensure_tables_exceeds_max(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/tables/ensure", headers=auth(tok), json={"count": 100})
        assert r.status_code == 400

    def test_ensure_tables_missing_count(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/tables/ensure", headers=auth(tok), json={})
        assert r.status_code == 400

    def test_clear_tables(self, app, client):
        tok = _mgr_setup(app, client)
        client.post("/api/manager/tables/ensure", headers=auth(tok), json={"count": 3})
        r = client.post("/api/manager/tables/clear", headers=auth(tok))
        assert r.status_code == 200
        r2 = client.get("/api/manager/tables", headers=auth(tok))
        assert len(r2.get_json()["tables"]) == 0

    def test_ensure_tables_unauthorized(self, client):
        r = client.post("/api/manager/tables/ensure", json={"count": 3})
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
#  INGREDIENTS  –  CRUD
# ═══════════════════════════════════════════════════════

class TestManagerIngredients:

    def test_add_ingredient(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/ingredients", headers=auth(tok),
                        json={"name": "Tomato", "unit": "kg", "current_quantity": 10,
                              "purchase_price_per_unit": 40})
        assert r.status_code == 201
        assert r.get_json()["ingredient"]["name"] == "Tomato"

    def test_add_ingredient_duplicate(self, app, client):
        tok = _mgr_setup(app, client)
        p = {"name": "Onion", "unit": "kg", "current_quantity": 5, "purchase_price_per_unit": 30}
        client.post("/api/manager/ingredients", headers=auth(tok), json=p)
        r = client.post("/api/manager/ingredients", headers=auth(tok), json=p)
        assert r.status_code == 400
        assert "already exists" in r.get_json()["error"]

    def test_add_ingredient_missing_name(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/ingredients", headers=auth(tok), json={"unit": "kg"})
        assert r.status_code == 400

    def test_add_ingredient_empty_name(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/ingredients", headers=auth(tok),
                        json={"name": "", "unit": "kg"})
        assert r.status_code == 400

    def test_edit_ingredient(self, app, client):
        tok = _mgr_setup(app, client)
        iid = seed_ingredient(app, "Cumin", "kg", 3, 200)
        r = client.put(f"/api/manager/ingredients/{iid}", headers=auth(tok),
                       json={"current_quantity": 20})
        assert r.status_code == 200
        assert r.get_json()["ingredient"]["current_quantity"] == 20

    def test_edit_ingredient_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/ingredients/999999", headers=auth(tok),
                       json={"current_quantity": 50})
        assert r.status_code == 404

    def test_delete_ingredient_soft(self, app, client):
        tok = _mgr_setup(app, client)
        iid = seed_ingredient(app, "Garlic", "kg", 2, 100)
        r = client.delete(f"/api/manager/ingredients/{iid}", headers=auth(tok))
        assert r.status_code == 200
        r2 = client.get("/api/manager/inventory", headers=auth(tok))
        ids = [i["id"] for i in r2.get_json()["ingredients"]]
        assert iid not in ids

    def test_delete_ingredient_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.delete("/api/manager/ingredients/999999", headers=auth(tok))
        assert r.status_code in [400, 404]

    def test_get_inventory(self, app, client):
        tok = _mgr_setup(app, client)
        seed_ingredient(app, "Rice", "kg", 25, 60)
        r = client.get("/api/manager/inventory", headers=auth(tok))
        assert r.status_code == 200
        assert len(r.get_json()["ingredients"]) >= 1

    def test_get_inventory_unauthorized(self, client):
        r = client.get("/api/manager/inventory")
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
#  DISHES  –  CRUD
# ═══════════════════════════════════════════════════════

class TestManagerDishes:

    def test_create_dish(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/dishes", headers=auth(tok),
                        json={"name": "Paneer Tikka", "base_price": 50,
                              "selling_price": 150, "category": "Starters"})
        assert r.status_code == 201
        assert r.get_json()["dish"]["name"] == "Paneer Tikka"

    def test_create_dish_duplicate(self, app, client):
        tok = _mgr_setup(app, client)
        p = {"name": "Naan", "base_price": 10}
        client.post("/api/manager/dishes", headers=auth(tok), json=p)
        r = client.post("/api/manager/dishes", headers=auth(tok), json=p)
        assert r.status_code == 400

    def test_create_dish_no_name(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/dishes", headers=auth(tok), json={"base_price": 50})
        assert r.status_code == 400

    def test_create_dish_empty_body(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/dishes", headers=auth(tok), json={})
        assert r.status_code == 400

    def test_list_dishes(self, app, client):
        tok = _mgr_setup(app, client)
        seed_dish(app, "Roti")
        r = client.get("/api/manager/dishes", headers=auth(tok))
        assert r.status_code == 200
        assert isinstance(r.get_json()["dishes"], list)

    def test_edit_dish(self, app, client):
        tok = _mgr_setup(app, client)
        did = seed_dish(app, "Dosa")
        r = client.put(f"/api/manager/dishes/{did}", headers=auth(tok),
                       json={"base_price": 300})
        assert r.status_code == 200

    def test_edit_dish_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.put("/api/manager/dishes/999999", headers=auth(tok),
                       json={"base_price": 300})
        assert r.status_code == 404

    def test_delete_dish_soft(self, app, client):
        tok = _mgr_setup(app, client)
        did = seed_dish(app, "Idli")
        r = client.delete(f"/api/manager/dishes/{did}", headers=auth(tok))
        assert r.status_code == 200
        r2 = client.get("/api/manager/dishes", headers=auth(tok))
        ids = [d["id"] for d in r2.get_json()["dishes"]]
        assert did not in ids

    def test_delete_dish_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.delete("/api/manager/dishes/999999", headers=auth(tok))
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
#  DISH INGREDIENTS (Recipe)
# ═══════════════════════════════════════════════════════

class TestManagerDishIngredients:

    def _setup(self, app, client):
        tok = _mgr_setup(app, client)
        iid = seed_ingredient(app, "Cumin", "kg", 5, 200)
        did = seed_dish(app, "Jeera Rice")
        return tok, did, iid

    def test_add_dish_ingredient(self, app, client):
        tok, did, iid = self._setup(app, client)
        r = client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok),
                        json={"ingredient_id": iid, "quantity_required": 0.01})
        assert r.status_code == 201

    def test_add_dish_ingredient_duplicate(self, app, client):
        tok, did, iid = self._setup(app, client)
        p = {"ingredient_id": iid, "quantity_required": 0.01}
        client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok), json=p)
        r = client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok), json=p)
        assert r.status_code == 400

    def test_get_dish_ingredients(self, app, client):
        tok, did, iid = self._setup(app, client)
        client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok),
                    json={"ingredient_id": iid, "quantity_required": 0.01})
        r = client.get(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok))
        assert r.status_code == 200
        assert len(r.get_json()["ingredients"]) == 1

    def test_get_dish_ingredients_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/dishes/999999/ingredients", headers=auth(tok))
        assert r.status_code == 404

    def test_edit_dish_ingredient(self, app, client):
        tok, did, iid = self._setup(app, client)
        client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok),
                    json={"ingredient_id": iid, "quantity_required": 0.01})
        r = client.put(f"/api/manager/dishes/{did}/ingredients/{iid}", headers=auth(tok),
                       json={"quantity_required": 0.05})
        assert r.status_code == 200

    def test_remove_dish_ingredient(self, app, client):
        tok, did, iid = self._setup(app, client)
        client.post(f"/api/manager/dishes/{did}/ingredients", headers=auth(tok),
                    json={"ingredient_id": iid, "quantity_required": 0.01})
        r = client.delete(f"/api/manager/dishes/{did}/ingredients/{iid}", headers=auth(tok))
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  ORDER APPROVE / REJECT
# ═══════════════════════════════════════════════════════

class TestManagerOrders:

    def test_dashboard_pending_orders(self, app, client):
        tok = _mgr_setup(app, client)
        seed_full_order(app, batch_status="sent")
        r = client.get("/api/manager/dashboard/orders", headers=auth(tok))
        assert r.status_code == 200
        assert len(r.get_json()["pending_orders"]) == 1

    def test_approve_order(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        r = client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        assert r.status_code == 200
        assert r.get_json()["success"] is True

    def test_approve_deducts_stock(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        with app.app_context():
            before = Ingredient.query.get(ids["ingredient_id"]).current_quantity
        client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        with app.app_context():
            after = Ingredient.query.get(ids["ingredient_id"]).current_quantity
        assert after < before

    def test_approve_already_approved(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        r = client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        assert r.status_code == 400

    def test_approve_low_stock(self, app, client):
        tok = _mgr_setup(app, client)
        seed_table(app, 1)
        iid = seed_ingredient(app, "Truffle", "g", 0, 5000)
        did = seed_dish(app, "Truffle Pasta", 500, 1500, "Special", [iid], 10)
        with app.app_context():
            t = RestaurantTable.query.filter_by(table_number=1).first()
            o = Order(table_id=t.id, status="open", total_amount=1500)
            db.session.add(o); db.session.flush()
            b = OrderBatch(order_id=o.id, status="sent")
            db.session.add(b); db.session.flush()
            db.session.add(OrderItem(order_batch_id=b.id, dish_id=did,
                                     quantity=1, unit_price=1500, kitchen_status="queued"))
            db.session.commit()
            bid = b.id
        r = client.patch(f"/api/manager/orders/{bid}/approve", headers=auth(tok))
        assert r.status_code == 400
        assert "stock" in r.get_json()["error"].lower()

    def test_approve_nonexistent(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.patch("/api/manager/orders/999999/approve", headers=auth(tok))
        assert r.status_code in [400, 404]

    def test_reject_order(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        r = client.patch(f"/api/manager/orders/{ids['batch_id']}/reject", headers=auth(tok))
        assert r.status_code == 200
        assert r.get_json()["success"] is True

    def test_reject_nonexistent(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.patch("/api/manager/orders/999999/reject", headers=auth(tok))
        assert r.status_code in [400, 404]

    def test_invalid_action(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        r = client.patch(f"/api/manager/orders/{ids['batch_id']}/cancel", headers=auth(tok))
        assert r.status_code == 400

    def test_list_live_orders(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        r = client.get("/api/manager/orders/live", headers=auth(tok))
        assert r.status_code == 200
        assert "live_batches" in r.get_json()


# ═══════════════════════════════════════════════════════
#  CLOSE TABLE
# ═══════════════════════════════════════════════════════

class TestManagerCloseTable:

    def test_close_table_success(self, app, client):
        tok = _mgr_setup(app, client)
        ids = _delivered_order(app)
        r = client.post(f"/api/manager/tables/{ids['table_number']}/close",
                        headers=auth(tok), json={"payment_method": "UPI"})
        assert r.status_code == 200

    def test_close_table_pending_blocked(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.post(f"/api/manager/tables/{ids['table_number']}/close",
                        headers=auth(tok), json={})
        assert r.status_code == 400
        assert "not delivered" in r.get_json()["error"].lower()

    def test_close_table_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.post("/api/manager/tables/99/close", headers=auth(tok), json={})
        assert r.status_code == 404

    def test_close_table_no_open_order(self, app, client):
        tok = _mgr_setup(app, client)
        seed_table(app, 1)
        r = client.post("/api/manager/tables/1/close", headers=auth(tok), json={})
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  CLOSED ORDERS & BILLS
# ═══════════════════════════════════════════════════════

class TestManagerClosedOrders:

    def _close(self, app):
        ids = _delivered_order(app)
        with app.app_context():
            o = Order.query.get(ids["order_id"])
            o.status = "closed"; o.closed_at = datetime.now()
            db.session.commit()
        return ids

    def test_list_closed_orders(self, app, client):
        tok = _mgr_setup(app, client)
        self._close(app)
        r = client.get("/api/manager/orders/closed", headers=auth(tok))
        assert r.status_code == 200
        assert len(r.get_json()["orders"]) == 1

    def test_get_order_bill(self, app, client):
        tok = _mgr_setup(app, client)
        ids = self._close(app)
        r = client.get(f"/api/manager/orders/{ids['order_id']}/bill", headers=auth(tok))
        assert r.status_code == 200
        b = r.get_json()["bill"]
        assert "restaurant" in b
        assert "total" in b

    def test_get_order_bill_not_found(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/orders/9999/bill", headers=auth(tok))
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
#  ANALYTICS
# ═══════════════════════════════════════════════════════

class TestManagerAnalytics:

    def test_analytics_empty(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/analytics", headers=auth(tok))
        assert r.status_code == 200
        assert r.get_json()["summary"]["orders_closed"] == 0

    def test_analytics_with_range(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/analytics?from=2026-01-01&to=2026-12-31",
                       headers=auth(tok))
        assert r.status_code == 200

    def test_analytics_unauthorized(self, client):
        r = client.get("/api/manager/analytics")
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
#  ACTIVITY FEED
# ═══════════════════════════════════════════════════════

class TestManagerActivity:

    def test_activity_empty(self, app, client):
        tok = _mgr_setup(app, client)
        r = client.get("/api/manager/activity", headers=auth(tok))
        assert r.status_code == 200
        assert r.get_json()["events"] == []

    def test_activity_after_approve(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        r = client.get("/api/manager/activity", headers=auth(tok))
        events = r.get_json()["events"]
        assert any(e["kind"] == "order_accepted" for e in events)

    def test_activity_since_id(self, app, client):
        tok = _mgr_setup(app, client)
        ids = seed_full_order(app, batch_status="sent")
        client.patch(f"/api/manager/orders/{ids['batch_id']}/approve", headers=auth(tok))
        r = client.get("/api/manager/activity?since_id=9999", headers=auth(tok))
        assert len(r.get_json()["events"]) == 0


# ═══════════════════════════════════════════════════════
#  MENU
# ═══════════════════════════════════════════════════════

class TestManagerMenu:

    def test_get_menu(self, app, client):
        tok = _mgr_setup(app, client)
        iid = seed_ingredient(app, "Oil", "l", 10, 120)
        seed_dish(app, "Fries", 15, 50, "Snacks", [iid], 0.02)
        r = client.get("/api/manager/menu", headers=auth(tok))
        assert r.status_code == 200
        assert len(r.get_json()["menu"]) >= 1

    def test_menu_excludes_out_of_stock(self, app, client):
        tok = _mgr_setup(app, client)
        iid = seed_ingredient(app, "Rare", "kg", 0, 500)
        seed_dish(app, "Rare Dish", 100, 300, "Special", [iid], 1.0)
        r = client.get("/api/manager/menu", headers=auth(tok))
        names = [d["name"] for d in r.get_json()["menu"]]
        assert "Rare Dish" not in names


# ═══════════════════════════════════════════════════════
#  IMAGE UPLOAD  /  PUBLIC ORIGIN
# ═══════════════════════════════════════════════════════

class TestManagerMisc:

    def test_upload_image_unauthorized(self, client):
        r = client.post("/api/manager/uploads/image")
        assert r.status_code == 401

    def test_public_origin_unauthorized(self, client):
        r = client.get("/api/manager/public-origin")
        assert r.status_code == 401



# ═══════════════════════════════════════════════════════════════════════════
# SOURCE: test_chef_route.py
# ═══════════════════════════════════════════════════════════════════════════




# ═══════════════════════════════════════════════════════
#  CHEF QUEUE  –  GET /api/chef/queue
# ═══════════════════════════════════════════════════════

class TestChefQueue:

    def test_queue_empty(self, client):
        """No items in any accepted batch → empty queue."""
        r = client.get("/api/chef/queue")
        assert r.status_code == 200
        assert r.get_json()["count"] == 0
        assert r.get_json()["queue"] == []

    def test_queue_shows_accepted_queued_items(self, app, client):
        """Items in accepted batches with kitchen_status=queued appear."""
        seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.get("/api/chef/queue")
        assert r.status_code == 200
        assert r.get_json()["count"] == 1
        row = r.get_json()["queue"][0]
        assert row["kitchen_status"] == "queued"
        assert row["batch_status"] == "accepted"

    def test_queue_excludes_done_items(self, app, client):
        """Items already marked done should NOT appear in queue."""
        seed_full_order(app, batch_status="accepted", kitchen_status="done")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 0

    def test_queue_excludes_delivered_items(self, app, client):
        """Delivered items should NOT appear in queue."""
        seed_full_order(app, batch_status="ready", kitchen_status="delivered")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 0

    def test_queue_excludes_sent_batches(self, app, client):
        """Items in 'sent' (pending approval) batches do NOT appear."""
        seed_full_order(app, batch_status="sent", kitchen_status="queued")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 0

    def test_queue_shows_ready_batch_queued_items(self, app, client):
        """Ready-batch items that are still queued appear (multi-item batch)."""
        seed_full_order(app, batch_status="ready", kitchen_status="queued")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 1

    def test_queue_multiple_items_sorted(self, app, client):
        """Multiple items from different tables appear sorted."""
        seed_full_order(app, table_number=1, dish_name="DishA",
                        batch_status="accepted", kitchen_status="queued")
        seed_full_order(app, table_number=2, dish_name="DishB",
                        batch_status="accepted", kitchen_status="queued")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 2

    def test_queue_row_has_expected_fields(self, app, client):
        """Each queue row should contain required fields."""
        seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.get("/api/chef/queue")
        row = r.get_json()["queue"][0]
        for key in ("item_id", "batch_id", "batch_status", "table_number",
                     "qty", "dish_id", "name", "kitchen_status"):
            assert key in row


# ═══════════════════════════════════════════════════════
#  CHEF ITEM DONE  –  POST /api/chef/items/<id>/done
# ═══════════════════════════════════════════════════════

class TestChefItemDone:

    def test_mark_item_done(self, app, client):
        """Mark single item done → item becomes done, batch becomes ready."""
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.post(f"/api/chef/items/{ids['item_id']}/done")
        assert r.status_code == 200
        assert r.get_json()["success"] is True
        assert r.get_json()["batch_status"] == "ready"

    def test_mark_item_done_not_found(self, client):
        """Non-existent item → 404."""
        r = client.post("/api/chef/items/9999/done")
        assert r.status_code == 404

    def test_batch_stays_accepted_if_items_remain(self, app, client):
        """Two items: marking one done should NOT flip batch to ready."""
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        with app.app_context():
            item2 = OrderItem(
                order_batch_id=ids["batch_id"], dish_id=ids["dish_id"],
                quantity=1, unit_price=60, kitchen_status="queued",
            )
            db.session.add(item2)
            db.session.commit()
        r = client.post(f"/api/chef/items/{ids['item_id']}/done")
        assert r.get_json()["batch_status"] == "accepted"

    def test_mark_second_item_flips_batch_ready(self, app, client):
        """All items done → batch flips to ready."""
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        with app.app_context():
            item2 = OrderItem(
                order_batch_id=ids["batch_id"], dish_id=ids["dish_id"],
                quantity=1, unit_price=60, kitchen_status="queued",
            )
            db.session.add(item2)
            db.session.commit()
            item2_id = item2.id
        # Mark both
        client.post(f"/api/chef/items/{ids['item_id']}/done")
        r = client.post(f"/api/chef/items/{item2_id}/done")
        assert r.get_json()["batch_status"] == "ready"

    def test_item_done_removes_from_queue(self, app, client):
        """After marking done, item no longer appears in queue."""
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        client.post(f"/api/chef/items/{ids['item_id']}/done")
        r = client.get("/api/chef/queue")
        assert r.get_json()["count"] == 0

    def test_mark_done_idempotent(self, app, client):
        """Marking an already-done item done again should not error."""
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        client.post(f"/api/chef/items/{ids['item_id']}/done")
        r = client.post(f"/api/chef/items/{ids['item_id']}/done")
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  CHEF RECIPE  –  GET /api/chef/items/<id>/recipe
# ═══════════════════════════════════════════════════════

class TestChefRecipe:

    def test_recipe_standard_dish(self, app, client):
        """Standard dish shows ingredients list."""
        ids = seed_full_order(app)
        r = client.get(f"/api/chef/items/{ids['item_id']}/recipe")
        assert r.status_code == 200
        d = r.get_json()
        assert d["is_custom"] is False
        assert "ingredients" in d

    def test_recipe_not_found(self, client):
        r = client.get("/api/chef/items/9999/recipe")
        assert r.status_code == 404

    def test_recipe_custom_dish_with_json(self, app, client):
        """Custom item with embedded recipe JSON returns it."""
        seed_table(app, 1)
        with app.app_context():
            t = RestaurantTable.query.filter_by(table_number=1).first()
            o = Order(table_id=t.id, status="open", total_amount=100)
            db.session.add(o); db.session.flush()
            b = OrderBatch(order_id=o.id, status="accepted")
            db.session.add(b); db.session.flush()
            recipe = json.dumps({"steps": ["Boil", "Mix", "Serve"], "notes": "Spicy"})
            item = OrderItem(
                order_batch_id=b.id, dish_id=None, quantity=1, unit_price=120,
                is_custom=True, custom_name="AI Curry",
                custom_recipe_json=recipe, kitchen_status="queued",
            )
            db.session.add(item)
            db.session.commit()
            item_id = item.id
        r = client.get(f"/api/chef/items/{item_id}/recipe")
        assert r.status_code == 200
        d = r.get_json()
        assert d["is_custom"] is True
        assert d["recipe"]["steps"] == ["Boil", "Mix", "Serve"]

    def test_recipe_custom_dish_no_json(self, app, client):
        """Custom item without recipe JSON returns recipe=None."""
        seed_table(app, 1)
        with app.app_context():
            t = RestaurantTable.query.filter_by(table_number=1).first()
            o = Order(table_id=t.id, status="open", total_amount=50)
            db.session.add(o); db.session.flush()
            b = OrderBatch(order_id=o.id, status="accepted")
            db.session.add(b); db.session.flush()
            item = OrderItem(
                order_batch_id=b.id, dish_id=None, quantity=1, unit_price=50,
                is_custom=True, custom_name="Mystery Dish",
                custom_recipe_json=None, kitchen_status="queued",
            )
            db.session.add(item)
            db.session.commit()
            item_id = item.id
        r = client.get(f"/api/chef/items/{item_id}/recipe")
        assert r.status_code == 200
        assert r.get_json()["recipe"] is None

    def test_recipe_standard_has_name(self, app, client):
        """Standard dish recipe response includes dish name."""
        ids = seed_full_order(app)
        r = client.get(f"/api/chef/items/{ids['item_id']}/recipe")
        assert r.get_json()["name"] == "Test Dish"



# ═══════════════════════════════════════════════════════════════════════════
# SOURCE: test_waiter_route.py
# ═══════════════════════════════════════════════════════════════════════════




# ═══════════════════════════════════════════════════════
#  TABLE STATUS  –  GET /api/waiter/tables/status
# ═══════════════════════════════════════════════════════

class TestWaiterTableStatus:

    def test_tables_empty(self, client):
        r = client.get("/api/waiter/tables/status")
        assert r.status_code == 200
        assert r.get_json()["tables"] == []

    def test_table_free(self, app, client):
        """Table with no open order → free."""
        seed_table(app, 1)
        r = client.get("/api/waiter/tables/status")
        t = r.get_json()["tables"][0]
        assert t["status"] == "free"
        assert t["table_number"] == 1

    def test_table_occupied(self, app, client):
        """Table with a delivered batch (order still open) → occupied."""
        seed_full_order(app, batch_status="delivered", kitchen_status="delivered")
        r = client.get("/api/waiter/tables/status")
        assert r.get_json()["tables"][0]["status"] == "occupied"

    def test_table_ready(self, app, client):
        """Table with a ready batch → ready."""
        seed_full_order(app, batch_status="ready", kitchen_status="done")
        r = client.get("/api/waiter/tables/status")
        assert r.get_json()["tables"][0]["status"] == "ready"

    def test_table_waiting(self, app, client):
        """Table with sent/accepted batch → waiting."""
        seed_full_order(app, batch_status="sent", kitchen_status="queued")
        r = client.get("/api/waiter/tables/status")
        assert r.get_json()["tables"][0]["status"] == "waiting"

    def test_multiple_tables(self, app, client):
        """Two tables return sorted by table_number."""
        seed_table(app, 2)
        seed_table(app, 1)
        r = client.get("/api/waiter/tables/status")
        nums = [t["table_number"] for t in r.get_json()["tables"]]
        assert nums == sorted(nums)

    def test_table_shows_spend(self, app, client):
        """Table with open order shows non-zero spend."""
        seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.get("/api/waiter/tables/status")
        assert r.get_json()["tables"][0]["spend"] > 0


# ═══════════════════════════════════════════════════════
#  READY ITEMS  –  GET /api/waiter/orders/ready-items
# ═══════════════════════════════════════════════════════

class TestWaiterReadyItems:

    def test_ready_items_empty(self, client):
        r = client.get("/api/waiter/orders/ready-items")
        assert r.status_code == 200
        assert r.get_json()["count"] == 0

    def test_ready_items_appear(self, app, client):
        """Item in ready batch with kitchen_status=done → appears."""
        seed_full_order(app, batch_status="ready", kitchen_status="done")
        r = client.get("/api/waiter/orders/ready-items")
        assert r.get_json()["count"] == 1
        row = r.get_json()["ready_items"][0]
        assert "dish" in row
        assert "table_number" in row

    def test_ready_items_excludes_queued(self, app, client):
        """Queued items in a ready batch are NOT ready for delivery."""
        seed_full_order(app, batch_status="ready", kitchen_status="queued")
        r = client.get("/api/waiter/orders/ready-items")
        assert r.get_json()["count"] == 0

    def test_ready_items_excludes_delivered(self, app, client):
        """Already-delivered items don't appear."""
        seed_full_order(app, batch_status="ready", kitchen_status="delivered")
        r = client.get("/api/waiter/orders/ready-items")
        assert r.get_json()["count"] == 0


# ═══════════════════════════════════════════════════════
#  DELIVER ITEM  –  POST /api/waiter/items/<id>/deliver
# ═══════════════════════════════════════════════════════

class TestWaiterDeliver:

    def test_deliver_item(self, app, client):
        """Deliver single-item batch → batch becomes delivered."""
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        r = client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        assert r.status_code == 200
        assert r.get_json()["success"] is True
        assert r.get_json()["batch_status"] == "delivered"

    def test_deliver_not_found(self, client):
        r = client.post("/api/waiter/items/9999/deliver")
        assert r.status_code == 404

    def test_deliver_sets_delivered_at(self, app, client):
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        with app.app_context():
            it = OrderItem.query.get(ids["item_id"])
            assert it.delivered_at is not None
            assert it.kitchen_status == "delivered"

    def test_deliver_partial_batch(self, app, client):
        """Two items: deliver one → batch stays ready."""
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        with app.app_context():
            item2 = OrderItem(
                order_batch_id=ids["batch_id"], dish_id=ids["dish_id"],
                quantity=1, unit_price=60, kitchen_status="done",
            )
            db.session.add(item2)
            db.session.commit()
        r = client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        assert r.get_json()["batch_status"] == "ready"

    def test_deliver_all_items_flips_batch(self, app, client):
        """Deliver both items → batch becomes delivered."""
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        with app.app_context():
            item2 = OrderItem(
                order_batch_id=ids["batch_id"], dish_id=ids["dish_id"],
                quantity=1, unit_price=60, kitchen_status="done",
            )
            db.session.add(item2)
            db.session.commit()
            item2_id = item2.id
        client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        r = client.post(f"/api/waiter/items/{item2_id}/deliver")
        assert r.get_json()["batch_status"] == "delivered"

    def test_deliver_idempotent(self, app, client):
        """Delivering already-delivered item doesn't crash."""
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        r = client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════
#  SERVED TODAY  –  GET /api/waiter/orders/served-today
# ═══════════════════════════════════════════════════════

class TestWaiterServedToday:

    def test_served_today_empty(self, client):
        r = client.get("/api/waiter/orders/served-today")
        assert r.status_code == 200
        assert r.get_json()["count"] == 0

    def test_served_today_after_delivery(self, app, client):
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        r = client.get("/api/waiter/orders/served-today")
        assert r.get_json()["count"] >= 1

    def test_served_today_limit(self, client):
        r = client.get("/api/waiter/orders/served-today?limit=1")
        assert r.status_code == 200

    def test_served_today_limit_zero_clamped(self, client):
        """limit=0 should be clamped to at least 1."""
        r = client.get("/api/waiter/orders/served-today?limit=0")
        assert r.status_code == 200

    def test_served_today_response_shape(self, app, client):
        ids = seed_full_order(app, batch_status="ready", kitchen_status="done")
        client.post(f"/api/waiter/items/{ids['item_id']}/deliver")
        r = client.get("/api/waiter/orders/served-today")
        d = r.get_json()
        assert "served" in d
        assert "count" in d
        assert "items_qty" in d
        assert "batch_count" in d
        assert "order_count" in d


# ═══════════════════════════════════════════════════════
#  BILL  –  GET /api/waiter/bill/<table_number>
# ═══════════════════════════════════════════════════════

class TestWaiterBill:

    def test_bill_no_order(self, app, client):
        seed_table(app, 1)
        seed_manager(app)
        r = client.get("/api/waiter/bill/1")
        assert r.status_code == 200
        assert r.get_json()["order"] is None

    def test_bill_with_order(self, app, client):
        seed_manager(app)
        ids = seed_full_order(app)
        r = client.get(f"/api/waiter/bill/{ids['table_number']}")
        assert r.status_code == 200
        d = r.get_json()
        assert d["subtotal"] >= 0
        assert "gst" in d
        assert "total" in d
        assert "restaurant" in d
        assert "items" in d

    def test_bill_table_not_found(self, client):
        r = client.get("/api/waiter/bill/99")
        assert r.status_code == 404

    def test_bill_aggregates_items(self, app, client):
        """Items in same order are aggregated in the bill."""
        seed_manager(app)
        ids = seed_full_order(app, table_number=3, dish_name="Paratha",
                              batch_status="accepted", kitchen_status="queued")
        r = client.get(f"/api/waiter/bill/{ids['table_number']}")
        assert r.status_code == 200
        assert len(r.get_json()["items"]) >= 1


# ═══════════════════════════════════════════════════════
#  CLOSE TABLE  –  POST /api/waiter/tables/<num>/close
# ═══════════════════════════════════════════════════════

class TestWaiterCloseTable:

    def _delivered(self, app):
        ids = seed_full_order(app, batch_status="delivered", kitchen_status="delivered")
        with app.app_context():
            it = OrderItem.query.get(ids["item_id"])
            it.delivered_at = datetime.now()
            db.session.commit()
        return ids

    def test_close_table_success(self, app, client):
        ids = self._delivered(app)
        r = client.post(f"/api/waiter/tables/{ids['table_number']}/close",
                        json={"payment_method": "Cash"})
        assert r.status_code == 200
        assert r.get_json()["success"] is True

    def test_close_table_blocked_undelivered(self, app, client):
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.post(f"/api/waiter/tables/{ids['table_number']}/close", json={})
        assert r.status_code == 400
        assert "not delivered" in r.get_json()["error"].lower()

    def test_close_table_not_found(self, client):
        r = client.post("/api/waiter/tables/99/close", json={})
        assert r.status_code == 404

    def test_close_table_no_open_order(self, app, client):
        """Table exists but has no open order → success (nothing to close)."""
        seed_table(app, 1)
        r = client.post("/api/waiter/tables/1/close", json={})
        assert r.status_code == 200

    def test_close_defaults_to_cash(self, app, client):
        """No payment_method → defaults to Cash without error."""
        ids = self._delivered(app)
        r = client.post(f"/api/waiter/tables/{ids['table_number']}/close", json={})
        assert r.status_code == 200

    def test_close_via_header_payment_method(self, app, client):
        """Payment method from X-Payment-Method header."""
        ids = self._delivered(app)
        r = client.post(f"/api/waiter/tables/{ids['table_number']}/close",
                        json={}, headers={"X-Payment-Method": "Card"})
        assert r.status_code == 200

    def test_close_marks_order_closed(self, app, client):
        """After close, order.status should be 'closed'."""
        ids = self._delivered(app)
        client.post(f"/api/waiter/tables/{ids['table_number']}/close", json={})
        with app.app_context():
            o = Order.query.get(ids["order_id"])
            assert o.status == "closed"
            assert o.closed_at is not None



# ═══════════════════════════════════════════════════════════════════════════
# SOURCE: test_customer_route.py
# ═══════════════════════════════════════════════════════════════════════════




# ═══════════════════════════════════════════════════════
#  TABLES  –  GET /api/customer/tables
# ═══════════════════════════════════════════════════════

class TestCustomerTables:

    def test_tables_empty(self, client):
        r = client.get("/api/customer/tables")
        assert r.status_code == 200
        assert r.get_json()["tables"] == []

    def test_tables_list(self, app, client):
        seed_table(app, 1)
        seed_table(app, 2)
        r = client.get("/api/customer/tables")
        assert r.status_code == 200
        assert len(r.get_json()["tables"]) == 2

    def test_tables_have_tokens(self, app, client):
        seed_table(app, 1)
        r = client.get("/api/customer/tables")
        t = r.get_json()["tables"][0]
        assert "table_token" in t
        assert len(t["table_token"]) > 0


# ═══════════════════════════════════════════════════════
#  MENU  –  GET /api/customer/menu
# ═══════════════════════════════════════════════════════

class TestCustomerMenu:

    def test_menu_empty(self, client):
        r = client.get("/api/customer/menu")
        assert r.status_code == 200
        assert r.get_json()["menu"] == []

    def test_menu_shows_available_dish(self, app, client):
        iid = seed_ingredient(app, "Flour", "kg", 50, 30)
        seed_dish(app, "Chapati", 5, 15, "Bread", [iid], 0.05)
        r = client.get("/api/customer/menu")
        assert len(r.get_json()["menu"]) == 1
        assert r.get_json()["menu"][0]["name"] == "Chapati"

    def test_menu_hides_invisible_dish(self, app, client):
        with app.app_context():
            d = Dish(name="Secret", base_price=10, is_visible=False, is_active=True)
            db.session.add(d); db.session.commit()
        r = client.get("/api/customer/menu")
        names = [d["name"] for d in r.get_json()["menu"]]
        assert "Secret" not in names

    def test_menu_hides_inactive_dish(self, app, client):
        with app.app_context():
            d = Dish(name="Retired", base_price=10, is_visible=True, is_active=False)
            db.session.add(d); db.session.commit()
        r = client.get("/api/customer/menu")
        names = [d["name"] for d in r.get_json()["menu"]]
        assert "Retired" not in names

    def test_menu_hides_out_of_stock(self, app, client):
        iid = seed_ingredient(app, "Saffron", "g", 0, 5000)
        seed_dish(app, "Saffron Rice", 200, 500, "Special", [iid], 1.0)
        r = client.get("/api/customer/menu")
        names = [d["name"] for d in r.get_json()["menu"]]
        assert "Saffron Rice" not in names

    def test_menu_dish_has_price(self, app, client):
        iid = seed_ingredient(app, "Oil", "l", 10, 100)
        seed_dish(app, "Fries", 15, 50, "Snacks", [iid], 0.02)
        r = client.get("/api/customer/menu")
        assert r.get_json()["menu"][0]["price"] == 50


# ═══════════════════════════════════════════════════════
#  PLACE ORDER  –  POST /api/customer/orders/place
# ═══════════════════════════════════════════════════════

class TestCustomerPlaceOrder:

    def _setup(self, app):
        _, ttoken = seed_table(app, 1)
        iid = seed_ingredient(app, "Potato", "kg", 20, 25)
        did = seed_dish(app, "Aloo Fry", 10, 40, "Main Course", [iid], 0.1)
        return ttoken, did

    def test_place_order_success(self, app, client):
        ttoken, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 2}],
        })
        assert r.status_code == 201
        assert r.get_json()["success"] is True
        assert r.get_json()["batch"]["status"] == "sent"

    def test_place_order_invalid_token(self, app, client):
        _, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": "wrong",
            "items": [{"dish_id": did, "qty": 1}],
        })
        assert r.status_code == 401

    def test_place_order_missing_table(self, app, client):
        _, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "items": [{"dish_id": did, "qty": 1}],
        })
        assert r.status_code == 401

    def test_place_order_empty_items(self, app, client):
        ttoken, _ = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken, "items": [],
        })
        assert r.status_code == 400

    def test_place_order_no_items_key(self, app, client):
        ttoken, _ = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
        })
        assert r.status_code == 400

    def test_place_order_invalid_dish(self, app, client):
        ttoken, _ = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": 9999, "qty": 1}],
        })
        assert r.status_code == 400

    def test_place_order_zero_qty(self, app, client):
        ttoken, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 0}],
        })
        assert r.status_code == 400

    def test_place_order_negative_qty(self, app, client):
        ttoken, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": -1}],
        })
        assert r.status_code == 400

    def test_place_order_low_stock(self, app, client):
        _, ttoken = seed_table(app, 2)
        iid = seed_ingredient(app, "Truffle", "g", 0.001, 5000)
        did = seed_dish(app, "Truffle Pasta", 200, 500, "Special", [iid], 1.0)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 2, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        assert r.status_code == 400
        assert "stock" in r.get_json()["error"].lower()

    def test_place_order_with_note(self, app, client):
        ttoken, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
            "note": "Extra spicy",
        })
        assert r.status_code == 201

    def test_creates_new_order_if_none(self, app, client):
        ttoken, did = self._setup(app)
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        assert r.get_json()["batch"]["order_id"] is not None

    def test_appends_to_existing_order(self, app, client):
        ttoken, did = self._setup(app)
        r1 = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        r2 = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 2}],
        })
        assert r1.get_json()["batch"]["order_id"] == r2.get_json()["batch"]["order_id"]
        assert r1.get_json()["batch"]["batch_id"] != r2.get_json()["batch"]["batch_id"]

    def test_order_total_accumulates(self, app, client):
        ttoken, did = self._setup(app)
        client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        with app.app_context():
            o = Order.query.first()
            assert o.total_amount == 80  # 40 + 40


# ═══════════════════════════════════════════════════════
#  ACTIVE ORDER  –  GET /api/customer/orders/active
# ═══════════════════════════════════════════════════════

class TestCustomerActiveOrder:

    def _place(self, app, client):
        _, ttoken = seed_table(app, 1)
        iid = seed_ingredient(app, "Cheese", "kg", 10, 300)
        did = seed_dish(app, "Pizza", 50, 150, "Fast Food", [iid], 0.1)
        client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        return ttoken

    def test_active_order_exists(self, app, client):
        ttoken = self._place(app, client)
        r = client.get(f"/api/customer/orders/active?table_number=1&table_token={ttoken}")
        assert r.status_code == 200
        assert r.get_json()["active_order"] is not None

    def test_active_order_none(self, app, client):
        _, ttoken = seed_table(app, 1)
        r = client.get(f"/api/customer/orders/active?table_number=1&table_token={ttoken}")
        assert r.status_code == 200
        assert r.get_json()["active_order"] is None

    def test_active_order_invalid_table(self, app, client):
        self._place(app, client)
        r = client.get("/api/customer/orders/active?table_number=1&table_token=bad")
        assert r.status_code == 401

    def test_can_request_close_false_when_pending(self, app, client):
        ttoken = self._place(app, client)
        r = client.get(f"/api/customer/orders/active?table_number=1&table_token={ttoken}")
        assert r.get_json()["can_request_close"] is False

    def test_active_order_shows_batches(self, app, client):
        ttoken = self._place(app, client)
        r = client.get(f"/api/customer/orders/active?table_number=1&table_token={ttoken}")
        assert len(r.get_json()["active_orders"]) >= 1


# ═══════════════════════════════════════════════════════
#  ORDER HISTORY  –  GET /api/customer/orders/history
# ═══════════════════════════════════════════════════════

class TestCustomerOrderHistory:

    def test_history_exists(self, app, client):
        _, ttoken = seed_table(app, 1)
        iid = seed_ingredient(app, "Rice", "kg", 50, 60)
        did = seed_dish(app, "Plain Rice", 10, 30, "Rice", [iid], 0.1)
        client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        r = client.get(f"/api/customer/orders/history?table_number=1&table_token={ttoken}")
        assert r.status_code == 200
        assert len(r.get_json()["orders"]) >= 1

    def test_history_invalid_table(self, client):
        r = client.get("/api/customer/orders/history?table_number=1&table_token=bad")
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
#  REQUEST CLOSE  –  POST /api/customer/orders/request-close
# ═══════════════════════════════════════════════════════

class TestCustomerRequestClose:

    def test_request_close_success(self, app, client):
        ids = seed_full_order(app, batch_status="delivered", kitchen_status="delivered")
        with app.app_context():
            it = OrderItem.query.get(ids["item_id"])
            it.delivered_at = datetime.now()
            db.session.commit()
        r = client.post("/api/customer/orders/request-close", json={
            "table_number": ids["table_number"], "table_token": ids["table_token"],
        })
        assert r.status_code == 200
        assert r.get_json()["success"] is True

    def test_request_close_blocked_pending(self, app, client):
        ids = seed_full_order(app, batch_status="accepted", kitchen_status="queued")
        r = client.post("/api/customer/orders/request-close", json={
            "table_number": ids["table_number"], "table_token": ids["table_token"],
        })
        assert r.status_code == 400

    def test_request_close_invalid_table(self, client):
        r = client.post("/api/customer/orders/request-close", json={
            "table_number": 99, "table_token": "fake",
        })
        assert r.status_code == 401

    def test_request_close_no_order(self, app, client):
        _, ttoken = seed_table(app, 1)
        r = client.post("/api/customer/orders/request-close", json={
            "table_number": 1, "table_token": ttoken,
        })
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════
#  END-TO-END LIFECYCLE
# ═══════════════════════════════════════════════════════

class TestCustomerFullLifecycle:
    """
    Customer places order → Manager approves → Chef marks done →
    Waiter delivers → Customer requests close → Waiter closes table.
    """

    def test_full_lifecycle(self, app, client):
        # Setup
        seed_manager(app)
        tok = login(client)
        _, ttoken = seed_table(app, 1)
        iid = seed_ingredient(app, "Chicken", "kg", 20, 200)
        did = seed_dish(app, "Butter Chicken", 80, 250, "Main Course", [iid], 0.25)

        # 1) Customer places order
        r = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": did, "qty": 1}],
        })
        assert r.status_code == 201
        bid = r.get_json()["batch"]["batch_id"]

        # 2) Manager approves
        r = client.patch(f"/api/manager/orders/{bid}/approve", headers=auth(tok))
        assert r.get_json()["success"] is True

        # 3) Chef marks done
        r = client.get("/api/chef/queue")
        item_id = r.get_json()["queue"][0]["item_id"]
        r = client.post(f"/api/chef/items/{item_id}/done")
        assert r.get_json()["batch_status"] == "ready"

        # 4) Waiter delivers
        r = client.post(f"/api/waiter/items/{item_id}/deliver")
        assert r.get_json()["batch_status"] == "delivered"

        # 5) Customer can now request close
        r = client.get(f"/api/customer/orders/active?table_number=1&table_token={ttoken}")
        assert r.get_json()["can_request_close"] is True

        # 6) Customer requests close
        r = client.post("/api/customer/orders/request-close", json={
            "table_number": 1, "table_token": ttoken,
        })
        assert r.status_code == 200

        # 7) Waiter closes table
        r = client.post("/api/waiter/tables/1/close", json={"payment_method": "UPI"})
        assert r.status_code == 200

        # 8) Order is closed
        with app.app_context():
            o = Order.query.first()
            assert o.status == "closed"

    def test_multiple_batches(self, app, client):
        """Two order rounds from same table share the same Order."""
        seed_manager(app)
        tok = login(client)
        _, ttoken = seed_table(app, 1)
        iid = seed_ingredient(app, "Rice", "kg", 50, 60)
        d1 = seed_dish(app, "White Rice", 10, 30, "Rice", [iid], 0.15)
        d2 = seed_dish(app, "Fried Rice", 20, 50, "Rice", [iid], 0.2)

        r1 = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": d1, "qty": 1}],
        })
        r2 = client.post("/api/customer/orders/place", json={
            "table_number": 1, "table_token": ttoken,
            "items": [{"dish_id": d2, "qty": 2}],
        })
        assert r1.get_json()["batch"]["order_id"] == r2.get_json()["batch"]["order_id"]
        assert r1.get_json()["batch"]["batch_id"] != r2.get_json()["batch"]["batch_id"]


