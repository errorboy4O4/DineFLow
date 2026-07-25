import api from '../js/api.js';

export default {
  template: `
    <div class="slide-up">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5" style="align-items:stretch;">
        <!-- LEFT: Dish selector + Ingredient details -->
        <div class="panel" style="display:flex;flex-direction:column;min-height:0;">
          <div style="padding:1rem;border-bottom:1px solid rgba(111,78,55,0.1);flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:0.6rem;background:#FFFCF8;border:1.5px solid #E5DDD5;border-radius:0.75rem;padding:0.6rem 0.8rem;">
              <i class="bi bi-search" style="color:#9C8E84;"></i>
              <input v-model="search" type="text" placeholder="Search dishes..."
                     style="width:100%;border:none;outline:none;background:transparent;font-size:0.95rem;font-family:'DM Sans',sans-serif;" />
            </div>
          </div>

          <!-- single scroll area: only left panel scrolls (scrollbar hidden) -->
          <div ref="leftScroller" class="scroll-y scrollbar-hidden" style="flex:1;min-height:0;max-height:calc(100vh - 280px);">
            <!-- Dish list -->
            <div>
              <div v-for="dish in filteredDishes" :key="dish.id"
                   @click="selectDish(dish)"
                   :style="{ background: selectedDish?.id === dish.id ? '#FDF4ED' : 'transparent', borderLeft: selectedDish?.id === dish.id ? '4px solid #6F4E37' : '4px solid transparent' }"
                   style="display:flex;align-items:center;gap:0.85rem;padding:0.85rem 1rem;cursor:pointer;border-bottom:1px solid rgba(111,78,55,0.06);transition:background 0.15s;">
                <div style="width:44px;height:44px;border-radius:12px;overflow:hidden;background:#F0EBE3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="font-size:1.35rem;">{{ dishEmoji(dish) }}</span>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:900;font-size:0.93rem;color:#1A1208;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    {{ dish.name }}
                  </div>
                  <div style="font-size:0.75rem;color:#9C8E84;font-weight:800;margin-top:0.1rem;">
                    {{ dish.category || 'Uncategorized' }} · {{ ingredientCountLabel(dish) }}
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-weight:900;font-size:0.98rem;color:#1A1208;">{{ fmtMoney(dish.selling_price ?? 0) }}</div>
                  <div style="font-size:0.72rem;color:#9C8E84;font-weight:900;">cost {{ fmtMoney(dish.base_price ?? 0) }}</div>
                </div>
                <button @click.stop="openIngredientsFromRow(dish)"
                        title="View ingredients"
                        style="border:none;background:transparent;cursor:pointer;padding:0.25rem;margin-left:0.35rem;display:flex;align-items:center;justify-content:center;color:#9C8E84;">
                  <i class="bi bi-chevron-right"></i>
                </button>
              </div>

              <div v-if="!filteredDishes.length" style="padding:1.25rem;text-align:center;color:#9C8E84;font-weight:900;">
                No dishes found
              </div>
            </div>

            <!-- Ingredient Details (collapsible) -->
            <div ref="ingredientsBlock" style="border-top:1px solid rgba(111,78,55,0.1);">
              <button @click="ingredientsOpen = !ingredientsOpen"
                      :disabled="!selectedDish"
                      style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;border:none;background:#FFFCF8;border-bottom:1px solid rgba(111,78,55,0.1);cursor:pointer;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                  <i class="bi bi-journals" style="color:#6F4E37;"></i>
                  <div style="font-weight:900;color:#1A1208;">
                    Ingredient Details
                    <span style="font-weight:800;color:#9C8E84;">({{ (dishIngredients?.length || 0) }} items)</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  <div style="color:#9C8E84;font-weight:900;font-size:0.82rem;">
                    Total cost: <span style="color:#E63946;">{{ fmtMoney(ingredientsTotalCost) }}</span>
                  </div>
                  <i :class="ingredientsOpen ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" style="color:#6B5744;"></i>
                </div>
              </button>

              <div v-show="ingredientsOpen">
                <table class="data-table pricing-ingredient-table" style="border-top:none;">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Cost</th>
                      <th style="text-align:right;">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in (dishIngredients || [])" :key="row.id">
                      <td style="font-weight:900;">{{ row.ingredient_name }}</td>
                      <td>{{ fmtQty(row.quantity_required) }}</td>
                      <td><span style="background:#F0EBE3;color:#6B5744;font-weight:900;border-radius:999px;padding:0.12rem 0.55rem;font-size:0.72rem;">{{ row.unit }}</span></td>
                      <td style="color:#E63946;font-weight:900;">{{ fmtMoney(row.total_cost) }}</td>
                      <td style="text-align:right;">
                        <div style="display:flex;align-items:center;justify-content:flex-end;gap:0.6rem;">
                          <div style="width:68px;height:4px;background:#EDE8E0;border-radius:999px;overflow:hidden;">
                            <div :style="\`height:4px;width:\${row.share_percent}%;background:#6F4E37;border-radius:999px;\`"></div>
                          </div>
                          <div style="min-width:42px;text-align:right;font-weight:900;color:#8B6347;">{{ row.share_percent }}%</div>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!dishIngredients || dishIngredients.length === 0">
                      <td colspan="5" style="padding:1.1rem;text-align:center;color:#9C8E84;font-weight:900;">
                        Select a dish to see ingredients
                      </td>
                    </tr>
                    <tr v-if="dishIngredients && dishIngredients.length">
                      <td colspan="3" style="font-weight:900;color:#1A1208;background:#FFF4DA;">Total Food Cost</td>
                      <td colspan="2" style="text-align:right;font-weight:900;color:#E63946;background:#FFF4DA;">{{ fmtMoney(ingredientsTotalCost) }}</td>
                    </tr>
                  </tbody>
                </table>

                <div v-if="dishIngredients && dishIngredients.length" style="padding:0.85rem 1rem;border-top:1px solid rgba(111,78,55,0.08);color:#9C8E84;font-weight:800;font-size:0.85rem;">
                  Edit ingredient unit-cost below to recalculate price →
                </div>

                <div v-if="dishIngredients && dishIngredients.length" style="padding:0 1rem 1rem;">
                  <div v-for="row in dishIngredients" :key="'edit_'+row.id"
                       style="display:flex;align-items:center;gap:0.75rem;padding:0.7rem 0;border-bottom:1px solid rgba(111,78,55,0.06);">
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:900;color:#1A1208;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.86rem;">{{ row.ingredient_name }}</div>
                      <div style="margin-top:0.12rem;color:#9C8E84;font-weight:800;font-size:0.78rem;">
                        {{ fmtQty(row.quantity_required) }} {{ row.unit }}
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                      <span style="color:#9C8E84;font-weight:900;">₹</span>
                      <input type="number" step="0.01"
                             :value="ingredientPriceDraft[row.ingredient_id]"
                             @input="onIngredientPriceInput(row.ingredient_id, $event.target.value)"
                             @blur="commitIngredientPrice(row.ingredient_id)"
                             style="width:88px;padding:0.55rem 0.7rem;border:1.5px solid #E5DDD5;border-radius:0.7rem;background:#FFFCF8;font-weight:900;font-family:'DM Sans',sans-serif;" />
                      <span style="color:#9C8E84;font-weight:900;">/{{ row.unit }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Profit Margin & Final Price -->
        <div class="panel" style="display:flex;flex-direction:column;min-height:0;">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:900;font-size:1rem;">Profit Margin & Final Price</h3>
            <p v-if="selectedDish" style="font-size:0.85rem;color:#9C8E84;margin-top:2px;font-weight:800;">for {{ selectedDish.name }}</p>
            <p v-else style="font-size:0.85rem;color:#9C8E84;margin-top:2px;font-weight:800;">Select a dish to begin</p>
          </div>

          <div style="padding:1.25rem;flex:1;">
            <div style="text-align:center;padding:1.35rem 1.1rem;background:linear-gradient(135deg,#4A3423,#6F4E37);border-radius:1rem;margin-bottom:1.05rem;color:#F8F5F0;">
              <div style="font-size:0.75rem;opacity:0.85;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.35rem;">Final Selling Price</div>
              <div style="font-family:'Playfair Display',serif;font-size:clamp(2.2rem, 4.2vh, 3rem);font-weight:900;line-height:1;">
                {{ fmtMoney(finalPrice || 0) }}
              </div>
              <div v-if="selectedDish" style="font-size:0.85rem;opacity:0.75;margin-top:0.55rem;font-weight:800;">
                {{ fmtMoney(cost || 0) }} cost + {{ profitMargin }}% margin
              </div>
            </div>

            <div style="margin-bottom:0.95rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem;">
                <label style="font-weight:900;font-size:0.95rem;">Profit Margin</label>
                <span style="background:#F0EBE3;padding:0.25rem 0.85rem;border-radius:2rem;font-weight:900;font-size:0.95rem;color:#6F4E37;">{{ profitMargin }}%</span>
              </div>
              <input type="range" v-model.number="profitMargin" min="0" max="200" step="1" style="width:100%;" :disabled="!selectedDish" />
              <div style="display:flex;justify-content:space-between;margin-top:0.5rem;color:#9C8E84;font-weight:900;font-size:0.8rem;">
                <span>0%</span>
                <span>200%</span>
              </div>
            </div>

            <!-- Cost/Profit bars -->
            <div style="background:#F8F5F0;border-radius:0.9rem;padding:0.9rem 1rem;margin-bottom:0.95rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;font-weight:900;">
                <div>Cost</div>
                <div style="color:#E63946;">{{ fmtMoney(cost) }} ({{ costSharePercent }}%)</div>
              </div>
              <div style="height:6px;background:#EDE8E0;border-radius:999px;overflow:hidden;margin-top:0.5rem;">
                <div :style="\`height:6px;width:\${costSharePercent}%;background:#E63946;border-radius:999px;\`"></div>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;font-weight:900;margin-top:0.9rem;">
                <div>Profit</div>
                <div style="color:#2A9D8F;">{{ fmtMoney(profitAmount) }} ({{ profitSharePercent }}%)</div>
              </div>
              <div style="height:6px;background:#EDE8E0;border-radius:999px;overflow:hidden;margin-top:0.5rem;">
                <div :style="\`height:6px;width:\${profitSharePercent}%;background:#2A9D8F;border-radius:999px;\`"></div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3" style="margin-bottom:0.95rem;">
              <div style="background:#FEF3C7;border-radius:0.85rem;padding:0.85rem 0.9rem;text-align:center;">
                <div style="font-size:0.7rem;color:#92400E;font-weight:900;text-transform:uppercase;">Break Even</div>
                <div style="margin-top:0.15rem;font-weight:900;color:#92400E;font-size:1.05rem;">{{ fmtMoney(cost) }}</div>
              </div>
              <div style="background:#D1F5F0;border-radius:0.85rem;padding:0.85rem 0.9rem;text-align:center;">
                <div style="font-size:0.7rem;color:#1A6B63;font-weight:900;text-transform:uppercase;">Profit/Dish</div>
                <div style="margin-top:0.15rem;font-weight:900;color:#1A6B63;font-size:1.05rem;">{{ fmtMoney(profitAmount) }}</div>
              </div>
              <div style="background:#F0EBE3;border-radius:0.85rem;padding:0.85rem 0.9rem;text-align:center;">
                <div style="font-size:0.7rem;color:#6B5744;font-weight:900;text-transform:uppercase;">Final Price</div>
                <div style="margin-top:0.15rem;font-weight:900;color:#1A1208;font-size:1.05rem;">{{ fmtMoney(finalPrice) }}</div>
              </div>
            </div>

            <button @click="applyPrice" class="btn-primary" style="width:100%;border-radius:0.85rem;padding:0.85rem 1rem;font-size:1rem;font-weight:900;" :disabled="!selectedDish || saving">
              <i class="bi bi-check-circle"></i>
              <span v-if="saving" style="margin-left:0.5rem;">Saving...</span>
              <span v-else style="margin-left:0.5rem;">Apply Price to Menu</span>
            </button>

            <div v-if="error" style="margin-top:1rem;background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem;font-weight:900;">
              {{ error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  props: ['dishes'],
  emits: ['refresh'],
  data() {
    return {
      selectedDish: null,
      profitMargin: 30,
      search: '',
      saving: false,
      error: '',
      dishIngredients: [],
      ingredientsOpen: false,
      ingredientPriceDraft: {},
      ingredientLoading: false,
      marginDirty: false,
      _settingMargin: false,
    };
  },
  computed: {
    filteredDishes() {
      const q = (this.search || '').trim().toLowerCase();
      const list = this.dishes || [];
      if (!q) return list;
      return list.filter(d => (d.name || '').toLowerCase().includes(q));
    },
    cost() {
      if (!this.selectedDish) return 0;
      const total = Number(this.ingredientsTotalCost || 0);
      return total > 0 ? total : Number(this.selectedDish.base_price || 0);
    },
    finalPrice() {
      if (!this.selectedDish) return 0;
      const c = this.cost;
      return c + (c * (Number(this.profitMargin || 0) / 100));
    },
    profitAmount() {
      const fp = Number(this.finalPrice || 0);
      const c = Number(this.cost || 0);
      return Math.max(0, fp - c);
    },
    costSharePercent() {
      const fp = Number(this.finalPrice || 0);
      const c = Number(this.cost || 0);
      if (!fp || fp <= 0) return 0;
      return Math.round((c / fp) * 100);
    },
    profitSharePercent() {
      const fp = Number(this.finalPrice || 0);
      if (!fp || fp <= 0) return 0;
      return Math.max(0, 100 - this.costSharePercent);
    },
    ingredientsTotalCost() {
      const list = this.dishIngredients || [];
      let sum = 0;
      for (const r of list) sum += Number(r?.total_cost || 0) || 0;
      return Math.round(sum * 100) / 100;
    }
  },
  methods: {
    fmtMoney(v) {
      const n = Number(v || 0);
      try {
        const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
        return `₹${f.format(Math.round(n || 0))}`;
      } catch {
        return `₹${Math.round(n || 0)}`;
      }
    },
    fmtQty(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v ?? '');
      const out = Math.round(n * 100) / 100;
      return String(out);
    },
    dishEmoji(dish) {
      const c = String(dish?.category || '').toLowerCase();
      if (c.includes('bread')) return '🥖';
      if (c.includes('beverage') || c.includes('drink')) return '🥤';
      if (c.includes('dessert')) return '🍨';
      if (c.includes('starter')) return '🍢';
      if (c.includes('thali')) return '🍱';
      if (c.includes('side')) return '🥗';
      return '🍽️';
    },
    ingredientCountLabel(dish) {
      const n = Number(dish?.ingredient_count ?? 0);
      const v = Number.isFinite(n) ? n : 0;
      return `${v} ingredient${v === 1 ? '' : 's'}`;
    },
    _setProfitMarginSafely(pct) {
      this._settingMargin = true;
      this.profitMargin = pct;
      this._settingMargin = false;
    },
    _syncMarginFromPrices(costOverride = null) {
      if (!this.selectedDish) return;
      try {
        const cost = costOverride !== null ? Number(costOverride || 0) : Number(this.cost || 0);
        const price = Number(this.selectedDish?.selling_price || 0);
        if (cost > 0 && price > 0) {
          const pct = ((price - cost) / cost) * 100;
          const rounded = Math.round(pct);
          const next = Math.max(0, Math.min(200, Number.isFinite(rounded) ? rounded : this.profitMargin));
          this._setProfitMarginSafely(next);
        }
      } catch {}
    },
    selectDish(dish, opts = {}) {
      this.selectedDish = dish;
      this.error = '';
      this.ingredientsOpen = Boolean(opts.openIngredients);
      this.marginDirty = false;

      this._syncMarginFromPrices(Number(dish?.base_price || 0));
      this.loadDishIngredients();

      if (opts.openIngredients) {
        this.$nextTick(() => this.scrollToIngredients());
      }
    },
    openIngredientsFromRow(dish) {
      try {
        if (this.selectedDish?.id === dish?.id) {
          this.ingredientsOpen = true;
          this.$nextTick(() => this.scrollToIngredients());
          return;
        }
      } catch {}
      this.selectDish(dish, { openIngredients: true });
    },
    scrollToIngredients() {
      try {
        const scroller = this.$refs?.leftScroller;
        const target = this.$refs?.ingredientsBlock;
        if (!scroller || !target) return;
        const sRect = scroller.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        const top = (tRect.top - sRect.top) + scroller.scrollTop;
        scroller.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
      } catch {}
    },
    async loadDishIngredients() {
      this.dishIngredients = [];
      this.ingredientPriceDraft = {};
      if (!this.selectedDish) return;
      this.ingredientLoading = true;
      try {
        const res = await api.getDishIngredients(this.selectedDish.id);
        const list = (res && res.ingredients) ? res.ingredients : [];
        const total = list.reduce((a, r) => a + (Number(r?.total_cost || 0) || 0), 0) || 0;
        this.dishIngredients = list.map((r) => {
          const tc = Number(r?.total_cost || 0) || 0;
          const share = total > 0 ? Math.round((tc / total) * 100) : 0;
          return { ...r, share_percent: share };
        });
        for (const r of this.dishIngredients) {
          this.ingredientPriceDraft[r.ingredient_id] = Number(r?.price_per_unit || 0) || 0;
        }

        if (!this.marginDirty && this.dishIngredients.length) {
          this._syncMarginFromPrices(this.ingredientsTotalCost);
        }
      } catch (e) {
        this.dishIngredients = [];
      } finally {
        this.ingredientLoading = false;
      }
    },
    onIngredientPriceInput(ingredientId, value) {
      const id = Number(ingredientId);
      if (!Number.isFinite(id)) return;
      this.ingredientPriceDraft[id] = value === '' ? '' : Number(value);
    },
    async commitIngredientPrice(ingredientId) {
      const id = Number(ingredientId);
      if (!Number.isFinite(id) || !this.selectedDish) return;
      const next = Number(this.ingredientPriceDraft[id]);
      if (!Number.isFinite(next) || next < 0) return;

      try {
        await api.editIngredient(id, { purchase_price_per_unit: next });
        await this.loadDishIngredients();
      } catch (e) {
        this.error = e?.message || 'Failed to update ingredient cost';
      }
    },
    async applyPrice() {
      if (!this.selectedDish) return;
      this.error = '';
      this.saving = true;
      try {
        const result = await api.editDish(this.selectedDish.id, { selling_price: Number(this.finalPrice || 0) });
        if (result && result.success) {
          this.$emit('refresh', { type: 'menu' });
        }
      } catch (e) {
        this.error = e?.message || 'Failed to update price';
      } finally {
        this.saving = false;
      }
    }
  },
  mounted() {
    try {
      const list = this.dishes || [];
      if (list.length && !this.selectedDish) {
        this.selectDish(list[0]);
      }
    } catch {}
  },
  watch: {
    profitMargin() {
      if (this._settingMargin) return;
      if (this.selectedDish) this.marginDirty = true;
    },
    dishes: {
      handler() {
        try {
          if (this.selectedDish && (this.dishes || []).some(d => d.id === this.selectedDish.id)) return;
          const list = this.dishes || [];
          if (list.length) this.selectDish(list[0]);
        } catch {}
      },
      deep: true
    }
  }
};
