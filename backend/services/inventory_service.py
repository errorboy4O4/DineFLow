from models import Dish, DishIngredient, Ingredient

def is_dish_available(dish_id):
    """Check if dish can be ordered (all ingredients in stock)"""
    dish = Dish.query.get(dish_id)
    if not dish:
        return False
    
    for di in dish.ingredients:
        ingredient = di.ingredient
        if ingredient.current_quantity < di.quantity_required:
            return False
    return True

def get_available_dishes():
    """Get list of dishes that have sufficient stock"""
    dishes = Dish.query.filter_by(is_visible=True, is_active=True).all()
    available = []
    for dish in dishes:
        if is_dish_available(dish.id):
            available.append({
                'id': dish.id,
                'name': dish.name,
                'description': dish.description,
                'photo_path': dish.photo_path,
                'category': getattr(dish, 'category', None),
                # Prefer selling_price if set, otherwise fall back to computed cost (base_price).
                'price': dish.selling_price if dish.selling_price is not None else dish.base_price
            })
    return available

def update_ingredient_stock(ingredient_id, quantity_change):
    """Update stock (negative for deduct)"""
    ingredient = Ingredient.query.get(ingredient_id)
    if ingredient:
        ingredient.current_quantity += quantity_change
        if ingredient.current_quantity < 0:
            ingredient.current_quantity = 0
        return True
    return False
