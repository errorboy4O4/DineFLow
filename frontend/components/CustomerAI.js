import api from '../js/api.js';

const { ref } = Vue;

export default {
  props: {
    session: { type: Object, default: null }
  },
  emits: ['close', 'order-created'],
  template: `
    <div style="padding:1rem 1rem 1.25rem;">
      <div style="background:linear-gradient(135deg,#4A3423,#6F4E37);border-radius:1.2rem;padding:1.1rem 1rem;color:white;box-shadow:0 14px 34px rgba(74,52,35,0.26);text-align:center;">
        <div style="width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;margin:0 auto 0.65rem;">
          <i class="bi bi-magic" style="font-size:1.35rem;"></i>
        </div>
        <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.25rem;">Build Your Perfect Dish</div>
        <div style="opacity:0.88;font-weight:800;font-size:0.86rem;margin-top:0.35rem;">Tell our AI what you are craving and we will create a custom recipe.</div>
      </div>

      <!-- Category Selection -->
      <div style="margin-top:0.9rem;background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);padding:0.95rem 0.95rem;">
        <div style="font-weight:900;margin-bottom:0.65rem;">Dish Category</div>
        <select v-model="category" style="width:100%;padding:0.75rem 0.8rem;border:1.5px solid #E5DDD5;border-radius:0.95rem;background:#FAFAF7;font-weight:900;">
          <option value="">-- Select Category --</option>
          <option>Main Course</option>
          <option>Starter</option>
          <option>Breads</option>
          <option>Beverages</option>
          <option>Desserts</option>
          <option>Sides</option>
          <option>Thali</option>
        </select>
      </div>

      <!-- Craving Description -->
      <div style="margin-top:0.85rem;background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;box-shadow:0 2px 12px rgba(111,78,55,0.06);padding:0.95rem 0.95rem;">
        <div style="font-weight:900;margin-bottom:0.65rem;">Describe Your Craving</div>
        <textarea v-model="prompt" placeholder="e.g. Creamy chicken curry with lots of spices..." style="width:100%;min-height:96px;resize:none;padding:0.75rem 0.8rem;border:1.5px solid #E5DDD5;border-radius:0.95rem;background:#FAFAF7;font-weight:800;"></textarea>

        <button class="btn-primary" style="width:100%;margin-top:0.75rem;" @click="generate" :disabled="loading || !category">
          <span v-if="loading"><i class="bi bi-hourglass-split"></i> Generating...</span>
          <span v-else><i class="bi bi-stars"></i> Generate Recipe</span>
        </button>

        <div v-if="error" style="margin-top:0.75rem;background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 0.85rem;border-radius:0.95rem;font-weight:900;">
          {{ error }}
        </div>

        <!-- Generated Recipe Display -->
        <div v-if="dish && !showConfirmation" style="margin-top:0.85rem;background:#FAFAF7;border:1.5px dashed rgba(111,78,55,0.25);border-radius:1rem;padding:0.9rem;">
          <div style="display:flex;gap:0.6rem;align-items:center;justify-content:space-between;">
            <div style="min-width:0;">
              <div style="font-weight:1000;color:#1A1208;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ dish.name }}</div>
              <div style="color:#9C8E84;font-weight:900;font-size:0.8rem;margin-top:0.15rem;">{{ dish.category || 'Uncategorized' }}</div>
            </div>
          </div>

          <div style="margin-top:0.6rem;color:#6B5744;font-weight:900;font-size:0.95rem;line-height:1.4;">{{ dish.description }}</div>

          <div style="margin-top:0.75rem;background:white;padding:0.7rem;border-radius:0.85rem;border:1.5px solid rgba(111,78,55,0.10);">
            <div style="font-weight:1000;color:#4A3423;margin-bottom:0.4rem;">Ingredients</div>
            <div style="display:flex;flex-direction:column;gap:0.3rem;font-weight:800;color:#6B5744;font-size:0.85rem;">
              <div v-for="(ing, idx) in (dish.ingredients || []).slice(0,5)" :key="idx">
                <template v-if="fmtQty(ing.qty)">
                  {{ ing.name }}: {{ fmtQty(ing.qty) }} {{ ing.unit }}
                </template>
              </div>
              <div v-if="(dish.ingredients || []).length > 5" style="font-style:italic;color:#9C8E84;">...and {{ (dish.ingredients || []).length - 5 }} more</div>
            </div>
          </div>

          <div style="margin-top:0.75rem;display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
            <button @click="showConfirmation=true" style="background:#4A3423;color:white;border:none;padding:0.65rem;border-radius:0.85rem;font-weight:900;cursor:pointer;">
              <i class="bi bi-check-circle"></i> Yes, Order This
            </button>
            <button @click="resetForm" style="background:white;color:#6B5744;border:1.5px solid #E5DDD5;padding:0.65rem;border-radius:0.85rem;font-weight:900;cursor:pointer;">
              <i class="bi bi-x-circle"></i> Try Again
            </button>
          </div>
        </div>

        <!-- Confirmation Screen -->
        <div v-if="showConfirmation && dish" style="margin-top:0.85rem;background:#F5E8DC;border:1.5px solid rgba(111,78,55,0.25);border-radius:1rem;padding:0.9rem;">
          <div style="font-weight:1000;color:#4A3423;margin-bottom:0.6rem;font-size:1rem;"><i class="bi bi-info-circle"></i> Send to Manager for Approval</div>
          <div style="color:#6B5744;font-weight:900;font-size:0.9rem;line-height:1.5;margin-bottom:0.75rem;">
            Your custom dish "{{ dish.name }}" will be submitted to the manager. Once approved, the recipe will be sent to the kitchen chef for preparation.
            <span style="display:block;margin-top:0.45rem;">
              Note: This dish is AI-generated. Taste can vary from person to person—please order at your own responsibility.
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
            <button @click="confirmOrder" :disabled="confirming" style="background:#2D9D63;color:white;border:none;padding:0.65rem;border-radius:0.85rem;font-weight:900;cursor:pointer;">
              <span v-if="confirming"><i class="bi bi-hourglass-split"></i> Sending...</span>
              <span v-else><i class="bi bi-check2"></i> Confirm</span>
            </button>
            <button @click="showConfirmation=false" style="background:white;color:#6B5744;border:1.5px solid #E5DDD5;padding:0.65rem;border-radius:0.85rem;font-weight:900;cursor:pointer;">
              <i class="bi bi-arrow-left"></i> Back
            </button>
          </div>
        </div>

        <!-- Success Message -->
        <div v-if="success" style="margin-top:0.75rem;background:#DCEFDC;border:1.5px solid #2D9D63;color:#1B5E20;padding:0.75rem 0.85rem;border-radius:0.95rem;font-weight:900;">
          <i class="bi bi-check-circle"></i> {{ success }}
        </div>
      </div>

      <div style="margin-top:0.85rem;color:#9C8E84;font-weight:900;font-size:0.78rem;line-height:1.25;">Note: We use AI to generate recipes using available ingredients.</div>
    </div>
  `,

  setup(props, { emit }) {
    const category = ref('');
    const prompt = ref('');
    const loading = ref(false);
    const error = ref('');
    const dish = ref(null);
    const showConfirmation = ref(false);
    const confirming = ref(false);
    const success = ref('');

    const fmtQty = (v) => {
      const n = Number(v || 0);
      if (!Number.isFinite(n) || n <= 0) return '';
      // Avoid showing "0" due to rounding for small quantities like 0.05 kg
      if (n < 1) {
        const s = n.toFixed(2);
        return s.replace(/\.?0+$/, '');
      }
      if (n < 10 && Math.round(n) !== n) {
        const s = n.toFixed(1);
        return s.replace(/\.?0+$/, '');
      }
      return String(Math.round(n));
    };

    const generate = async () => {
      error.value = '';
      success.value = '';
      dish.value = null;

      if (!category.value.trim()) {
        error.value = 'Please select a category.';
        return;
      }

      const s = props.session;
      if (!s || !s.table_number || !s.table_token) {
        error.value = 'Select a table first.';
        return;
      }

      loading.value = true;
      try {
        const res = await api.generateCustomerAIDish({
          table_number: s.table_number,
          table_token: s.table_token,
          category: category.value,
          prompt: (prompt.value || '').trim(),
        });

        if (res && res.success && res.dish) {
          dish.value = res.dish;
          showConfirmation.value = false;
        } else {
          error.value = res.error || 'Failed to generate recipe.';
        }
      } catch (e) {
        error.value = (e && e.message) ? e.message : 'Failed to generate recipe.';
      } finally {
        loading.value = false;
      }
    };

    const confirmOrder = async () => {
      if (!dish.value) return;
      
      const s = props.session;
      if (!s || !s.table_number || !s.table_token) {
        error.value = 'Invalid session.';
        return;
      }

      confirming.value = true;
      try {
        const res = await api.createCustomDishOrder({
          table_number: s.table_number,
          table_token: s.table_token,
          dish_data: dish.value,
        });

        if (res && res.success) {
          if (res.batch) emit('order-created', res.batch);
          success.value = 'Order submitted to manager! It will appear in the kitchen once approved.';
          setTimeout(() => {
            resetForm();
          }, 2000);
        } else {
          error.value = res.error || 'Failed to create order.';
        }
      } catch (e) {
        error.value = (e && e.message) ? e.message : 'Failed to create order.';
      } finally {
        confirming.value = false;
        showConfirmation.value = false;
      }
    };

    const resetForm = () => {
      category.value = '';
      prompt.value = '';
      dish.value = null;
      error.value = '';
      success.value = '';
      showConfirmation.value = false;
    };

    return {
      category,
      prompt,
      loading,
      error,
      dish,
      showConfirmation,
      confirming,
      success,
      fmtQty,
      generate,
      confirmOrder,
      resetForm,
    };
  }
};
