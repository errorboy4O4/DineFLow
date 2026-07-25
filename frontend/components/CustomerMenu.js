import api from '../js/api.js';

const { ref, computed, onMounted } = Vue;

export default {
  props: {
    session: { type: Object, default: null },
    cartCount: { type: Number, default: 0 }
  },
  emits: ['add-to-cart', 'open-ai', 'go-cart'],
  template: `
    <div style="padding:1rem 1rem 1.25rem;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;margin-bottom:0.9rem;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.55rem;color:#1A1208;line-height:1.05;">Menu</div>
          <div style="color:#9C8E84;font-weight:800;font-size:0.82rem;margin-top:0.2rem;">
            Table {{ tableNumberLabel }} · {{ menu.length }} items
          </div>
        </div>
        <button @click="$emit('go-cart')" title="Cart"
                style="width:44px;height:44px;border-radius:0.9rem;border:1.5px solid #E5DDD5;background:white;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;">
          <i class="bi bi-bag" style="font-size:1.05rem;color:#6F4E37;"></i>
          <span v-if="cartCount>0" style="position:absolute;top:-6px;right:-6px;background:#E63946;color:white;border-radius:999px;padding:0.12rem 0.35rem;font-weight:900;font-size:0.7rem;border:2px solid white;">
            {{ cartCount }}
          </span>
        </button>
      </div>

      <div style="position:relative;margin-bottom:0.9rem;">
        <i class="bi bi-search" style="position:absolute;left:0.9rem;top:50%;transform:translateY(-50%);color:#9C8E84;"></i>
        <input v-model="q" type="text" placeholder="Search dishes, ingredients..."
               style="width:100%;padding:0.85rem 0.95rem 0.85rem 2.4rem;border:1.5px solid #E5DDD5;border-radius:1rem;background:#FAFAF7;font-weight:800;" />
      </div>

      <button @click="$emit('open-ai')"
              style="width:100%;text-align:left;border:none;cursor:pointer;padding:0;margin:0 0 0.85rem;background:none;">
        <div style="background:linear-gradient(135deg,#4A3423,#6F4E37);border-radius:1.1rem;padding:0.95rem 1rem;display:flex;align-items:center;gap:0.8rem;color:white;box-shadow:0 12px 28px rgba(74,52,35,0.24);">
          <div style="width:42px;height:42px;border-radius:0.95rem;background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:1.2rem;">🤖</span>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:900;font-size:0.98rem;letter-spacing:0.01em;">Create Custom Dish</div>
            <div style="opacity:0.86;font-weight:800;font-size:0.8rem;margin-top:0.1rem;">AI builds your perfect meal</div>
          </div>
          <i class="bi bi-chevron-right" style="opacity:0.9;"></i>
        </div>
      </button>

      <div style="display:flex;gap:0.5rem;overflow:auto;padding-bottom:0.2rem;margin-bottom:0.85rem;">
        <button v-for="c in categories" :key="c"
                @click="category=c"
                :style="chipStyle(c === category)">
          {{ c }}
        </button>
      </div>

      <div v-if="loading" style="padding:1rem;text-align:center;color:#6B5744;font-weight:800;background:#FAFAF7;border:1.5px solid #E5DDD5;border-radius:1rem;">
        Loading menu...
      </div>

      <div v-else-if="error" style="padding:1rem;text-align:center;color:#991B1B;font-weight:900;background:#FEE2E2;border:1.5px solid #E63946;border-radius:1rem;">
        {{ error }}
      </div>

      <div v-else>
        <div v-if="filtered.length === 0" style="padding:1rem;text-align:center;color:#6B5744;font-weight:800;background:#FAFAF7;border:1.5px solid #E5DDD5;border-radius:1rem;">
          No dishes available right now.
        </div>

        <div v-else style="display:flex;flex-direction:column;gap:0.85rem;">
          <div v-for="d in filtered" :key="d.id"
               style="background:white;border:1.5px solid rgba(111,78,55,0.12);border-radius:1.1rem;overflow:hidden;box-shadow:0 2px 12px rgba(111,78,55,0.06);">
            <div style="display:flex;gap:0.85rem;padding:0.9rem 0.95rem;">
              <div style="width:42px;height:42px;border-radius:0.95rem;background:#F0EBE3;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                <img v-if="d.photo_path" :src="photoSrc(d.photo_path)" :alt="d.name" style="width:100%;height:100%;object-fit:cover;display:block;" />
                <span v-else style="font-size:1.25rem;">{{ dishEmoji(d) }}</span>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:900;color:#1A1208;line-height:1.1;">{{ d.name }}</div>
                <div style="color:#9C8E84;font-weight:900;font-size:0.75rem;margin-top:0.2rem;">{{ categoryLabel(d) }}</div>
                <div v-if="d.description" style="margin-top:0.35rem;color:#9C8E84;font-weight:700;font-size:0.82rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                  {{ d.description }}
                </div>
                <div style="margin-top:0.65rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
                  <div style="font-weight:900;color:#6F4E37;font-size:1.05rem;">&#8377;{{ Number(d.price || 0).toFixed(0) }}</div>
                  <button @click="$emit('add-to-cart', d)"
                          style="width:44px;height:44px;border:none;border-radius:999px;background:#4A3423;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 22px rgba(74,52,35,0.22);">
                    <i class="bi bi-plus-lg" style="font-size:1rem;"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button @click="$emit('open-ai')" title="AI Custom Dish"
              style="position:fixed;right:max(1rem, calc(50% - 215px + 1rem));bottom:105px;width:56px;height:56px;border:none;border-radius:999px;background:linear-gradient(135deg,#4A3423,#6F4E37);color:white;cursor:pointer;box-shadow:0 18px 34px rgba(74,52,35,0.28);display:flex;align-items:center;justify-content:center;">
        <span style="font-size:1.25rem;">🤖</span>
      </button>
    </div>
  `,
  setup(props) {
    const loading = ref(true);
    const error = ref('');
    const menu = ref([]);
    const q = ref('');
    const category = ref('All');

    const categories = computed(() => {
      const set = new Set();
      for (const d of (menu.value || [])) {
        const c = (d && d.category) ? String(d.category).trim() : '';
        if (c) set.add(c);
      }
      return ['All', ...Array.from(set).sort((a,b) => a.localeCompare(b))];
    });

    const load = async () => {
      loading.value = true;
      error.value = '';
      try {
        const res = await api.getCustomerMenu();
        menu.value = res.menu || [];
      } catch (e) {
        error.value = e?.message || 'Failed to load menu';
      } finally {
        loading.value = false;
      }
    };

    const filtered = computed(() => {
      const text = (q.value || '').trim().toLowerCase();
      const list = menu.value || [];
      const byText = !text
        ? list
        : list.filter((d) => (d.name || '').toLowerCase().includes(text) || (d.description || '').toLowerCase().includes(text));
      if (category.value === 'All') return byText;
      return byText.filter((d) => String(d?.category || '').trim() === category.value);
    });

    const photoSrc = (p) => {
      const path = (p || '').trim();
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      if (path.startsWith('/')) return path;
      return `/${path}`;
    };

    const chipStyle = (active) => {
      if (active) {
        return 'border:none;background:#4A3423;color:white;border-radius:999px;padding:0.48rem 0.85rem;font-weight:900;font-size:0.82rem;cursor:pointer;white-space:nowrap;';
      }
      return 'border:1.5px solid #E5DDD5;background:#FAFAF7;color:#6B5744;border-radius:999px;padding:0.48rem 0.85rem;font-weight:900;font-size:0.82rem;cursor:pointer;white-space:nowrap;';
    };

    const categoryLabel = (d) => {
      const c = (d && d.category) ? String(d.category).trim() : '';
      return c || 'Uncategorized';
    };

    const dishEmoji = (dish) => {
      const explicit = String(dish?.emoji || dish?.icon || '').trim();
      if (explicit) return explicit;
      const c = String(dish?.category || '').toLowerCase();
      if (c.includes('bread')) return '🥖';
      if (c.includes('beverage') || c.includes('drink')) return '🥭';
      if (c.includes('dessert')) return '🍨';
      if (c.includes('starter')) return '🍢';
      if (c.includes('thali')) return '🍱';
      if (c.includes('side')) return '🥗';
      return '🍽️';
    };

    const tableNumberLabel = computed(() => {
      const n = props.session && props.session.table_number;
      return (n === 0 || n) ? String(n) : '-';
    });

    onMounted(load);

    return { loading, error, menu, q, filtered, photoSrc, categories, category, chipStyle, categoryLabel, dishEmoji, tableNumberLabel };
  }
};
