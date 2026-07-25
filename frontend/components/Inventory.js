import api from '../js/api.js';

const { ref, computed, watch } = Vue;

export default {
  template: `
    <div class="slide-up">
      <!-- Top controls (match reference layout; no category filters) -->
      <div class="flex flex-wrap gap-3 items-center mb-4" style="row-gap:0.75rem;">
        <div style="flex:1;min-width:260px;max-width:420px;">
          <div style="display:flex;align-items:center;gap:0.6rem;background:white;border:1.5px solid #E5DDD5;border-radius:0.75rem;padding:0.55rem 0.75rem;">
            <i class="bi bi-search" style="color:#9C8E84;"></i>
            <input v-model="search" type="text" placeholder="Search ingredients..."
                   style="width:100%;border:none;outline:none;font-size:0.95rem;color:#1A1208;background:transparent;font-family:'DM Sans',sans-serif;" />
          </div>
        </div>

        <div class="flex flex-wrap gap-2 items-center" style="flex:1;justify-content:flex-end;">
          <button @click="setFilter('all')"
                  :style="pillStyle(activeFilter === 'all')">
            All
          </button>
          <button @click="setFilter('out')"
                  :style="pillStyle(activeFilter === 'out', true)">
            {{ outCount }} Out
          </button>
          <button @click="setFilter('low')"
                  :style="pillStyle(activeFilter === 'low', false, true)">
            {{ lowCount }} Low
          </button>

          <button @click="openAddModal" class="btn-primary"
                  style="display:flex;align-items:center;gap:0.5rem;border-radius:0.75rem;padding:0.65rem 1.15rem;">
            <i class="bi bi-plus-lg"></i> Add Ingredient
          </button>
        </div>
      </div>

      <div class="panel" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th style="min-width:180px;">Current Stock</th>
              <th style="min-width:130px;">Threshold</th>
              <th style="min-width:110px;">Status</th>
              <th style="min-width:180px;">Level</th>
              <th style="min-width:180px;">Cost/Unit</th>
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredInventory" :key="item.id">
              <td style="font-weight:800;">{{ item.name }}</td>

              <!-- Current Stock (inline editable) -->
              <td>
                <div style="display:flex;align-items:center;gap:0.55rem;">
                  <input
                    type="number"
                    :value="drafts[item.id]?.stock"
                    @input="onDraftInput(item.id, 'stock', $event.target.value)"
                    @blur="commitDraft(item, 'stock')"
                    style="width:84px;padding:0.5rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.6rem;background:#FFFCF8;font-weight:700;color:#1A1208;font-family:'DM Sans',sans-serif;"
                  />
                  <span style="color:#6B5744;font-weight:800;">{{ item.unit }}</span>
                </div>
              </td>

              <!-- Threshold (display) -->
              <td style="color:#6B5744;font-weight:800;">
                {{ fmtQty(item.threshold) }} {{ item.unit }}
              </td>

              <!-- Status pill -->
              <td>
                <span :class="statusClass(item)" class="badge" style="font-weight:900;">
                  {{ statusText(item) }}
                </span>
              </td>

              <!-- Level bar -->
              <td>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  <div style="flex:1;height:7px;background:#EDE8E0;border-radius:999px;overflow:hidden;min-width:120px;">
                    <div :style="\`height:7px;width:\${levelPercent(item)}%;background:\${levelColor(item)};border-radius:999px;\`"></div>
                  </div>
                  <span style="color:#9C8E84;font-weight:900;min-width:44px;text-align:right;">{{ levelLabel(item) }}</span>
                </div>
              </td>

              <!-- Cost/Unit (inline editable) -->
              <td>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <span style="color:#9C8E84;font-weight:900;">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    :value="drafts[item.id]?.cost"
                    @input="onDraftInput(item.id, 'cost', $event.target.value)"
                    @blur="commitDraft(item, 'cost')"
                    style="width:92px;padding:0.5rem 0.65rem;border:1.5px solid #E5DDD5;border-radius:0.6rem;background:#FFFCF8;font-weight:700;color:#1A1208;font-family:'DM Sans',sans-serif;"
                  />
                  <span style="color:#9C8E84;font-weight:900;">/ {{ item.unit }}</span>
                </div>
              </td>

              <td style="text-align:center;">
                <button @click="openEditModal(item)" style="padding:0.45rem 0.7rem;border-radius:0.65rem;background:#F0EBE3;color:#6F4E37;border:none;cursor:pointer;font-size:0.85rem;margin-right:0.35rem;">
                  <i class="bi bi-pencil"></i>
                </button>
                <button @click="deleteIngredient(item)" style="padding:0.45rem 0.7rem;border-radius:0.65rem;background:#FEE2E2;color:#E63946;border:none;cursor:pointer;font-size:0.85rem;">
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="(!inventory || inventory.length === 0)" style="padding:3rem;text-align:center;color:#9C8E84;">
          <i class="bi bi-inbox" style="display:block;font-size:2rem;margin-bottom:0.5rem;"></i>
          No ingredients. Add one to get started.
        </div>
        <div v-else-if="filteredInventory.length === 0" style="padding:2.25rem;text-align:center;color:#9C8E84;">
          <i class="bi bi-filter" style="display:block;font-size:2rem;margin-bottom:0.5rem;"></i>
          No results for this filter/search.
        </div>
      </div>

      <!-- ADD/EDIT MODAL -->
      <!-- Teleport to <body> so the modal stays centered on the screen even inside scroll/transform containers -->
      <teleport to="body">
        <div v-show="showModal"
             @click.self="closeModal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem;overflow:auto;">
          <div style="background:white;border-radius:1.25rem;padding:2rem;width:100%;max-width:520px;max-height:calc(100vh - 2rem);overflow:auto;box-shadow:0 24px 48px rgba(0,0,0,0.2);">
            <h2 style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.5rem;margin-bottom:1.5rem;color:#1A1208;">{{ isEditing ? 'Edit Ingredient' : 'Add Ingredient' }}</h2>
            <div style="display:flex;flex-direction:column;gap:1.25rem;">
              <div>
                <label style="display:block;font-weight:600;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Ingredient Name *</label>
                <input v-model="form.name" type="text" placeholder="e.g. Butter" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div>
                  <label style="display:block;font-weight:600;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Unit *</label>
                  <input v-model="form.unit" type="text" placeholder="kg, l, pcs" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
                </div>
                <div>
                  <label style="display:block;font-weight:600;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Current Stock</label>
                  <input v-model="form.current_quantity" type="number" placeholder="0" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div>
                  <label style="display:block;font-weight:600;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Price per Unit</label>
                  <input v-model="form.purchase_price_per_unit" type="number" placeholder="0" step="0.01" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
                </div>
                <div>
                  <label style="display:block;font-weight:600;font-size:0.875rem;color:#1A1208;margin-bottom:0.5rem;">Low Stock Threshold</label>
                  <input v-model="form.low_stock_threshold" type="number" placeholder="5" step="0.1" style="width:100%;padding:0.75rem;border:1.5px solid #E5DDD5;border-radius:0.625rem;font-family:'DM Sans',sans-serif;font-size:0.9375rem;" />
                </div>
              </div>
              <div style="display:flex;gap:1rem;justify-content:flex-end;margin-top:1rem;">
                <button @click="closeModal" class="btn-ghost">Cancel</button>
                <button @click="saveIngredient" class="btn-primary" :disabled="!form.name || !form.unit">{{ isEditing ? 'Update' : 'Add' }} Ingredient</button>
              </div>
            </div>
          </div>
        </div>
      </teleport>
    </div>
  `,
  props: ['inventory', 'lowStockItems', 'outOfStock'],
  emits: ['save-ingredient', 'update-ingredient', 'delete-ingredient', 'refresh'],
  setup(props, { emit }) {
    const showModal = ref(false);
    const isEditing = ref(false);
    const editingId = ref(null);
    const search = ref('');
    const activeFilter = ref('all'); // all | out | low
    const drafts = ref({}); // id -> { stock, cost }
    const form = ref({
      name: '',
      unit: '',
      current_quantity: 0,
      purchase_price_per_unit: 0,
      low_stock_threshold: 0
    });

    const openAddModal = () => {
      form.value = {
        name: '',
        unit: '',
        current_quantity: 0,
        purchase_price_per_unit: 0,
        low_stock_threshold: 0
      };
      isEditing.value = false;
      editingId.value = null;
      showModal.value = true;
    };

    const openEditModal = (item) => {
      form.value = {
        name: item.name,
        unit: item.unit,
        current_quantity: item.current_quantity || item.stock || 0,
        purchase_price_per_unit: item.purchase_price_per_unit || 0,
        low_stock_threshold: item.low_stock_threshold || item.threshold || 0
      };
      isEditing.value = true;
      editingId.value = item.id;
      showModal.value = true;
    };

    const closeModal = () => {
      showModal.value = false;
    };

    const toNum = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const fmtQty = (v) => {
      const n = toNum(v, 0);
      const out = Math.round(n * 100) / 100;
      return String(out);
    };

    const pillStyle = (active, isOut = false, isLow = false) => {
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
      if (active) {
        return { ...base, background: '#6F4E37', color: '#F8F5F0', borderColor: '#6F4E37' };
      }
      if (isOut) return { ...base, background: '#FEE2E2', color: '#991B1B', borderColor: 'transparent' };
      if (isLow) return { ...base, background: '#FEF3C7', color: '#92400E', borderColor: 'transparent' };
      return base;
    };

    const setFilter = (f) => {
      activeFilter.value = String(f || 'all');
    };

    const statusText = (item) => {
      const stock = toNum(item?.stock ?? item?.current_quantity, 0);
      const threshold = toNum(item?.threshold ?? item?.low_stock_threshold, 0);
      if (stock <= 0) return 'Out';
      if (threshold > 0 && stock < threshold) return 'Low';
      return 'In Stock';
    };

    const statusClass = (item) => {
      const stock = toNum(item?.stock ?? item?.current_quantity, 0);
      const threshold = toNum(item?.threshold ?? item?.low_stock_threshold, 0);
      if (stock <= 0) return 'badge-out';
      if (threshold > 0 && stock < threshold) return 'badge-warn';
      return 'badge-ok';
    };

    const levelPercent = (item) => {
      const stock = toNum(item?.stock ?? item?.current_quantity, 0);
      const threshold = toNum(item?.threshold ?? item?.low_stock_threshold, 0);
      if (stock <= 0) return 0;
      if (threshold <= 0) return 100;
      const pct = Math.round(Math.max(0, Math.min(1, stock / threshold)) * 100);
      return pct;
    };

    const levelColor = (item) => {
      const stock = toNum(item?.stock ?? item?.current_quantity, 0);
      const threshold = toNum(item?.threshold ?? item?.low_stock_threshold, 0);
      if (stock <= 0) return '#E63946';
      if (threshold > 0 && stock < threshold) return '#F4A261';
      return '#2A9D8F';
    };

    const levelLabel = (item) => {
      const stock = toNum(item?.stock ?? item?.current_quantity, 0);
      const threshold = toNum(item?.threshold ?? item?.low_stock_threshold, 0);
      if (stock <= 0) return '0%';
      if (threshold <= 0) return '—';
      return `${levelPercent(item)}%`;
    };

    const ensureDraftRow = (item) => {
      const id = item?.id;
      if (id == null) return;
      if (!drafts.value[id]) {
        drafts.value[id] = {
          stock: toNum(item.stock ?? item.current_quantity, 0),
          cost: toNum(item.purchase_price_per_unit, 0),
        };
      }
    };

    watch(
      () => props.inventory,
      (list) => {
        for (const it of (list || [])) ensureDraftRow(it);
      },
      { immediate: true, deep: true }
    );

    const onDraftInput = (id, key, value) => {
      if (!drafts.value[id]) drafts.value[id] = { stock: 0, cost: 0 };
      drafts.value[id][key] = value === '' ? '' : Number(value);
    };

    const commitDraft = async (item, key) => {
      try {
        const id = item?.id;
        if (id == null) return;
        ensureDraftRow(item);

        if (key === 'stock') {
          const next = toNum(drafts.value[id].stock, 0);
          const cur = toNum(item.stock ?? item.current_quantity, 0);
          if (Math.abs(next - cur) < 1e-9) return;
          const res = await api.editIngredient(id, { current_quantity: next });
          if (res && res.success) emit('refresh', { type: 'inventory' });
        }

        if (key === 'cost') {
          const next = toNum(drafts.value[id].cost, 0);
          const cur = toNum(item.purchase_price_per_unit, 0);
          if (Math.abs(next - cur) < 1e-9) return;
          const res = await api.editIngredient(id, { purchase_price_per_unit: next });
          if (res && res.success) emit('refresh', { type: 'inventory' });
        }
      } catch (e) {
        alert('Failed to update ingredient: ' + (e?.message || 'Unknown error'));
        try {
          // Revert drafts to last known server values.
          const id = item?.id;
          if (id != null) {
            drafts.value[id] = {
              stock: toNum(item.stock ?? item.current_quantity, 0),
              cost: toNum(item.purchase_price_per_unit, 0),
            };
          }
        } catch {}
      }
    };

    const saveIngredient = async () => {
      try {
        let result;
        if (isEditing.value) {
          result = await api.editIngredient(editingId.value, form.value);
        } else {
          result = await api.addIngredient(form.value);
        }
        if (result.success) {
          closeModal();
          emit('refresh', { type: 'inventory' });
        }
      } catch (e) {
        alert('Error saving ingredient: ' + e.message);
      }
    };

    const deleteIngredient = async (item) => {
      if (confirm(`Delete "${item.name}"?`)) {
        try {
          const result = await api.deleteIngredient(item.id);
          if (result.success) {
            emit('refresh', { type: 'inventory' });
          }
        } catch (e) {
          alert('Error deleting ingredient: ' + e.message);
        }
      }
    };

    const outCount = computed(() => (props.inventory || []).filter((i) => toNum(i.stock ?? i.current_quantity, 0) <= 0).length);
    const lowCount = computed(() => (props.inventory || []).filter((i) => {
      const stock = toNum(i.stock ?? i.current_quantity, 0);
      const th = toNum(i.threshold ?? i.low_stock_threshold, 0);
      return stock > 0 && th > 0 && stock < th;
    }).length);

    const filteredInventory = computed(() => {
      const q = String(search.value || '').trim().toLowerCase();
      const f = String(activeFilter.value || 'all');
      return (props.inventory || []).filter((item) => {
        const name = String(item?.name || '').toLowerCase();
        if (q && !name.includes(q)) return false;
        const stock = toNum(item.stock ?? item.current_quantity, 0);
        const th = toNum(item.threshold ?? item.low_stock_threshold, 0);
        if (f === 'out') return stock <= 0;
        if (f === 'low') return stock > 0 && th > 0 && stock < th;
        return true;
      });
    });

    return {
      showModal,
      isEditing,
      search,
      activeFilter,
      drafts,
      outCount,
      lowCount,
      filteredInventory,
      form,
      fmtQty,
      pillStyle,
      setFilter,
      statusText,
      statusClass,
      levelPercent,
      levelColor,
      levelLabel,
      onDraftInput,
      commitDraft,
      openAddModal,
      openEditModal,
      closeModal,
      saveIngredient,
      deleteIngredient
    };
  }
};
