from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

from models import (
    db,
    Manager,
    RestaurantTable,
    Ingredient,
    Dish,
    DishIngredient,
    Order,
    OrderBatch,
    OrderItem,
)
from typing import Dict, List, Tuple


DEFAULT_INGREDIENTS: List[Tuple[str, str, float, float, float]] = [
    # Dairy (7)
    ("Milk", "l", 50.0, 55.0, 8.0),
    ("Curd / Yogurt", "kg", 12.0, 90.0, 2.0),
    ("Butter", "kg", 6.0, 520.0, 1.0),
    ("Ghee", "kg", 5.0, 650.0, 1.0),
    ("Paneer", "kg", 8.0, 320.0, 1.5),
    ("Cheese", "kg", 4.0, 560.0, 0.8),
    ("Fresh Cream", "l", 6.0, 180.0, 1.0),

    # Meat / protein (3)
    ("Chicken Breast", "kg", 12.0, 260.0, 2.0),
    ("Chicken Mince", "kg", 6.0, 240.0, 1.0),
    ("Eggs", "pcs", 120.0, 6.0, 24.0),

    # Vegetables (7)
    ("Onion", "kg", 25.0, 35.0, 5.0),
    ("Tomato", "kg", 20.0, 30.0, 4.0),
    ("Potato", "kg", 30.0, 28.0, 6.0),
    ("Carrot", "kg", 12.0, 40.0, 2.5),
    ("Capsicum", "kg", 10.0, 65.0, 2.0),
    ("Spinach", "kg", 8.0, 30.0, 1.5),
    ("Green Peas", "kg", 8.0, 90.0, 1.5),

    # Spices / staples (7)
    ("Salt", "kg", 20.0, 18.0, 3.0),
    ("Sugar", "kg", 25.0, 45.0, 4.0),
    ("Turmeric Powder", "kg", 5.0, 260.0, 0.8),
    ("Cumin Seeds", "kg", 3.0, 500.0, 0.6),
    ("Coriander Powder", "kg", 4.0, 280.0, 0.8),
    ("Red Chilli Powder", "kg", 4.0, 420.0, 0.8),
    ("Garam Masala", "kg", 3.0, 650.0, 0.6),

    # Pantry staples required by seeded dishes (4)
    ("Rice", "kg", 30.0, 65.0, 6.0),
    ("Wheat Flour", "kg", 25.0, 45.0, 5.0),
    ("Cooking Oil", "l", 15.0, 150.0, 3.0),
    ("Baking Powder", "kg", 2.0, 220.0, 0.3),

    # Fruits (1) + Raw (1) => total 30
    ("Banana", "pcs", 120.0, 4.0, 25.0),
    ("RAW Plant Protein Powder", "kg", 3.0, 1800.0, 0.4),
]

DEFAULT_INGREDIENT_MAP: Dict[str, Tuple[str, float, float, float]] = {
    name: (unit, qty, price, threshold) for (name, unit, qty, price, threshold) in DEFAULT_INGREDIENTS
}

DEFAULT_MANAGER_EMAIL = "dine@gmail.com"
DEFAULT_MANAGER_PASSWORD = "12345"


def ensure_default_manager() -> bool:
    """
    Ensure a demo manager exists and has baseline billing/profile fields populated.
    Safe for existing DBs: does not overwrite non-empty values.
    """
    manager = Manager.query.filter_by(email=DEFAULT_MANAGER_EMAIL).first()

    if not manager:
        manager = Manager(
            name="Manager",
            email=DEFAULT_MANAGER_EMAIL,
            password_hash=generate_password_hash(DEFAULT_MANAGER_PASSWORD),
            custom_dish_profit_margin=30.0,
            restaurant_name="DineFlow Kitchen",
            address="MG Road, Bengaluru, Karnataka",
            gstin="29ABCDE1234F1Z5",
            phone_number="+91 9876543210",
        )
        db.session.add(manager)
        db.session.commit()
        return True

    changed = False
    if not (getattr(manager, "restaurant_name", None) or "").strip():
        manager.restaurant_name = "DineFlow Kitchen"
        changed = True
    if not (getattr(manager, "address", None) or "").strip():
        manager.address = "MG Road, Bengaluru, Karnataka"
        changed = True
    if not (getattr(manager, "gstin", None) or "").strip():
        manager.gstin = "29ABCDE1234F1Z5"
        changed = True
    if not (getattr(manager, "phone_number", None) or "").strip():
        manager.phone_number = "+91 9876543210"
        changed = True
    try:
        if getattr(manager, "custom_dish_profit_margin", None) is None:
            manager.custom_dish_profit_margin = 30.0
            changed = True
    except Exception:
        pass

    if changed:
        db.session.commit()
    return changed


def seed_ingredients_if_empty():
    """
    Prefill 30 ingredients (dairy, meat, vegetables, spices, fruits, and one raw plant protein powder).
    This runs safely at app startup: it only inserts when the ingredient table is empty.
    """
    if Ingredient.query.count() > 0:
        return False

    for name, unit, qty, price, threshold in DEFAULT_INGREDIENTS:
        db.session.add(
            Ingredient(
                name=name,
                unit=unit,
                current_quantity=float(qty),
                purchase_price_per_unit=float(price),
                low_stock_threshold=float(threshold),
            )
        )

    db.session.commit()
    return True


def _ensure_ingredient(name: str, unit: str, qty: float, price_per_unit: float, threshold: float = 0.0) -> Ingredient:
    ing = Ingredient.query.filter_by(name=name).first()
    if ing:
        return ing
    ing = Ingredient(
        name=name,
        unit=unit,
        current_quantity=float(qty),
        purchase_price_per_unit=float(price_per_unit),
        low_stock_threshold=float(threshold or 0.0),
    )
    db.session.add(ing)
    db.session.flush()
    return ing


def ensure_default_ingredients():
    """
    Ensure all default ingredients exist before creating seeded dishes.
    Safe for existing DBs: only inserts missing ingredients (no overwrite).
    """
    changed = False
    for name, unit, qty, price, threshold in DEFAULT_INGREDIENTS:
        if Ingredient.query.filter_by(name=name).first():
            continue
        _ensure_ingredient(name, unit, qty, price, threshold)
        changed = True
    if changed:
        db.session.commit()
    return changed


def seed_dishes_if_empty():
    """
    Prefill 2 dishes for each category and their DishIngredient recipe mapping.
    This runs safely at app startup: it only inserts when dishes table is empty.
    """
    if Dish.query.count() > 0:
        return False

    ensure_default_ingredients()

    def add_dish(name: str, category: str, description: str, recipe: List[Tuple[str, float]]):
        if Dish.query.filter_by(name=name).first():
            return

        base_cost = 0.0
        pairs = []
        for ing_name, qty_required in recipe:
            ing = Ingredient.query.filter_by(name=ing_name).first()
            if not ing:
                spec = DEFAULT_INGREDIENT_MAP.get(ing_name)
                if spec:
                    unit, qty, price, threshold = spec
                    ing = _ensure_ingredient(ing_name, unit, qty, price, threshold)
                else:
                    ing = _ensure_ingredient(ing_name, "kg", 10.0, 100.0, 2.0)
            qty_required = float(qty_required)
            if qty_required <= 0:
                continue
            base_cost += float(ing.purchase_price_per_unit or 0) * qty_required
            pairs.append((ing, qty_required))

        base_cost = round(float(base_cost), 2)
        selling = round(base_cost * 1.4, 2) if base_cost > 0 else 0.0

        dish = Dish(
            name=name,
            category=category,
            description=description,
            photo_path="",
            base_price=base_cost if base_cost > 0 else 1.0,
            selling_price=selling if selling > 0 else None,
            is_visible=True,
            is_active=True,
        )
        db.session.add(dish)
        db.session.flush()

        for ing, qty_required in pairs:
            db.session.add(
                DishIngredient(
                    dish_id=dish.id,
                    ingredient_id=ing.id,
                    quantity_required=float(qty_required),
                )
            )

    # Main Course (2)
    add_dish(
        "Butter Chicken",
        "Main Course",
        "Tender chicken in a rich, buttery tomato gravy finished with cream.",
        [
            ("Chicken Breast", 0.25),
            ("Tomato", 0.18),
            ("Onion", 0.12),
            ("Butter", 0.02),
            ("Fresh Cream", 0.03),
            ("Cooking Oil", 0.01),
            ("Salt", 0.006),
            ("Red Chilli Powder", 0.004),
            ("Turmeric Powder", 0.002),
            ("Garam Masala", 0.003),
        ],
    )
    add_dish(
        "Paneer Butter Masala",
        "Main Course",
        "Soft paneer cubes in a creamy, mildly spiced tomato-onion sauce.",
        [
            ("Paneer", 0.22),
            ("Tomato", 0.2),
            ("Onion", 0.12),
            ("Butter", 0.02),
            ("Fresh Cream", 0.03),
            ("Cooking Oil", 0.01),
            ("Salt", 0.006),
            ("Coriander Powder", 0.004),
            ("Red Chilli Powder", 0.003),
            ("Garam Masala", 0.003),
        ],
    )

    # Starter (2)
    add_dish(
        "Paneer Tikka",
        "Starter",
        "Smoky paneer bites marinated in curd and spices, grilled to perfection.",
        [
            ("Paneer", 0.2),
            ("Curd / Yogurt", 0.12),
            ("Onion", 0.08),
            ("Capsicum", 0.08),
            ("Cooking Oil", 0.01),
            ("Salt", 0.005),
            ("Cumin Seeds", 0.003),
            ("Red Chilli Powder", 0.003),
            ("Garam Masala", 0.003),
            ("Turmeric Powder", 0.002),
        ],
    )
    add_dish(
        "Chicken Seekh Kebab",
        "Starter",
        "Juicy minced chicken kebabs with warm spices and a crisp sear.",
        [
            ("Chicken Mince", 0.25),
            ("Onion", 0.08),
            ("Eggs", 1),
            ("Cooking Oil", 0.01),
            ("Salt", 0.006),
            ("Cumin Seeds", 0.003),
            ("Red Chilli Powder", 0.003),
            ("Garam Masala", 0.004),
            ("Coriander Powder", 0.004),
        ],
    )

    # Breads (2)
    add_dish(
        "Butter Roti",
        "Breads",
        "Soft whole-wheat roti brushed with butter, served hot.",
        [
            ("Wheat Flour", 0.12),
            ("Salt", 0.003),
            ("Butter", 0.01),
        ],
    )
    add_dish(
        "Cheese Naan",
        "Breads",
        "Fluffy naan stuffed with melty cheese and finished with butter.",
        [
            ("Wheat Flour", 0.14),
            ("Curd / Yogurt", 0.05),
            ("Baking Powder", 0.002),
            ("Salt", 0.003),
            ("Cheese", 0.05),
            ("Butter", 0.012),
            ("Cooking Oil", 0.008),
        ],
    )

    # Beverages (2)
    add_dish(
        "Banana Protein Shake",
        "Beverages",
        "Chilled milkshake blended with banana and plant protein for a clean boost.",
        [
            ("Milk", 0.35),
            ("Banana", 1),
            ("RAW Plant Protein Powder", 0.03),
            ("Sugar", 0.02),
        ],
    )
    add_dish(
        "Salted Cumin Lassi",
        "Beverages",
        "Refreshing yogurt drink with roasted cumin and a pinch of salt.",
        [
            ("Curd / Yogurt", 0.3),
            ("Cumin Seeds", 0.002),
            ("Salt", 0.003),
            ("Sugar", 0.01),
        ],
    )

    # Desserts (2)
    add_dish(
        "Creamy Banana Milk Dessert",
        "Desserts",
        "A silky milk-and-cream dessert topped with sweet banana.",
        [
            ("Milk", 0.35),
            ("Fresh Cream", 0.04),
            ("Sugar", 0.03),
            ("Banana", 1),
        ],
    )
    add_dish(
        "Sweet Curd Delight",
        "Desserts",
        "Lightly sweetened chilled yogurt with a creamy finish.",
        [
            ("Curd / Yogurt", 0.25),
            ("Sugar", 0.03),
            ("Fresh Cream", 0.02),
        ],
    )

    # Sides (2)
    add_dish(
        "Aloo Masala Fry",
        "Sides",
        "Crisp pan-fried potatoes tossed with classic Indian spices.",
        [
            ("Potato", 0.25),
            ("Onion", 0.06),
            ("Cooking Oil", 0.015),
            ("Salt", 0.006),
            ("Turmeric Powder", 0.002),
            ("Red Chilli Powder", 0.003),
            ("Cumin Seeds", 0.002),
        ],
    )
    add_dish(
        "Matar Tomato Masala",
        "Sides",
        "Green peas simmered in a tangy tomato-onion masala.",
        [
            ("Green Peas", 0.2),
            ("Tomato", 0.12),
            ("Onion", 0.08),
            ("Cooking Oil", 0.01),
            ("Salt", 0.006),
            ("Coriander Powder", 0.004),
            ("Red Chilli Powder", 0.003),
            ("Garam Masala", 0.003),
        ],
    )

    # Thali (2)
    add_dish(
        "Paneer Veg Thali",
        "Thali",
        "A hearty thali with paneer curry, veggies, rice and roti.",
        [
            ("Paneer", 0.12),
            ("Tomato", 0.1),
            ("Onion", 0.08),
            ("Potato", 0.12),
            ("Green Peas", 0.08),
            ("Rice", 0.18),
            ("Wheat Flour", 0.1),
            ("Cooking Oil", 0.015),
            ("Salt", 0.008),
            ("Garam Masala", 0.004),
        ],
    )
    add_dish(
        "Chicken Comfort Thali",
        "Thali",
        "Comfort thali featuring chicken curry with rice and roti on the side.",
        [
            ("Chicken Breast", 0.18),
            ("Tomato", 0.12),
            ("Onion", 0.1),
            ("Rice", 0.2),
            ("Wheat Flour", 0.1),
            ("Fresh Cream", 0.02),
            ("Cooking Oil", 0.015),
            ("Salt", 0.008),
            ("Red Chilli Powder", 0.003),
            ("Garam Masala", 0.004),
        ],
    )

    db.session.commit()
    return True


def seed_closed_orders_feb_2026():
    """
    Prefill closed orders for February 2026 (week by week) for analytics/demo.
    Safe for existing DBs: it only inserts if there are no closed orders in Feb 2026.
    """
    start = datetime(2026, 2, 1, 0, 0, 0)
    end = datetime(2026, 3, 1, 0, 0, 0)

    existing = (
        Order.query.filter(Order.status == "closed")
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= start)
        .filter(Order.closed_at < end)
        .count()
    )
    if existing > 0:
        return False

    # Ensure tables & menu exist
    if RestaurantTable.query.count() == 0:
        for i in range(1, 11):
            db.session.add(RestaurantTable(table_number=i))
        db.session.commit()

    ensure_default_ingredients()
    seed_dishes_if_empty()

    def dish_price(d: Dish) -> float:
        try:
            return float(d.selling_price if d.selling_price is not None else d.base_price)
        except Exception:
            return 0.0

    def get_dish(name: str) -> Dish:
        return Dish.query.filter_by(name=name).first()

    menu_plan = [
        # Week 1 (Feb 1-7)
        (datetime(2026, 2, 3, 13, 10), 2, [("Butter Chicken", 1), ("Butter Roti", 3), ("Salted Cumin Lassi", 1)]),
        (datetime(2026, 2, 5, 20, 5), 4, [("Paneer Tikka", 1), ("Cheese Naan", 2), ("Sweet Curd Delight", 1)]),
        (datetime(2026, 2, 7, 14, 35), 1, [("Paneer Butter Masala", 1), ("Butter Roti", 4)]),

        # Week 2 (Feb 8-14)
        (datetime(2026, 2, 10, 19, 45), 5, [("Chicken Seekh Kebab", 1), ("Cheese Naan", 2), ("Banana Protein Shake", 1)]),
        (datetime(2026, 2, 12, 13, 5), 3, [("Paneer Veg Thali", 1), ("Creamy Banana Milk Dessert", 1)]),
        (datetime(2026, 2, 14, 21, 15), 2, [("Chicken Comfort Thali", 1), ("Salted Cumin Lassi", 2)]),

        # Week 3 (Feb 15-21)
        (datetime(2026, 2, 17, 12, 50), 6, [("Matar Tomato Masala", 1), ("Butter Roti", 3), ("Sweet Curd Delight", 1)]),
        (datetime(2026, 2, 19, 20, 25), 7, [("Butter Chicken", 1), ("Cheese Naan", 2), ("Creamy Banana Milk Dessert", 1)]),
        (datetime(2026, 2, 21, 14, 10), 8, [("Paneer Butter Masala", 1), ("Aloo Masala Fry", 1), ("Butter Roti", 3)]),

        # Week 4 (Feb 22-28)
        (datetime(2026, 2, 24, 19, 10), 9, [("Paneer Veg Thali", 1), ("Salted Cumin Lassi", 1)]),
        (datetime(2026, 2, 26, 13, 25), 10, [("Chicken Comfort Thali", 1), ("Chicken Seekh Kebab", 1), ("Banana Protein Shake", 1)]),
        (datetime(2026, 2, 28, 20, 40), 4, [("Paneer Tikka", 1), ("Cheese Naan", 2), ("Creamy Banana Milk Dessert", 1)]),
    ]

    for closed_at, table_number, items in menu_plan:
        table = RestaurantTable.query.filter_by(table_number=table_number).first()
        if not table:
            continue

        created_at = closed_at - timedelta(minutes=45)
        order = Order(
            table_id=table.id,
            status="closed",
            total_amount=0,
            created_at=created_at,
            closed_at=closed_at,
        )
        db.session.add(order)
        db.session.flush()

        batch = OrderBatch(
            order_id=order.id,
            status="delivered",
            created_at=created_at,
        )
        db.session.add(batch)
        db.session.flush()

        subtotal = 0.0
        for dish_name, qty in items:
            dish = get_dish(dish_name)
            if not dish:
                continue
            qty = int(qty or 0)
            if qty <= 0:
                continue
            unit = dish_price(dish)
            subtotal += unit * qty
            db.session.add(
                OrderItem(
                    order_batch_id=batch.id,
                    dish_id=dish.id,
                    quantity=qty,
                    unit_price=float(unit),
                    is_custom=False,
                    kitchen_status="delivered",
                    delivered_at=closed_at - timedelta(minutes=5),
                )
            )

        order.total_amount = round(float(subtotal), 2)

    db.session.commit()
    return True


def seed_closed_orders_mar_2026():
    """
    Prefill closed orders for March 2026 (week by week) for analytics/demo.
    Safe for existing DBs: it only inserts if there are no closed orders in Mar 2026.
    """
    start = datetime(2026, 3, 1, 0, 0, 0)
    end = datetime(2026, 4, 1, 0, 0, 0)

    existing = (
        Order.query.filter(Order.status == "closed")
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= start)
        .filter(Order.closed_at < end)
        .count()
    )
    if existing > 0:
        return False

    # Ensure tables & menu exist
    if RestaurantTable.query.count() == 0:
        for i in range(1, 11):
            db.session.add(RestaurantTable(table_number=i))
        db.session.commit()

    ensure_default_ingredients()
    seed_dishes_if_empty()

    def dish_price(d: Dish) -> float:
        try:
            return float(d.selling_price if d.selling_price is not None else d.base_price)
        except Exception:
            return 0.0

    def get_dish(name: str) -> Dish:
        return Dish.query.filter_by(name=name).first()

    menu_plan = [
        # Week 1 (Mar 1-7)
        (datetime(2026, 3, 2, 13, 25), 3, [("Paneer Butter Masala", 1), ("Butter Roti", 4), ("Sweet Curd Delight", 1)]),
        (datetime(2026, 3, 4, 20, 15), 6, [("Butter Chicken", 1), ("Cheese Naan", 2), ("Salted Cumin Lassi", 1)]),
        (datetime(2026, 3, 7, 14, 10), 2, [("Paneer Tikka", 1), ("Aloo Masala Fry", 1), ("Butter Roti", 3)]),

        # Week 2 (Mar 8-14)
        (datetime(2026, 3, 9, 19, 40), 8, [("Chicken Seekh Kebab", 1), ("Cheese Naan", 2), ("Creamy Banana Milk Dessert", 1)]),
        (datetime(2026, 3, 11, 13, 5), 1, [("Paneer Veg Thali", 1), ("Salted Cumin Lassi", 1)]),
        (datetime(2026, 3, 14, 21, 5), 4, [("Chicken Comfort Thali", 1), ("Banana Protein Shake", 1)]),

        # Week 3 (Mar 15-21)
        (datetime(2026, 3, 16, 12, 55), 7, [("Matar Tomato Masala", 1), ("Butter Roti", 3)]),
        (datetime(2026, 3, 18, 20, 30), 9, [("Butter Chicken", 1), ("Butter Roti", 4), ("Sweet Curd Delight", 1)]),
        (datetime(2026, 3, 21, 14, 20), 5, [("Paneer Butter Masala", 1), ("Cheese Naan", 2), ("Salted Cumin Lassi", 1)]),

        # Week 4 (Mar 22-28)
        (datetime(2026, 3, 23, 19, 5), 10, [("Paneer Veg Thali", 1), ("Creamy Banana Milk Dessert", 1)]),
        (datetime(2026, 3, 26, 13, 15), 2, [("Chicken Comfort Thali", 1), ("Chicken Seekh Kebab", 1)]),
        (datetime(2026, 3, 28, 20, 45), 6, [("Paneer Tikka", 1), ("Cheese Naan", 2), ("Banana Protein Shake", 1)]),

        # Week 5 (Mar 29-31)
        (datetime(2026, 3, 30, 20, 20), 4, [("Butter Chicken", 1), ("Cheese Naan", 2), ("Salted Cumin Lassi", 2)]),
    ]

    for closed_at, table_number, items in menu_plan:
        table = RestaurantTable.query.filter_by(table_number=table_number).first()
        if not table:
            continue

        created_at = closed_at - timedelta(minutes=50)
        order = Order(
            table_id=table.id,
            status="closed",
            total_amount=0,
            created_at=created_at,
            closed_at=closed_at,
        )
        db.session.add(order)
        db.session.flush()

        batch = OrderBatch(
            order_id=order.id,
            status="delivered",
            created_at=created_at,
        )
        db.session.add(batch)
        db.session.flush()

        subtotal = 0.0
        for dish_name, qty in items:
            dish = get_dish(dish_name)
            if not dish:
                continue
            qty = int(qty or 0)
            if qty <= 0:
                continue
            unit = dish_price(dish)
            subtotal += unit * qty
            db.session.add(
                OrderItem(
                    order_batch_id=batch.id,
                    dish_id=dish.id,
                    quantity=qty,
                    unit_price=float(unit),
                    is_custom=False,
                    kitchen_status="delivered",
                    delivered_at=closed_at - timedelta(minutes=6),
                )
            )

        order.total_amount = round(float(subtotal), 2)

    db.session.commit()
    return True


def seed_closed_orders_apr_2026():
    """
    Prefill closed orders for April 2026 up to "today" (April 5, 2026) for analytics/demo.
    Safe for existing DBs: it only inserts if there are no closed orders in Apr 1-5, 2026.
    """
    start = datetime(2026, 4, 1, 0, 0, 0)
    # End is exclusive: include Apr 1..Apr 5
    end = datetime(2026, 4, 6, 0, 0, 0)

    existing = (
        Order.query.filter(Order.status == "closed")
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= start)
        .filter(Order.closed_at < end)
        .count()
    )
    if existing > 0:
        return False

    if RestaurantTable.query.count() == 0:
        for i in range(1, 11):
            db.session.add(RestaurantTable(table_number=i))
        db.session.commit()

    ensure_default_ingredients()
    seed_dishes_if_empty()

    def dish_price(d: Dish) -> float:
        try:
            return float(d.selling_price if d.selling_price is not None else d.base_price)
        except Exception:
            return 0.0

    def get_dish(name: str) -> Dish:
        return Dish.query.filter_by(name=name).first()

    # First week of April (partial, since today is Apr 5, 2026)
    menu_plan = [
        (datetime(2026, 4, 1, 13, 15), 1, [("Paneer Veg Thali", 1), ("Salted Cumin Lassi", 1)]),
        (datetime(2026, 4, 1, 20, 30), 3, [("Butter Chicken", 1), ("Cheese Naan", 2), ("Sweet Curd Delight", 1)]),
        (datetime(2026, 4, 2, 19, 55), 5, [("Paneer Butter Masala", 1), ("Butter Roti", 4), ("Creamy Banana Milk Dessert", 1)]),
        (datetime(2026, 4, 3, 13, 5), 2, [("Chicken Seekh Kebab", 1), ("Cheese Naan", 1), ("Banana Protein Shake", 1)]),
        (datetime(2026, 4, 4, 21, 10), 4, [("Chicken Comfort Thali", 1), ("Salted Cumin Lassi", 2)]),
        (datetime(2026, 4, 5, 14, 25), 6, [("Paneer Tikka", 1), ("Aloo Masala Fry", 1), ("Butter Roti", 3)]),
        (datetime(2026, 4, 5, 20, 40), 8, [("Butter Chicken", 1), ("Cheese Naan", 2), ("Banana Protein Shake", 1)]),
    ]

    for closed_at, table_number, items in menu_plan:
        table = RestaurantTable.query.filter_by(table_number=table_number).first()
        if not table:
            continue

        created_at = closed_at - timedelta(minutes=45)
        order = Order(
            table_id=table.id,
            status="closed",
            total_amount=0,
            created_at=created_at,
            closed_at=closed_at,
        )
        db.session.add(order)
        db.session.flush()

        batch = OrderBatch(
            order_id=order.id,
            status="delivered",
            created_at=created_at,
        )
        db.session.add(batch)
        db.session.flush()

        subtotal = 0.0
        for dish_name, qty in items:
            dish = get_dish(dish_name)
            if not dish:
                continue
            qty = int(qty or 0)
            if qty <= 0:
                continue
            unit = dish_price(dish)
            subtotal += unit * qty
            db.session.add(
                OrderItem(
                    order_batch_id=batch.id,
                    dish_id=dish.id,
                    quantity=qty,
                    unit_price=float(unit),
                    is_custom=False,
                    kitchen_status="delivered",
                    delivered_at=closed_at - timedelta(minutes=5),
                )
            )

        order.total_amount = round(float(subtotal), 2)

    db.session.commit()
    return True


def apply_demo_stock_levels():
    """
    Adjust inventory to look realistic after demo orders:
    - 4-5 ingredients below threshold
    - 2-3 ingredients at 0 stock

    Safe behavior: only reduces quantities (never increases), and only applies
    when demo closed orders exist in Feb–Apr 2026.
    """
    demo_start = datetime(2026, 2, 1, 0, 0, 0)
    demo_end = datetime(2026, 4, 6, 0, 0, 0)
    demo_orders = (
        Order.query.filter(Order.status == "closed")
        .filter(Order.closed_at.isnot(None))
        .filter(Order.closed_at >= demo_start)
        .filter(Order.closed_at < demo_end)
        .count()
    )
    if demo_orders <= 0:
        return False

    # Below-threshold targets (these will still allow many dishes to remain available)
    below = {
        "Milk": 5.0,          # threshold 8
        "Tomato": 2.0,        # threshold 4
        "Onion": 3.0,         # threshold 5
        "Paneer": 1.0,        # threshold 1.5
        "Cooking Oil": 2.5,   # threshold 3
    }

    # Zero stock targets (affects only a few dishes)
    zero = {
        "Cheese": 0.0,
        "Chicken Mince": 0.0,
        "Baking Powder": 0.0,
    }

    changed = False
    for name, desired in {**below, **zero}.items():
        ing = Ingredient.query.filter_by(name=name).first()
        if not ing:
            continue
        cur = float(getattr(ing, "current_quantity", 0) or 0)
        target = float(desired)
        # Only reduce
        new_qty = min(cur, target) if cur > 0 else cur
        if target == 0.0:
            new_qty = 0.0
        if abs(cur - new_qty) > 1e-9:
            ing.current_quantity = float(new_qty)
            changed = True

    if changed:
        db.session.commit()
    return changed


def seed_dev_reset():
    """
    DEV ONLY: drop and recreate DB, then seed manager, tables, and ingredients.
    Run: `python backend/seed_data.py`
    """
    db.drop_all()
    db.create_all()

    # Seed Manager (demo)
    manager = Manager(
        name="Manager",
        email=DEFAULT_MANAGER_EMAIL,
        password_hash=generate_password_hash(DEFAULT_MANAGER_PASSWORD),
        custom_dish_profit_margin=30.0,
        restaurant_name="DineFlow Kitchen",
        address="MG Road, Bengaluru, Karnataka",
        gstin="29ABCDE1234F1Z5",
        phone_number="+91 9876543210",
    )
    db.session.add(manager)

    # Seed Tables
    for i in range(1, 11):
        db.session.add(RestaurantTable(table_number=i))

    db.session.commit()
    seed_ingredients_if_empty()
    seed_dishes_if_empty()
    seed_closed_orders_feb_2026()
    seed_closed_orders_mar_2026()
    seed_closed_orders_apr_2026()
    apply_demo_stock_levels()


if __name__ == "__main__":
    # Import the Flask app only when running this file directly.
    from app import app  # noqa: E402

    with app.app_context():
        seed_dev_reset()
        print("Seed data created!")
        print(f"Manager: {DEFAULT_MANAGER_EMAIL} / {DEFAULT_MANAGER_PASSWORD}")
        print("Tables 1-10 ready")
