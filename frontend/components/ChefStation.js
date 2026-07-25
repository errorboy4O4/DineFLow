import api from '../js/api.js';

const { ref, computed, onMounted, onBeforeUnmount } = Vue;

export default {
  template: `
    <div class="chef-shell">
      <!-- Header -->
      <header class="header">
        <div class="header-content">
          <div>
            <h1><i class="bi bi-droplet-fill"></i> Chef Station</h1>
            <div class="time">{{ currentTime }}</div>
          </div>
          <div class="queue-pill" title="Queued items">
            <div class="q-label">Queue</div>
            <div class="q-count">{{ queueCount }}</div>
          </div>
        </div>
      </header>

      <div class="container">
        <div class="queue-title">
          <i class="bi bi-list-task"></i> Order Queue
          <button class="icon-btn" @click="load" title="Refresh">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        <div class="table-container">
          <div class="orders-table">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Table</th>
                  <th>Dish</th>
                  <th>Qty</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td class="strip main"></td>
                  <td colspan="4" style="padding:0.9rem 0.75rem;color:#6B5744;font-weight:800;">Loading queue...</td>
                </tr>

                <tr v-else-if="error">
                  <td class="strip main"></td>
                  <td colspan="4" style="padding:0.9rem 0.75rem;color:#991B1B;font-weight:900;">{{ error }}</td>
                </tr>

                <tr v-else-if="orders.length === 0">
                  <td class="strip main"></td>
                  <td colspan="4" style="padding:0.9rem 0.75rem;color:#6B5744;font-weight:900;">
                    No orders in queue right now.
                  </td>
                </tr>

                <tr v-for="o in orders" :key="o.item_id" class="row">
                  <td class="strip" :class="getCatClass(o.category)"></td>
                  <td class="td table-cell">
                    <div class="table-num">{{ o.table }}</div>
                  </td>
                  <td class="td dish-cell">
                    <div class="dish-name">
                      {{ o.name }}
                      <span v-if="o.isCustom" class="custom-badge">CUSTOM</span>
                    </div>
                    <div class="dish-cat">{{ o.category }}</div>
                  </td>
                  <td class="td qty-cell">
                    <div class="qty-pill">{{ o.qty }}</div>
                  </td>
                  <td class="td actions-cell">
                    <button v-if="o.isCustom" class="btn-recipe" @click="viewRecipe(o)">
                      <i class="bi bi-book"></i> Recipe
                    </button>
                    <div class="action-row">
                      <button class="btn-done" :disabled="o._busy" @click="markDone(o)">
                        <i class="bi bi-check2-circle"></i> Done
                      </button>
                      <button v-if="hasNote(o)" class="btn-note" title="View note" @click="openNote(o)">
                        <i class="bi bi-info-lg"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div class="toast" v-if="toast.show" :class="{hide: toast.hiding}">
        <i class="bi bi-check2-circle"></i>
        <div class="t-msg">{{ toast.message }}</div>
      </div>

      <!-- Recipe Modal -->
      <div class="modal-overlay" v-if="modal.open" @click.self="closeModal">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-icon"><i class="bi bi-book"></i></div>
            <div style="flex:1;min-width:0;">
              <h2 class="modal-title">{{ modal.title }}</h2>
              <div class="modal-sub">{{ modal.sub }}</div>
            </div>
            <button class="close-btn" @click="closeModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="m-title"><i class="bi bi-basket3-fill"></i> Ingredients</div>
            <div class="ing-list">
              <div v-if="modal.ingredients.length===0" class="ing-empty">No ingredients available.</div>
              <div v-for="ing in modal.ingredients" :key="ing.name + ing.amount" class="ing-item">
                <div class="ing-dot"></div>
                <div class="ing-name">{{ ing.name }}</div>
                <div class="ing-amt">{{ ing.amount }}</div>
              </div>
            </div>

            <div class="m-title" style="margin-top:0.95rem;"><i class="bi bi-list-ol"></i> Steps</div>
            <div class="steps-list">
              <div v-if="modal.steps.length===0" class="step-empty">No steps provided.</div>
              <div v-for="(step, i) in modal.steps" :key="i" class="step">
                <div class="step-num">{{ i + 1 }}</div>
                <div class="step-text">{{ step }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Note Modal -->
      <div class="modal-overlay" v-if="noteModal.open" @click.self="closeNote">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-icon"><i class="bi bi-info-lg"></i></div>
            <div style="flex:1;min-width:0;">
              <h2 class="modal-title">{{ noteModal.title }}</h2>
              <div class="modal-sub">{{ noteModal.sub }}</div>
            </div>
            <button class="close-btn" @click="closeNote">&times;</button>
          </div>
          <div class="modal-body">
            <div class="m-title"><i class="bi bi-chat-left-text-fill"></i> Customer Note</div>
            <div class="note-box">{{ noteModal.note }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const currentTime = ref('');
    const loading = ref(true);
    const error = ref('');
    const orders = ref([]);

    const toast = ref({ show: false, hiding: false, message: '' });
    const modal = ref({ open: false, title: '', sub: '', ingredients: [], steps: [] });
    const noteModal = ref({ open: false, title: '', sub: '', note: '' });

    const queueCount = computed(() => (orders.value || []).length);

    const updateTime = () => {
      const n = new Date();
      currentTime.value =
        n.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) +
        ' • ' +
        n.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const guessCategory = (name) => {
      const s = String(name || '').toLowerCase();
      if (s.includes('naan') || s.includes('roti') || s.includes('bread')) return 'Breads';
      if (s.includes('lassi') || s.includes('juice') || s.includes('tea') || s.includes('coffee')) return 'Beverages';
      if (s.includes('jamun') || s.includes('dessert') || s.includes('ice')) return 'Desserts';
      if (s.includes('raita') || s.includes('salad') || s.includes('side')) return 'Sides';
      if (s.includes('tikka') || s.includes('starter')) return 'Starter';
      return 'Main Course';
    };

    const load = async () => {
      loading.value = true;
      error.value = '';
      try {
        const res = await api.getChefQueue();
        const list = res.queue || [];
        orders.value = list.map((r) => ({
          item_id: r.item_id,
          batch_id: r.batch_id,
          table: r.table_number,
          qty: r.qty,
          isCustom: !!r.is_custom,
          name: r.name,
          category: r.is_custom ? 'Custom' : guessCategory(r.name),
          note: typeof r.note === 'string' ? r.note : '',
          _busy: false
        }));
      } catch (e) {
        error.value = e?.message || 'Failed to load queue';
      } finally {
        loading.value = false;
      }
    };

    const getCatClass = (cat) => {
      return ({
        'Starter': 'starter',
        'Main Course': 'main',
        'Breads': 'breads',
        'Sides': 'sides',
        'Desserts': 'desserts',
        'Beverages': 'beverages',
        'Custom': 'custom'
      })[cat] || 'main';
    };

    const showToast = (message) => {
      toast.value.message = message;
      toast.value.show = true;
      toast.value.hiding = false;
      setTimeout(() => {
        toast.value.hiding = true;
        setTimeout(() => {
          toast.value.show = false;
          toast.value.hiding = false;
        }, 260);
      }, 2400);
    };

    const markDone = async (o) => {
      if (!o || o._busy) return;
      o._busy = true;
      try {
        await api.markChefItemDone(o.item_id);
        showToast(`${o.name} · Table ${o.table} — marked done`);
        orders.value = (orders.value || []).filter((x) => x.item_id !== o.item_id);
      } catch (e) {
        showToast(e?.message || 'Failed to mark done');
      } finally {
        o._busy = false;
      }
    };

    const viewRecipe = async (o) => {
      if (!o) return;
      modal.value = { open: true, title: o.name, sub: `Qty: ${o.qty} · Table ${o.table}`, ingredients: [], steps: [] };
      try {
        const res = await api.getChefItemRecipe(o.item_id);
        if (res?.is_custom && res?.recipe) {
          // Accept a few possible shapes.
          const ing = res.recipe.ingredients || res.recipe.ing || [];
          const steps = res.recipe.steps || res.recipe.instructions || [];
          modal.value.ingredients = (ing || []).map((x) => ({
            name: x.name || x.ingredient || 'Ingredient',
            amount: x.amount || x.qty || x.quantity || ''
          }));
          modal.value.steps = (steps || []).map((s) => String(s));
        } else {
          modal.value.ingredients = res.ingredients || [];
          modal.value.steps = res.steps || [];
        }
      } catch {
        // keep modal open with empty content
      }
    };

    const closeModal = () => {
      modal.value.open = false;
    };

    const hasNote = (o) => {
      const n = o?.note;
      return typeof n === 'string' && n.trim().length > 0;
    };

    const openNote = (o) => {
      if (!hasNote(o)) return;
      noteModal.value = {
        open: true,
        title: o?.name || 'Note',
        sub: `Table ${o?.table ?? ''}`,
        note: String(o.note || '').trim()
      };
    };

    const closeNote = () => {
      noteModal.value.open = false;
    };

    let timeTimer = null;
    let pollTimer = null;

    onMounted(() => {
      updateTime();
      timeTimer = setInterval(updateTime, 30000);
      load();
      pollTimer = setInterval(load, 5000);
    });

    onBeforeUnmount(() => {
      if (timeTimer) clearInterval(timeTimer);
      if (pollTimer) clearInterval(pollTimer);
    });

    return {
      currentTime,
      loading,
      error,
      orders,
      queueCount,
      toast,
      modal,
      noteModal,
      load,
      getCatClass,
      markDone,
      viewRecipe,
      closeModal,
      hasNote,
      openNote,
      closeNote
    };
  }
};
