import api from '../js/api.js';

const { ref, onMounted } = Vue;

export default {
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;">
      <div style="width:100%;max-width:520px;">
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="width:64px;height:64px;background:linear-gradient(135deg,#6F4E37,#8B6347);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;color:white;">
            <i class="bi bi-grid-3x3-gap" style="font-size:1.6rem;"></i>
          </div>
          <h1 style="font-family:'Playfair Display',serif;font-weight:800;font-size:1.85rem;color:#1A1208;margin:0;">Select Your Table</h1>
          <p style="margin:0.5rem 0 0;color:#9C8E84;font-weight:800;">Choose your table to start ordering</p>
        </div>

        <div v-if="loading" style="padding:1rem;text-align:center;color:#6B5744;font-weight:800;background:#FAFAF7;border:1.5px solid #E5DDD5;border-radius:1rem;">
          Loading tables...
        </div>

        <div v-else-if="error" style="padding:1rem;text-align:center;color:#991B1B;font-weight:900;background:#FEE2E2;border:1.5px solid #E63946;border-radius:1rem;">
          {{ error }}
        </div>

        <div v-else>
          <div v-if="tables.length === 0" style="padding:1rem;text-align:center;color:#6B5744;font-weight:800;background:#FAFAF7;border:1.5px solid #E5DDD5;border-radius:1rem;">
            No tables found. Ask staff to generate table QR codes first.
          </div>

          <div v-else style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:0.75rem;">
            <button v-for="t in tables" :key="t.id" @click="select(t)"
                    style="background:white;border:1.5px solid rgba(111,78,55,0.16);border-radius:1rem;padding:1rem;cursor:pointer;text-align:center;box-shadow:0 2px 12px rgba(111,78,55,0.06);transition:transform 0.15s;">
              <div style="font-weight:900;font-size:1.1rem;color:#1A1208;">Table</div>
              <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:1.8rem;color:#6F4E37;line-height:1;margin-top:0.2rem;">{{ t.table_number }}</div>
            </button>
          </div>
        </div>

        <div style="margin-top:1.25rem;text-align:center;color:#9C8E84;font-weight:800;font-size:0.85rem;">
          Tip: You can also scan a Table QR to jump here automatically.
        </div>
      </div>
    </div>
  `,
  emits: ['table-selected'],
  setup(props, { emit }) {
    const loading = ref(true);
    const error = ref('');
    const tables = ref([]);

    const load = async () => {
      loading.value = true;
      error.value = '';
      try {
        const res = await api.getCustomerTables();
        tables.value = res.tables || [];
      } catch (e) {
        error.value = e?.message || 'Failed to load tables';
      } finally {
        loading.value = false;
      }
    };

    const select = (t) => {
      emit('table-selected', t);
    };

    onMounted(load);

    return { loading, error, tables, select };
  }
};

