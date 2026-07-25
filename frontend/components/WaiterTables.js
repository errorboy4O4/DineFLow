const { computed } = Vue;

export default {
  props: {
    tables: { type: Array, default: () => [] }
  },
  emits: ['table-click'],
  template: `
    <div class="w-section">
      <div class="legend">
        <div v-for="l in legend" :key="l.label" class="legend-item">
          <span class="dot" :style="{ background: l.color }"></span>
          <span>{{ l.label }}</span>
        </div>
      </div>

      <div class="panel">
        <div class="table-grid">
          <button v-for="t in tables" :key="t.table_number"
                  class="t-card"
                  :class="cardClass(t.status)"
                  @click="$emit('table-click', t)">
            <div class="t-top">
              <div class="t-num">{{ t.table_number }}</div>
              <div class="t-badge" :class="badgeClass(t.status)">
                <span v-if="t.status==='free'">Free</span>
                <span v-else-if="t.status==='occupied'">{{ (t.guests && t.guests>0) ? (t.guests + 'p') : 'Occupied' }}</span>
                <span v-else-if="t.status==='ready'">Pickup!</span>
                <span v-else>Waiting</span>
                <span v-if="t.status==='waiting'" class="t-badge-dot"></span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-num">{{ occupiedCount }}</div>
          <div class="stat-label">Tables Occupied</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ freeCount }}</div>
          <div class="stat-label">Tables Free</div>
        </div>
      </div>
    </div>
  `,
  setup(props) {
    const legend = [
      { label: 'Free', color: '#B0A49C' },
      { label: 'Occupied', color: '#6F4E37' },
      { label: 'Ready', color: '#2A9D8F' },
      { label: 'Waiting', color: '#E63946' },
    ];

    const freeCount = computed(() => (props.tables || []).filter(t => t.status === 'free').length);
    const occupiedCount = computed(() => (props.tables || []).filter(t => t.status !== 'free').length);

    const cardClass = (status) => {
      if (status === 'free') return 'free';
      if (status === 'ready') return 'ready';
      if (status === 'waiting') return 'waiting';
      return 'occupied';
    };

    const badgeClass = (status) => {
      if (status === 'ready') return 'ready';
      if (status === 'waiting') return 'waiting';
      if (status === 'free') return 'free';
      return 'occupied';
    };

    return { legend, freeCount, occupiedCount, cardClass, badgeClass };
  }
};
