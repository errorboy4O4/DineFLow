from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid
from services.time_service import now_local_naive

db = SQLAlchemy()

# -------------------------------
# 1. MANAGER
# -------------------------------
class Manager(db.Model):
    __tablename__ = "managers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    # Restaurant metadata (used on bills, editable in Settings)
    restaurant_name = db.Column(db.String(160), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    gstin = db.Column(db.String(32), nullable=True)
    phone_number = db.Column(db.String(32), nullable=True)

    # Billing configuration
    gst_rate = db.Column(db.Float, nullable=True)  # percent, e.g. 5
    bill_terms = db.Column(db.Text, nullable=True)
    qr_image_path = db.Column(db.String(255), nullable=True)

    bill_show_restaurant_name = db.Column(db.Boolean, default=True)
    bill_show_address = db.Column(db.Boolean, default=True)
    bill_show_gstin = db.Column(db.Boolean, default=True)
    bill_show_phone = db.Column(db.Boolean, default=True)

    # Percent markup on base ingredient cost for AI custom dishes (e.g., 30 => +30%).
    custom_dish_profit_margin = db.Column(db.Float, nullable=True)

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=now_local_naive)


# -------------------------------
# 2. RESTAURANT TABLE
# -------------------------------
class RestaurantTable(db.Model):
    __tablename__ = "restaurant_tables"

    id = db.Column(db.Integer, primary_key=True)
    table_number = db.Column(db.Integer, unique=True, nullable=False)

    table_token = db.Column(
        db.String(100),
        unique=True,
        nullable=False,
        default=lambda: str(uuid.uuid4())
    )

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=now_local_naive)

    orders = db.relationship("Order", backref="table", lazy=True)


# -------------------------------
# 3. INGREDIENT (Inventory)
# -------------------------------
class Ingredient(db.Model):
    __tablename__ = "ingredients"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    unit = db.Column(db.String(50), nullable=False)
    current_quantity = db.Column(db.Float, nullable=False, default=0)
    purchase_price_per_unit = db.Column(db.Float, nullable=False)
    low_stock_threshold = db.Column(db.Float, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=now_local_naive)


# -------------------------------
# 4. DISH (Menu)
# -------------------------------
class Dish(db.Model):
    __tablename__ = "dishes"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text)
    category = db.Column(db.String(80), nullable=True)
    photo_path = db.Column(db.String(255))
    # base_price represents computed COST (sum of recipe ingredient costs)
    base_price = db.Column(db.Float, nullable=False)

    # selling_price is set in the Pricing tab (profit margin) and used for customer price.
    selling_price = db.Column(db.Float, nullable=True)

    is_visible = db.Column(db.Boolean, default=True)
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=now_local_naive)

    ingredients = db.relationship(
        "DishIngredient",
        backref="dish",
        cascade="all, delete-orphan",
        lazy=True
    )


# -------------------------------
# 5. DISH INGREDIENT (Recipe Mapping)
# -------------------------------
class DishIngredient(db.Model):
    __tablename__ = "dish_ingredients"

    id = db.Column(db.Integer, primary_key=True)

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id"),
        nullable=False
    )

    ingredient_id = db.Column(
        db.Integer,
        db.ForeignKey("ingredients.id"),
        nullable=False
    )

    quantity_required = db.Column(db.Float, nullable=False)

    ingredient = db.relationship("Ingredient")

    __table_args__ = (
        db.UniqueConstraint(
            'dish_id',
            'ingredient_id',
            name='unique_dish_ingredient'
        ),
    )


# -------------------------------
# 6. ORDER (Running Bill)
# -------------------------------
class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)

    table_id = db.Column(
        db.Integer,
        db.ForeignKey("restaurant_tables.id"),
        nullable=False
    )

    status = db.Column(db.String(20), default="open")  # open / closed

    total_amount = db.Column(db.Float, default=0)

    created_at = db.Column(db.DateTime, default=now_local_naive)
    closed_at = db.Column(db.DateTime)

    batches = db.relationship(
        "OrderBatch",
        backref="order",
        cascade="all, delete-orphan",
        lazy=True
    )


# -------------------------------
# 7. ORDER BATCH (Each Order Round)
# -------------------------------
class OrderBatch(db.Model):
    __tablename__ = "order_batches"

    id = db.Column(db.Integer, primary_key=True)

    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id"),
        nullable=False
    )

    status = db.Column(
        db.String(20),
        default="sent"  # sent, accepted, ready, delivered
    )

    created_at = db.Column(db.DateTime, default=now_local_naive)

    items = db.relationship(
        "OrderItem",
        backref="batch",
        cascade="all, delete-orphan",
        lazy=True
    )


# -------------------------------
# 8. ORDER ITEM
# -------------------------------
class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)

    order_batch_id = db.Column(
        db.Integer,
        db.ForeignKey("order_batches.id"),
        nullable=False
    )

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id"),
        nullable=True
    )

    quantity = db.Column(db.Integer, default=1)

    unit_price = db.Column(db.Float, nullable=False)

    is_custom = db.Column(db.Boolean, default=False)

    custom_name = db.Column(db.String(120))
    custom_recipe_json = db.Column(db.Text)

    # Kitchen flow (chef). We keep this nullable for lightweight sqlite migrations.
    # Values: queued | done
    kitchen_status = db.Column(db.String(20), default="queued")
    delivered_at = db.Column(db.DateTime, nullable=True)

    dish = db.relationship("Dish")

    custom_dish_ingredients = db.relationship(
        "CustomDishIngredient",
        backref="order_item",
        cascade="all, delete-orphan",
        lazy=True,
    )


# -------------------------------
# 9. CUSTOM DISH INGREDIENT (AI)
# -------------------------------
class CustomDishIngredient(db.Model):
    __tablename__ = "custom_dish_ingredients"

    id = db.Column(db.Integer, primary_key=True)

    order_item_id = db.Column(
        db.Integer,
        db.ForeignKey("order_items.id"),
        nullable=False
    )

    ingredient_id = db.Column(
        db.Integer,
        db.ForeignKey("ingredients.id"),
        nullable=False
    )

    quantity_required = db.Column(db.Float, nullable=False)

    ingredient = db.relationship("Ingredient")
