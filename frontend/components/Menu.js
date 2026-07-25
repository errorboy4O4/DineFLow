import api from '../js/api.js';

const { ref, computed } = Vue;

export default {
  template: `
    <div class="slide-up">
      <!-- Top controls -->
      <div class="flex flex-wrap gap-3 items-center mb-4" style="row-gap:0.75rem;">
        <div style="flex:1;min-width:260px;max-width:520px;">
          <div style="display:flex;align-items:center;gap:0.6rem;background:white;border:1.5px solid #E5DDD5;border-radius:0.75rem;padding:0.55rem 0.75rem;">
            <i class="bi bi-search" style="color:#9C8E84;"></i>
            <input v-model="search" type="text" placeholder="Search dishes..."
                   style="width:100%;border:none;outline:none;font-size:0.95rem;color:#1A1208;background:transparent;font-family:'DM Sans',sans-serif;" />
          </div>
        </div>

        <!-- Category pills: single row with horizontal scroll (prevents awkward wrapping) -->
        <div style="flex:2;min-width:260px;display:flex;gap:0.5rem;flex-wrap:nowrap;overflow-x:auto;padding:0.15rem 0;scrollbar-width:thin;">
          <button v-for="pill in categoryPills" :key="pill"
                  @click="activeCategory = pill"
                  :style="pillStyle(activeCategory === pill)">
            {{ pill }}
          </button>
        </div>

        <button @click="openAddModal" class="btn-primary"
                style="flex-shrink:0;display:flex;align-items:center;gap:0.5rem;border-radius:0.75rem;padding:0.65rem 1.15rem;">
          <i class="bi bi-plus-lg"></i> Add Dish
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
        <div v-for="dish in filteredDishes" :key="dish.id" class="panel slide-up">
          <div style="padding:1.25rem;display:flex;flex-direction:column;gap:0.9rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="width:54px;height:54px;border-radius:12px;overflow:hidden;background:#F0EBE3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <img v-if="dish.photo_path" :src="photoSrc(dish.photo_path)" :alt="dish.name"
                     style="width:100%;height:100%;object-fit:cover;display:block;" />
                <span v-else style="font-size:1.55rem;">{{ dishEmoji(dish) }}</span>
              </div>
              <label class="toggle-wrap" title="Show/Hide on customer menu">
                <input type="checkbox" :checked="dish.is_visible !== false" @change="toggleVisibility(dish)" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div style="min-height:42px;">
              <div style="font-weight:900;font-size:1.02rem;color:#1A1208;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ dish.name }}
              </div>
              <div style="margin-top:0.2rem;color:#9C8E84;font-weight:800;font-size:0.78rem;">
                {{ dish.category || 'Uncategorized' }}
              </div>
            </div>

            <!-- Cost / Price / Margin -->
            <div style="background:#F8F5F0;border-radius:0.75rem;padding:0.8rem 0.9rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;">
              <div>
                <div style="font-size:0.65rem;color:#9C8E84;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;">Cost</div>
                <div style="font-size:1rem;font-weight:900;color:#E63946;">{{ fmtMoney(dish.base_price ?? 0) }}</div>
              </div>
              <div>
                <div style="font-size:0.65rem;color:#9C8E84;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;">Price</div>
                <div style="font-size:1rem;font-weight:900;color:#1A1208;">{{ fmtMoney(dish.selling_price ?? 0) }}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.65rem;color:#9C8E84;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;">Margin</div>
                <div style="font-size:1rem;font-weight:900;color:#2A9D8F;">{{ marginPercent(dish) }}%</div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:0.5rem;color:#9C8E84;font-weight:800;font-size:0.82rem;">
              <i class="bi bi-list-ul"></i>
              {{ ingredientCountLabel(dish) }}
            </div>

            <div style="display:flex;gap:0.6rem;align-items:center;">
              <button @click="openRecipeEditor(dish)"
                      style="flex:1;padding:0.6rem 0.75rem;border-radius:0.75rem;background:#F0EBE3;color:#6F4E37;font-size:0.85rem;font-weight:900;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                <i class="bi bi-journals"></i> Ingredients
              </button>
              <button @click="openEditModal(dish)" style="padding:0.6rem 0.75rem;border-radius:0.75rem;background:#EDF7F6;color:#2A9D8F;font-size:0.85rem;border:none;cursor:pointer;">
                <i class="bi bi-pencil"></i>
              </button>
              <button @click="deleteDish(dish)" style="padding:0.6rem 0.75rem;border-radius:0.75rem;background:#FEE2E2;color:#E63946;font-size:0.85rem;border:none;cursor:pointer;">
                <i class="bi bi-trash"></i>
              </button>
            </div>

            <div v-if="dish.is_visible === false" style="margin-top:0.1rem;background:#FEE2E2;color:#991B1B;font-size:0.85rem;font-weight:900;text-align:center;padding:0.6rem 0.75rem;border-radius:0.75rem;">
              <i class="bi bi-slash-circle" style="margin-right:0.35rem;"></i>
              Currently Unavailable
            </div>
          </div>          
        </div>
      </div>

      <div v-if="!dishes || dishes.length === 0" style="padding:3rem;text-align:center;color:#9C8E84;">
        <i class="bi bi-cup-straw" style="display:block;font-size:2rem;margin-bottom:0.5rem;"></i>
        No dishes yet. Add one to get started.
      </div>

      <!-- ADD/EDIT MODAL (Details + Recipe) -->
      <!-- Teleport to <body> so it's truly centered in the viewport (not relative to any transformed parent) -->
      <teleport to="body">
          <div v-show="showModal"
               @click.self="closeModal"
               class="df-hide-scrollbar"
               style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:24px;overflow:auto;">
            <div class="df-hide-scrollbar" style="background:white;border-radius:1.25rem;padding:2rem;width:min(760px, calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:auto;box-shadow:0 24px 48px rgba(0,0,0,0.2);">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
            <h2 style="font-family:'Playfair Display',serif;font-weight:800;font-size:1.5rem;margin:0;color:#1A1208;">{{ isEditing ? 'Edit Dish' : 'Add Dish' }}</h2>
            <div style="display:flex;gap:0.5rem;align-items:center;">
              <button class="btn-ghost" @click="activeTab='details'" :style="activeTab==='details' ? 'background:#6F4E37;color:white;border-color:#6F4E37;' : ''">Details</button>
              <button class="btn-ghost" @click="activeTab='recipe'" :style="activeTab==='recipe' ? 'background:#6F4E37;color:white;border-color:#6F4E37;' : ''">
                Recipe
                <span v-if="recipeDraft.length" style="margin-left:0.5rem;background:#1A1208;color:#F8F5F0;font-size:0.7rem;font-weight:900;padding:0.1rem 0.45rem;border-radius:999px;">{{ recipeDraft.length }}</span>
              </button>
            </div>
          </div>

          <div v-if="activeTab==='details'" style="display:flex;flex-direction:column;gap:1.25rem;margin-top:1.25rem;">
            <div>
              <label style="display:block;font-weight:800;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Dish Name *</label>
              <input v-model="form.name" type="text" placeholder="e.g. Butter Chicken" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
            </div>

            <div>
              <label style="display:block;font-weight:800;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Category</label>
              <input v-model="form.category" list="dishCategories" type="text" placeholder="e.g. Main Course" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
              <datalist id="dishCategories">
                <option>Main Course</option>
                <option>Starter</option>
                <option>Breads</option>
                <option>Beverages</option>
                <option>Desserts</option>
                <option>Sides</option>
                <option>Thali</option>
              </datalist>
            </div>
            <div>
              <label style="display:block;font-weight:800;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Description</label>
              <textarea v-model="form.description" placeholder="Dish details..." style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;min-height:90px;"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div>
                <label style="display:block;font-weight:800;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Cost (Auto)</label>
                <div style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:0.9375rem;font-weight:900;color:#6F4E37;">
                  Rs. {{ computedCost.toFixed(2) }}
                </div>
              </div>
              <div>
                <label style="display:block;font-weight:800;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Photo (optional)</label>
                <input type="file" accept="image/*" @change="onPhotoChange" style="width:100%;padding:0.72rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
                <div v-if="photoPickedName || form.photo_path" style="margin-top:0.4rem;font-size:0.75rem;color:#6B5744;font-weight:800;">
                  <span v-if="photoPickedName">Selected: {{ photoPickedName }}</span>
                  <span v-else>Current: {{ form.photo_path }}</span>
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <label style="font-weight:900;font-size:0.875rem;color:#1A1208;">Visible?</label>
              <label class="toggle-wrap">
                <input v-model="form.is_visible" type="checkbox" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- Recipe builder directly in the create form (avoid needing "Recipe" button while creating) -->
            <div v-if="!isEditing" style="margin-top:0.25rem;border-top:1px solid rgba(111,78,55,0.12);padding-top:1rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem;">
                <div>
                  <div style="font-weight:900;color:#1A1208;">Recipe (Required)</div>
                  <div style="font-size:0.8rem;color:#9C8E84;font-weight:800;">Add ingredients here while creating the dish.</div>
                </div>
                <button class="btn-primary" @click="addRecipeRow" :disabled="ingredientsForSelect.length === 0">
                  <i class="bi bi-plus-lg" style="margin-right:0.35rem;"></i>Add Ingredient
                </button>
              </div>

              <div v-if="ingredientsForSelect.length === 0" style="padding:1rem;border:1.5px dashed #E5DDD5;border-radius:0.75rem;color:#6B5744;font-weight:800;background:#FAFAF7;">
                No ingredients found in Inventory. Add ingredients in the Inventory tab first.
              </div>

              <div v-else style="display:flex;flex-direction:column;gap:0.75rem;">
                <div v-if="recipeDraft.length === 0" style="padding:1rem;border:1.5px dashed #E5DDD5;border-radius:0.75rem;color:#9C8E84;font-weight:800;background:#FAFAF7;">
                  No ingredients added yet. Click "Add Ingredient" to build the recipe.
                </div>

                <div v-for="(row, idx) in recipeDraft" :key="row._key" style="display:grid;grid-template-columns:minmax(240px,1fr) minmax(200px,240px) 44px;gap:0.6rem;align-items:end;padding:0.75rem;border:1.5px solid rgba(111,78,55,0.12);border-radius:0.75rem;background:white;">
                  <div>
                    <label style="display:block;font-weight:900;font-size:0.8rem;color:#1A1208;margin-bottom:0.4rem;">Ingredient</label>
                    <select v-model.number="row.ingredient_id" @change="onSelectIngredient(row)" style="width:100%;padding:0.6rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-weight:800;font-size:0.9rem;">
                      <option disabled value="0">Select ingredient...</option>
                      <option v-for="ing in ingredientsForSelect" :key="ing.id" :value="ing.id">
                        {{ ing.name }} ({{ ing.unit }})
                      </option>
                    </select>
                  </div>

                  <div>
                    <label style="display:block;font-weight:900;font-size:0.8rem;color:#1A1208;margin-bottom:0.4rem;">Qty Required</label>
                    <div style="position:relative;">
                      <input v-model.number="row.quantity_required" type="number" min="0" step="0.01" placeholder="0" style="width:100%;padding:0.6rem 3.25rem 0.6rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-weight:900;font-size:0.9rem;" />
                      <div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);padding:0.2rem 0.5rem;border-radius:999px;background:#F0EBE3;color:#6B5744;font-weight:900;font-size:0.75rem;pointer-events:none;">
                        {{ row.unit || '-' }}
                      </div>
                    </div>
                  </div>

                  <div style="text-align:right;">
                    <button @click="removeRecipeRow(idx)" title="Remove" style="width:40px;height:40px;border-radius:0.75rem;border:none;background:#FEE2E2;color:#E63946;cursor:pointer;">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>

                <div v-if="recipeError" style="background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem;font-weight:900;">
                  {{ recipeError }}
                </div>

              </div>
            </div>
          </div>

          <div v-else style="margin-top:1.25rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem;">
              <div>
                <div style="font-weight:900;color:#1A1208;">Dish Ingredients (Recipe)</div>
                <div style="font-size:0.8rem;color:#9C8E84;font-weight:800;">Set quantity required for each ingredient.</div>
              </div>
              <button class="btn-primary" @click="addRecipeRow" :disabled="ingredientsForSelect.length === 0">
                <i class="bi bi-plus-lg" style="margin-right:0.35rem;"></i>Add Ingredient
              </button>
            </div>

            <div v-if="ingredientsForSelect.length === 0" style="padding:1rem;border:1.5px dashed #E5DDD5;border-radius:0.75rem;color:#6B5744;font-weight:800;background:#FAFAF7;">
              No ingredients found in Inventory. Add ingredients in the Inventory tab first.
            </div>

            <div v-else style="display:flex;flex-direction:column;gap:0.75rem;">
              <div v-if="recipeLoading" style="padding:1rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;color:#6B5744;font-weight:800;">
                Loading recipe...
              </div>

              <div v-if="!recipeLoading && recipeDraft.length === 0" style="padding:1rem;border:1.5px dashed #E5DDD5;border-radius:0.75rem;color:#9C8E84;font-weight:800;background:#FAFAF7;">
                No ingredients added yet. Click "Add Ingredient" to build the recipe.
              </div>

              <div v-for="(row, idx) in recipeDraft" :key="row._key" style="display:grid;grid-template-columns:minmax(240px,1fr) minmax(200px,240px) 44px;gap:0.6rem;align-items:end;padding:0.75rem;border:1.5px solid rgba(111,78,55,0.12);border-radius:0.75rem;background:white;">
                <div>
                  <label style="display:block;font-weight:900;font-size:0.8rem;color:#1A1208;margin-bottom:0.4rem;">Ingredient</label>
                  <select v-model.number="row.ingredient_id" @change="onSelectIngredient(row)" style="width:100%;padding:0.6rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-weight:800;font-size:0.9rem;">
                    <option disabled value="0">Select ingredient...</option>
                    <option v-for="ing in ingredientsForSelect" :key="ing.id" :value="ing.id">
                      {{ ing.name }} ({{ ing.unit }})
                    </option>
                  </select>
                </div>

                <div>
                  <label style="display:block;font-weight:900;font-size:0.8rem;color:#1A1208;margin-bottom:0.4rem;">Qty Required</label>
                  <div style="position:relative;">
                    <input v-model.number="row.quantity_required" type="number" min="0" step="0.01" placeholder="0" style="width:100%;padding:0.6rem 3.25rem 0.6rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;background:#FAFAF7;font-weight:900;font-size:0.9rem;" />
                    <div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);padding:0.2rem 0.5rem;border-radius:999px;background:#F0EBE3;color:#6B5744;font-weight:900;font-size:0.75rem;pointer-events:none;">
                      {{ row.unit || '-' }}
                    </div>
                  </div>
                </div>

                <div style="text-align:right;">
                  <button @click="removeRecipeRow(idx)" title="Remove" style="width:40px;height:40px;border-radius:0.75rem;border:none;background:#FEE2E2;color:#E63946;cursor:pointer;">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>

              <div v-if="recipeError" style="background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem;font-weight:900;">
                {{ recipeError }}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:1rem;justify-content:flex-end;margin-top:1.5rem;">
            <button @click="closeModal" class="btn-ghost">Cancel</button>
            <button @click="saveDish" class="btn-primary" :disabled="savingDish || !form.name">
              <span v-if="savingDish">Saving...</span>
              <span v-else>{{ isEditing ? 'Update' : 'Add' }} Dish</span>
            </button>
          </div>
        </div>
        </div>
      </teleport>
    </div>
  `,
  props: ['dishes', 'inventory'],
  emits: ['refresh'],
  setup(props, { emit }) {
    const showModal = ref(false);
    const isEditing = ref(false);
    const editingId = ref(null);
    const search = ref('');

    const activeTab = ref('details'); // details | recipe
    const savingDish = ref(false);

    const recipeLoading = ref(false);
    const recipeError = ref('');
    const recipeOriginal = ref([]); // [{ingredient_id, quantity_required, unit, ingredient_name}]
    const recipeDraft = ref([]);    // [{_key, ingredient_id, quantity_required, unit, ingredient_name}]

    const form = ref({
      name: '',
      description: '',
      category: '',
      photo_path: '',
      is_visible: true
    });

    const photoFile = ref(null);
    const photoPickedName = ref('');

    const ingredientsForSelect = Vue.computed(() => {
      const list = props.inventory || [];
      return list
        .filter(i => i && i.is_active !== false)
        .map(i => ({ id: Number(i.id), name: i.name, unit: i.unit, purchase_price_per_unit: Number(i.purchase_price_per_unit ?? 0) }))
        .filter(i => Number.isFinite(i.id) && i.id > 0);
    });

    const activeCategory = ref('All');

    const categoryPills = computed(() => {
      const set = new Set();
      for (const d of (props.dishes || [])) {
        const c = (d?.category || '').trim();
        if (c) set.add(c);
      }
      const list = Array.from(set);
      list.sort((a, b) => a.localeCompare(b));
      // Keep common categories in a nice order if present
      const preferred = ['Main Course', 'Starter', 'Breads', 'Beverages', 'Desserts', 'Thali', 'Sides'];
      const ordered = [];
      for (const p of preferred) {
        const idx = list.indexOf(p);
        if (idx >= 0) ordered.push(p);
      }
      for (const x of list) {
        if (!ordered.includes(x)) ordered.push(x);
      }
      return ['All', ...ordered];
    });

    const filteredDishes = computed(() => {
      const q = (search.value || '').trim().toLowerCase();
      const cat = String(activeCategory.value || 'All');
      const list = props.dishes || [];
      return list.filter((d) => {
        if (cat !== 'All') {
          const dc = String(d?.category || '').trim();
          if (dc !== cat) return false;
        }
        if (!q) return true;
        return (String(d?.name || '').toLowerCase().includes(q));
      });
    });

    const pillStyle = (active) => {
      const base = {
        border: '1.5px solid #E5DDD5',
        background: 'transparent',
        color: '#6B5744',
        borderRadius: '999px',
        padding: '0.4rem 0.9rem',
        fontSize: '0.85rem',
        fontWeight: '900',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: "'DM Sans', sans-serif",
      };
      if (active) return { ...base, background: '#6F4E37', color: '#F8F5F0', borderColor: '#6F4E37' };
      return base;
    };

    const fmtMoney = (v) => {
      const n = Number(v || 0);
      try {
        const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
        return `₹${f.format(Math.round(n || 0))}`;
      } catch {
        return `₹${Math.round(n || 0)}`;
      }
    };

    const marginPercent = (dish) => {
      const cost = Number(dish?.base_price ?? 0);
      const price = Number(dish?.selling_price ?? 0);
      // Use markup % (same meaning as Pricing slider): (price - cost) / cost * 100
      if (!price || price <= 0) return 0;
      if (!cost || cost <= 0) return 0;
      const pct = ((price - cost) / cost) * 100;
      const out = Math.round(Math.max(0, pct) * 10) / 10;
      return Number.isFinite(out) ? out : 0;
    };

    const ingredientCountLabel = (dish) => {
      const n = Number(dish?.ingredient_count ?? 0);
      const v = Number.isFinite(n) ? n : 0;
      return `${v} ingredient${v === 1 ? '' : 's'}`;
    };

    const dishEmoji = (dish) => {
      const c = String(dish?.category || '').toLowerCase();
      if (c.includes('bread')) return '🥖';
      if (c.includes('beverage') || c.includes('drink')) return '🥭';
      if (c.includes('dessert')) return '🍨';
      if (c.includes('starter')) return '🍢';
      if (c.includes('thali')) return '🍱';
      if (c.includes('side')) return '🥗';
      return '🍽️';
    };

    const _makeRowKey = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const addRecipeRow = () => {
      recipeError.value = '';
      recipeDraft.value.push({
        _key: _makeRowKey(),
        ingredient_id: 0,
        quantity_required: 0,
        unit: '',
        ingredient_name: ''
      });
    };

    const removeRecipeRow = (idx) => {
      recipeError.value = '';
      recipeDraft.value.splice(idx, 1);
    };

    const onSelectIngredient = (row) => {
      const ing = ingredientsForSelect.value.find(i => i.id === Number(row.ingredient_id));
      row.unit = ing ? ing.unit : '';
      row.ingredient_name = ing ? ing.name : '';
    };

    const _loadRecipeForDish = async (dishId) => {
      recipeLoading.value = true;
      recipeError.value = '';
      try {
        const res = await api.getDishIngredients(dishId);
        const list = (res && res.ingredients) ? res.ingredients : [];
        const normalized = list.map((x) => ({
          ingredient_id: Number(x.ingredient_id),
          quantity_required: Number(x.quantity_required || 0),
          unit: x.unit || '',
          ingredient_name: x.ingredient_name || ''
        })).filter(x => Number.isFinite(x.ingredient_id) && x.ingredient_id > 0);

        recipeOriginal.value = normalized;
        recipeDraft.value = normalized.map((x) => ({ _key: _makeRowKey(), ...x }));
      } catch (e) {
        recipeOriginal.value = [];
        recipeDraft.value = [];
        recipeError.value = e?.message || 'Failed to load recipe';
      } finally {
        recipeLoading.value = false;
      }
    };

    const _validateRecipeDraft = () => {
      recipeError.value = '';
      const rows = recipeDraft.value || [];

      const usable = rows
        .filter(r => Number(r.ingredient_id) > 0)
        .map(r => ({
          ingredient_id: Number(r.ingredient_id),
          quantity_required: Number(r.quantity_required || 0),
          unit: r.unit || '',
          ingredient_name: r.ingredient_name || ''
        }));

      const seen = new Set();
      for (const r of usable) {
        if (seen.has(r.ingredient_id)) {
          recipeError.value = 'Duplicate ingredient selected. Remove one of the duplicates.';
          return { ok: false, usable: [] };
        }
        seen.add(r.ingredient_id);
        if (!Number.isFinite(r.quantity_required) || r.quantity_required <= 0) {
          recipeError.value = 'Quantity required must be greater than 0 for each selected ingredient.';
          return { ok: false, usable: [] };
        }
      }

      return { ok: true, usable };
    };

    const computedCost = Vue.computed(() => {
      const { ok, usable } = _validateRecipeDraft();
      if (!ok) return 0;
      const priceMap = new Map(ingredientsForSelect.value.map(i => [i.id, Number(i.purchase_price_per_unit || 0)]));
      return usable.reduce((sum, r) => sum + (Number(r.quantity_required || 0) * (priceMap.get(r.ingredient_id) || 0)), 0);
    });

    const _syncRecipe = async (dishId) => {
      const { ok, usable } = _validateRecipeDraft();
      if (!ok) throw new Error(recipeError.value || 'Invalid recipe');

      const orig = recipeOriginal.value || [];
      const origMap = new Map(orig.map(r => [Number(r.ingredient_id), r]));
      const nextMap = new Map(usable.map(r => [Number(r.ingredient_id), r]));

      for (const [ingredientId, row] of nextMap.entries()) {
        const existing = origMap.get(ingredientId);
        if (!existing) {
          await api.addDishIngredient(dishId, { ingredient_id: ingredientId, quantity_required: row.quantity_required });
        } else if (Number(existing.quantity_required) !== Number(row.quantity_required)) {
          await api.editDishIngredient(dishId, ingredientId, { quantity_required: row.quantity_required });
        }
      }

      for (const [ingredientId] of origMap.entries()) {
        if (!nextMap.has(ingredientId)) {
          await api.removeDishIngredient(dishId, ingredientId);
        }
      }

      recipeOriginal.value = usable;
      recipeDraft.value = usable.map((x) => ({ _key: _makeRowKey(), ...x }));
    };

    const openAddModal = () => {
      form.value = {
        name: '',
        description: '',
        category: '',
        photo_path: '',
        is_visible: true
      };
      photoFile.value = null;
      photoPickedName.value = '';
      isEditing.value = false;
      editingId.value = null;
      activeTab.value = 'details';
      savingDish.value = false;
      recipeLoading.value = false;
      recipeError.value = '';
      recipeOriginal.value = [];
      recipeDraft.value = [];
      showModal.value = true;
    };

    const openEditModal = (dish) => {
      form.value = {
        name: dish.name,
        description: dish.description || '',
        category: dish.category || '',
        photo_path: dish.photo_path || '',
        is_visible: dish.is_visible !== false
      };
      photoFile.value = null;
      photoPickedName.value = '';
      isEditing.value = true;
      editingId.value = dish.id;
      activeTab.value = 'details';
      savingDish.value = false;
      recipeOriginal.value = [];
      recipeDraft.value = [];
      showModal.value = true;
      _loadRecipeForDish(dish.id);
    };

    const openRecipeEditor = (dish) => {
      openEditModal(dish);
      activeTab.value = 'recipe';
    };

    const closeModal = () => {
      showModal.value = false;
    };

    const onPhotoChange = (e) => {
      const f = e?.target?.files?.[0] || null;
      photoFile.value = f;
      photoPickedName.value = f ? f.name : '';
    };

    const saveDish = async () => {
      try {
        savingDish.value = true;
        recipeError.value = '';

        // Require recipe so cost can be computed from ingredients.
        const { ok, usable } = _validateRecipeDraft();
        if (!ok) {
          activeTab.value = 'recipe';
          throw new Error(recipeError.value || 'Invalid recipe');
        }
        if (!usable || usable.length === 0) {
          activeTab.value = 'recipe';
          recipeError.value = 'Add at least one ingredient to the recipe.';
          throw new Error(recipeError.value);
        }

        const payload = {
          name: (form.value.name || '').trim(),
          description: (form.value.description || '').trim(),
          category: (form.value.category || '').trim() || null,
          // Save computed COST into base_price.
          base_price: Number(computedCost.value || 0),
          photo_path: (form.value.photo_path || '').trim() || null,
          is_visible: !!form.value.is_visible
        };

        // If user selected a new image, upload first and store returned path.
        if (photoFile.value) {
          const up = await api.uploadImage(photoFile.value);
          if (up && up.path) {
            payload.photo_path = up.path;
          }
        }

        let result;
        let dishId;
        if (isEditing.value) {
          dishId = editingId.value;
          result = await api.editDish(dishId, payload);
        } else {
          result = await api.addDish(payload);
          dishId = result?.dish?.id;
        }

        if (result.success) {
          if (dishId) {
            await _syncRecipe(dishId);
          }
          closeModal();
          emit('refresh', { type: 'menu' });
        }
      } catch (e) {
        const msg = recipeError.value || e.message;
        alert('Error saving dish: ' + msg);
      } finally {
        savingDish.value = false;
      }
    };

    const deleteDish = async (dish) => {
      if (confirm(`Delete "${dish.name}"?`)) {
        try {
          const result = await api.deleteDish(dish.id);
          if (result.success) {
            emit('refresh', { type: 'menu' });
          }
        } catch (e) {
          alert('Error deleting dish: ' + e.message);
        }
      }
    };

    const toggleVisibility = async (dish) => {
      try {
        const result = await api.editDish(dish.id, { is_visible: !(dish.is_visible !== false) });
        if (result.success) {
          emit('refresh', { type: 'menu' });
        }
      } catch (e) {
        alert('Error updating visibility: ' + e.message);
      }
    };

    const photoSrc = (p) => {
      const path = (p || '').trim();
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      if (path.startsWith('/')) return path;
      return `/${path}`;
    };

    return {
      showModal,
      isEditing,
      search,
      activeCategory,
      categoryPills,
      pillStyle,
      fmtMoney,
      marginPercent,
      ingredientCountLabel,
      dishEmoji,
      form,
      photoPickedName,
      activeTab,
      savingDish,
      recipeLoading,
      recipeError,
      recipeDraft,
      ingredientsForSelect,
      computedCost,
      filteredDishes,
      openAddModal,
      openEditModal,
      openRecipeEditor,
      closeModal,
      onPhotoChange,
      saveDish,
      deleteDish,
      toggleVisibility,
      addRecipeRow,
      removeRecipeRow,
      onSelectIngredient,
      photoSrc
    };
  }
};
