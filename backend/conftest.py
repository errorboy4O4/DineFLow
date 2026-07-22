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
