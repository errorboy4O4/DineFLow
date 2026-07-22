import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS

from config import Config
from models import db
from sqlalchemy import text
from seed_data import (
    ensure_default_ingredients,
    ensure_default_manager,
    seed_dishes_if_empty,
    seed_closed_orders_feb_2026,
    seed_closed_orders_mar_2026,
    seed_closed_orders_apr_2026,
    apply_demo_stock_levels,
)

# Import blueprints
try:
    from routes.manager_route import manager_bp
except ImportError:
    manager_bp = None

try:
    from routes.customers_route import customer_bp
except ImportError:
    customer_bp = None

try:
    from routes.chef_route import chef_bp
except ImportError:
    chef_bp = None

try:
    from routes.waiter_route import waiter_bp
except ImportError:
    waiter_bp = None

app = Flask(__name__)
app.config.from_object(Config)

# CORS for frontend
CORS(app)

# Database
db.init_app(app)

# Register API blueprints BEFORE catch-all frontend route
# Health check
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "message": "Restaurant Management API"})

# Register manager blueprint
if manager_bp:
    app.register_blueprint(manager_bp, url_prefix="/api/manager")

if customer_bp:
    app.register_blueprint(customer_bp, url_prefix="/api/customer")

if chef_bp:
    app.register_blueprint(chef_bp, url_prefix="/api/chef")

if waiter_bp:
    app.register_blueprint(waiter_bp, url_prefix="/api/waiter")

# Serve frontend static files (AFTER API routes)
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path == "":
        path = "index.html"

    # Serve static files as-is (js, css, html, img)
    if path.endswith((".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg")):
        try:
            resp = send_from_directory("../frontend", path, max_age=0)
            # Development-friendly: avoid stale frontend bundles when iterating locally.
            if path.endswith((".html", ".js", ".css")):
                resp.headers["Cache-Control"] = "no-store, max-age=0"
                resp.headers["Pragma"] = "no-cache"
                resp.headers["Expires"] = "0"
            return resp
        except FileNotFoundError:
            pass

    # SPA fallback for other paths
    return send_from_directory("../frontend", "index.html")


# Create tables on startup (dev only)
with app.app_context():
    db.create_all()
    print("Database tables created/verified.")

    # Lightweight migration for sqlite: ensure new columns exist.
    # (create_all doesn't alter existing tables)
    try:
        cols = {row[1] for row in db.session.execute(text("PRAGMA table_info(dishes)")).fetchall()}
        if "selling_price" not in cols:
            db.session.execute(text("ALTER TABLE dishes ADD COLUMN selling_price FLOAT"))
            db.session.commit()
            print("Migrated: added dishes.selling_price")
        if "category" not in cols:
            db.session.execute(text("ALTER TABLE dishes ADD COLUMN category VARCHAR(80)"))
            db.session.commit()
            print("Migrated: added dishes.category")
    except Exception as e:
        # Don't block app startup if migration fails.
        db.session.rollback()
        print(f"Migration warning: {e}")

    # Migration: order_items.kitchen_status
    try:
        cols = {row[1] for row in db.session.execute(text("PRAGMA table_info(order_items)")).fetchall()}
        if "kitchen_status" not in cols:
            db.session.execute(text("ALTER TABLE order_items ADD COLUMN kitchen_status VARCHAR(20)"))
            db.session.commit()
            print("Migrated: added order_items.kitchen_status")
    except Exception as e:
        db.session.rollback()
        print(f"Migration warning: {e}")



    # Migration: managers restaurant meta fields
    try:
        cols = {row[1] for row in db.session.execute(text("PRAGMA table_info(managers)")).fetchall()}
        if "restaurant_name" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN restaurant_name VARCHAR(160)"))
        if "address" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN address VARCHAR(255)"))
        if "gstin" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN gstin VARCHAR(32)"))
        if "phone_number" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN phone_number VARCHAR(32)"))

        if "gst_rate" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN gst_rate FLOAT"))
        if "bill_terms" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN bill_terms TEXT"))
        if "qr_image_path" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN qr_image_path VARCHAR(255)"))
        if "bill_show_restaurant_name" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN bill_show_restaurant_name BOOLEAN"))
        if "bill_show_address" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN bill_show_address BOOLEAN"))
        if "bill_show_gstin" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN bill_show_gstin BOOLEAN"))
        if "bill_show_phone" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN bill_show_phone BOOLEAN"))
        if "custom_dish_profit_margin" not in cols:
            db.session.execute(text("ALTER TABLE managers ADD COLUMN custom_dish_profit_margin FLOAT"))
        db.session.commit()
        print("Migrated: added managers restaurant meta columns")
    except Exception as e:
        db.session.rollback()
        print(f"Migration warning: {e}")

    # Migration: order_items.delivered_at
    try:
        cols = {row[1] for row in db.session.execute(text("PRAGMA table_info(order_items)")).fetchall()}
        if "delivered_at" not in cols:
            db.session.execute(text("ALTER TABLE order_items ADD COLUMN delivered_at DATETIME"))
            db.session.commit()
            print("Migrated: added order_items.delivered_at")
    except Exception as e:
        db.session.rollback()
        print(f"Migration warning: {e}")

    # Note: we intentionally do not store "close bill requests" in DB.
    # That signal is handled via an in-memory store (see services/close_request_store.py).

    # Ensure default manager exists (dev convenience; safe for existing DBs)
    try:
        if ensure_default_manager():
            print("Seeded: default manager (demo)")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Ensure any missing default ingredients exist (safe for existing DBs)
    try:
        if ensure_default_ingredients():
            print("Seeded: missing default ingredients")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Seed dishes once (only if dish table is empty)
    try:
        if seed_dishes_if_empty():
            print("Seeded: default dishes by category")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Seed demo closed orders for Feb 2026 (only if none exist)
    try:
        if seed_closed_orders_feb_2026():
            print("Seeded: demo closed orders (Feb 2026)")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Seed demo closed orders for Mar 2026 (only if none exist)
    try:
        if seed_closed_orders_mar_2026():
            print("Seeded: demo closed orders (Mar 2026)")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Seed demo closed orders for Apr 2026 (Apr 1-5) (only if none exist)
    try:
        if seed_closed_orders_apr_2026():
            print("Seeded: demo closed orders (Apr 2026)")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")

    # Make inventory look realistic (some low/zero stock) after demo orders.
    try:
        if apply_demo_stock_levels():
            print("Adjusted: demo inventory levels (low/zero stock)")
    except Exception as e:
        db.session.rollback()
        print(f"Seed warning: {e}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)
