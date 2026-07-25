export default {
  // Stored in browser only (no DB change). Used by the topbar bell + optional alerts.
  // This is intentionally lightweight: survives page refresh, but resets if browser storage is cleared.
  __NOTIF_STORAGE_KEY: "dineflow:manager:notif_prefs:v1",
  template: `
    <div ref="wrap" class="slide-up" style="max-width:1200px;width:100%;margin:0 auto;display:flex;flex-direction:column;">
      <div ref="head" class="panel mb-4" style="padding:0.75rem 1rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
        <button @click="section='general'" :style="tabStyle('general')"
                style="padding:0.55rem 0.85rem;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.18);font-weight:900;cursor:pointer;transition:all 0.15s;">
          General
        </button>
        <button @click="section='billing'" :style="tabStyle('billing')"
                style="padding:0.55rem 0.85rem;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.18);font-weight:900;cursor:pointer;transition:all 0.15s;">
          Billing
        </button>

        <div style="margin-left:auto;display:flex;gap:0.6rem;align-items:center;">
          <div v-if="saveError" style="font-weight:900;color:#991B1B;">{{ saveError }}</div>
          <div v-if="saveOk" style="font-weight:900;color:#065F46;">Saved.</div>
        </div>
      </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5" :style="gridStyle">
          <!-- GENERAL: Restaurant Info -->
          <div class="panel df-hide-scrollbar" v-if="section==='general'" :style="panelStyle">
            <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
              <h3 style="font-weight:700;font-size:0.9375rem;">Restaurant Info</h3>
              <p style="font-size:0.8125rem;color:#9C8E84;margin-top:0.125rem;">Shown on bills and in dashboards.</p>
            </div>
          <div style="padding:1.25rem;display:flex;flex-direction:column;gap:0.85rem;">
            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">Restaurant Name</label>
              <input v-model="form.restaurant_name" type="text" class="search-input" placeholder="e.g. DineFlow Kitchen" />
            </div>

            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">Phone Number</label>
              <input v-model="form.phone_number" type="tel" class="search-input" placeholder="e.g. +91 9876543210" />
            </div>

            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">GSTIN</label>
              <input v-model="form.gstin" type="text" class="search-input" placeholder="e.g. 10ABCDE1234F1Z5" />
            </div>

            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">Address</label>
              <input v-model="form.address" type="text" class="search-input" placeholder="Full address" />
            </div>

            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">Email (Login)</label>
              <input :value="email" type="email" class="search-input" disabled style="opacity:0.75;" />
            </div>

            <div>
              <label style="font-size:0.8125rem;font-weight:600;color:#6B5744;display:block;margin-bottom:0.3rem;">Custom Dish Profit Margin (%)</label>
              <input v-model.number="form.custom_dish_profit_margin" type="number" min="0" step="0.5" class="search-input" placeholder="e.g. 30" />
              <div style="font-size:0.75rem;color:#9C8E84;margin-top:0.2rem;font-weight:800;">Used to price AI-generated custom dishes (base ingredient cost + margin).</div>
            </div>

            <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-top:0.25rem;">
              <button class="btn-primary" @click="save" :disabled="saving" style="min-width:160px;">
                {{ saving ? 'Saving...' : 'Save Changes' }}
              </button>
              <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;">Bills update instantly after save.</div>
            </div>
          </div>
        </div>

        <!-- GENERAL: Notifications -->
        <div class="panel" v-if="section==='general'" :style="panelStyle">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:700;font-size:0.9375rem;">Notifications</h3>
          </div>
          <div style="padding:1.25rem;display:flex;flex-direction:column;gap:0.9rem;">
            <div v-for="notif in notificationSettings" :key="notif.label"
                 style="display:flex;align-items:center;justify-content:space-between;padding:0.55rem 0;border-bottom:1px solid rgba(111,78,55,0.07);">
              <div>
                <div style="font-weight:700;font-size:0.875rem;">{{ notif.label }}</div>
                <div style="font-size:0.75rem;color:#9C8E84;margin-top:0.12rem;">{{ notif.desc }}</div>
              </div>
              <label class="toggle-wrap">
                <input type="checkbox" v-model="notif.enabled" @change="persistNotificationPrefs" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- BILLING: Controls -->
        <div class="panel" v-if="section==='billing'" :style="panelStyle">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:700;font-size:0.9375rem;">Billing Settings</h3>
            <p style="font-size:0.8125rem;color:#9C8E84;margin-top:0.125rem;">Control what prints on the bill.</p>
          </div>

          <div style="padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:0.9rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
              <label style="display:flex;gap:0.55rem;align-items:center;font-weight:900;color:#6B5744;">
                <input type="checkbox" v-model="form.show_restaurant_name" /> Name
              </label>
              <label style="display:flex;gap:0.55rem;align-items:center;font-weight:900;color:#6B5744;">
                <input type="checkbox" v-model="form.show_address" /> Address
              </label>
              <label style="display:flex;gap:0.55rem;align-items:center;font-weight:900;color:#6B5744;">
                <input type="checkbox" v-model="form.show_gstin" /> GSTIN
              </label>
              <label style="display:flex;gap:0.55rem;align-items:center;font-weight:900;color:#6B5744;">
                <input type="checkbox" v-model="form.show_phone" /> Phone
              </label>
            </div>

            <div style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap;">
              <div style="flex:1;min-width:160px;">
                <label style="font-size:0.8125rem;font-weight:700;color:#6B5744;display:block;margin-bottom:0.3rem;">GST %</label>
                <input v-model.number="form.gst_rate" type="number" min="0" step="0.1" class="search-input" placeholder="e.g. 5" />
              </div>
              <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;">Used for bill totals.</div>
            </div>

            <details style="border:1.5px solid rgba(111,78,55,0.12);border-radius:0.85rem;padding:0.75rem 0.9rem;background:#FAFAF7;">
              <summary style="cursor:pointer;font-weight:900;color:#6F4E37;">Advanced</summary>
              <div style="margin-top:0.85rem;display:flex;flex-direction:column;gap:0.9rem;">
                <div>
                  <label style="font-size:0.8125rem;font-weight:700;color:#6B5744;display:block;margin-bottom:0.3rem;">Waiter Payment QR Image (Optional)</label>
                  <input type="file" accept="image/*" @change="uploadQr" />
                  <div v-if="form.qr_image_path" style="margin-top:0.6rem;display:flex;gap:0.75rem;align-items:center;">
                    <img :src="form.qr_image_path" alt="QR" style="width:78px;height:78px;border-radius:0.75rem;border:1.5px solid rgba(111,78,55,0.12);object-fit:cover;" />
                    <button class="btn-ghost" @click="form.qr_image_path=''" style="padding:0.5rem 0.75rem;border-radius:0.75rem;">Remove</button>
                  </div>
                </div>

                <div>
                  <label style="font-size:0.8125rem;font-weight:700;color:#6B5744;display:block;margin-bottom:0.3rem;">Terms & Conditions (Optional)</label>
                  <textarea v-model="form.bill_terms" rows="4" class="search-input" style="height:auto;resize:vertical;" placeholder="e.g. Taxes are included. No refunds after order is prepared."></textarea>
                </div>
              </div>
            </details>

            <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-top:0.1rem;">
              <button class="btn-primary" @click="save" :disabled="saving" style="min-width:170px;">
                {{ saving ? 'Saving...' : 'Save Billing' }}
              </button>
              <div style="color:#9C8E84;font-weight:800;font-size:0.78rem;">Preview updates live.</div>
            </div>
          </div>
        </div>

        <!-- BILLING: Demo Preview -->
        <div class="panel" v-if="section==='billing'" :style="panelStyle">
          <div class="p-4 border-b" style="border-color:rgba(111,78,55,0.1)">
            <h3 style="font-weight:700;font-size:0.9375rem;">Demo Bill Preview</h3>
            <p style="font-size:0.8125rem;color:#9C8E84;margin-top:0.125rem;">This is how it will look on the waiter bill and print.</p>
          </div>

          <div style="padding:1.1rem 1.25rem;">
            <div style="border:1.5px solid rgba(111,78,55,0.12);border-radius:1rem;overflow:hidden;background:white;">
              <div style="padding:0.95rem 1rem;border-bottom:1px solid rgba(111,78,55,0.08);display:flex;gap:0.75rem;align-items:flex-start;">
                <div style="width:34px;height:34px;border-radius:14px;background:#F0EBE3;display:flex;align-items:center;justify-content:center;color:#6F4E37;flex-shrink:0;">
                  <span style="font-weight:900;">☕</span>
                </div>
                <div style="min-width:0;">
                  <div v-if="form.show_restaurant_name" style="font-weight:900;color:#1A1208;">{{ form.restaurant_name || 'Your Restaurant' }}</div>
                  <div v-if="form.show_address && form.address" style="font-size:0.78rem;color:#6B5744;font-weight:800;line-height:1.3;">{{ form.address }}</div>
                  <div style="margin-top:0.2rem;font-size:0.78rem;color:#9C8E84;font-weight:800;line-height:1.35;">
                    <div v-if="form.show_gstin && form.gstin">GSTIN: {{ form.gstin }}</div>
                    <div v-if="form.show_phone && form.phone_number">Phone: {{ form.phone_number }}</div>
                  </div>
                </div>
                <div style="margin-left:auto;text-align:right;">
                  <div style="font-weight:900;color:#6F4E37;">Table 7</div>
                  <div style="font-size:0.75rem;color:#9C8E84;font-weight:800;">Today, 7:30 PM</div>
                </div>
              </div>

              <div style="padding:0.85rem 1rem;">
                <div style="font-size:0.72rem;color:#9C8E84;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;">Order Items</div>
                <div v-for="it in previewItems" :key="it.name" style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid rgba(111,78,55,0.06);">
                  <div style="font-weight:900;color:#1A1208;">{{ it.name }} <span style="color:#9C8E84;font-weight:800;">x{{ it.qty }}</span></div>
                  <div style="font-weight:900;color:#6F4E37;">₹{{ Math.round(it.amount) }}</div>
                </div>

                <div style="margin-top:0.75rem;border-top:1px solid rgba(111,78,55,0.08);padding-top:0.75rem;">
                  <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:900;">
                    <span>Subtotal</span><span>₹{{ Math.round(previewSubtotal) }}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;color:#6B5744;font-weight:900;margin-top:0.3rem;">
                    <span>GST ({{ Math.round(Number(form.gst_rate || 0)) }}%)</span><span>₹{{ Math.round(previewGst) }}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;color:#1A1208;font-weight:900;margin-top:0.55rem;padding-top:0.55rem;border-top:1px solid rgba(111,78,55,0.08);">
                    <span>Total</span><span style="font-family:'Playfair Display',serif;font-size:1.2rem;color:#6F4E37;">₹{{ Math.round(previewTotal) }}</span>
                  </div>
                </div>

                <div v-if="form.bill_terms" style="margin-top:0.85rem;padding:0.75rem 0.85rem;border-radius:0.85rem;background:#FAFAF7;border:1.5px solid rgba(111,78,55,0.10);color:#6B5744;font-weight:800;font-size:0.82rem;line-height:1.45;">
                  <b style="color:#1A1208;">Terms:</b> {{ form.bill_terms }}
                </div>

                <div v-if="form.qr_image_path" style="margin-top:0.95rem;display:flex;gap:0.75rem;align-items:center;">
                  <img :src="form.qr_image_path" alt="QR" style="width:88px;height:88px;border-radius:0.85rem;border:1.5px solid rgba(111,78,55,0.12);object-fit:cover;" />
                  <div style="color:#9C8E84;font-weight:800;font-size:0.8rem;">Waiter pay popup will show this QR.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      section: 'general',
      gridH: 560,
      email: '',
      form: {
        restaurant_name: '',
        address: '',
        gstin: '',
        phone_number: '',
        custom_dish_profit_margin: 30,
        gst_rate: 5,
        bill_terms: '',
        qr_image_path: '',
        show_restaurant_name: true,
        show_address: true,
        show_gstin: true,
        show_phone: true
      },
      saving: false,
      saveOk: false,
      saveError: '',
      notificationSettings: [
        { key: 'new_orders', label: 'New Orders', desc: 'Notify when new orders arrive', enabled: true },
        { key: 'low_stock', label: 'Low Stock Alerts', desc: 'Alert when inventory is low', enabled: true },
        { key: 'daily_summary', label: 'Daily Summary', desc: 'Send daily sales summary', enabled: false },
        { key: 'staff_notifications', label: 'Staff Notifications', desc: 'Notify about staff activities', enabled: true }
      ],
      previewItems: [
        { name: 'Butter Chicken', qty: 1, amount: 580 },
        { name: 'Paneer Tikka', qty: 1, amount: 380 }
      ]
    };
  },
  computed: {
    gridStyle() {
      return {
        height: `${this.gridH}px`,
        alignItems: 'stretch'
      };
    },
    panelStyle() {
      return {
        height: '100%',
        overflow: 'auto'
      };
    },
    previewSubtotal() {
      return (this.previewItems || []).reduce((s, it) => s + Number(it.amount || 0), 0);
    },
    previewGst() {
      const rate = Number(this.form.gst_rate || 0);
      return this.previewSubtotal * (rate / 100);
    },
    previewTotal() {
      return this.previewSubtotal + this.previewGst;
    }
  },
  async mounted() {
    const recalc = () => {
      try {
        const wrap = this.$refs.wrap;
        const head = this.$refs.head;
        if (!wrap) return;
        const top = wrap.getBoundingClientRect().top;
        const headH = head ? head.offsetHeight : 0;
        const avail = Math.max(520, window.innerHeight - top - 16);
        this.gridH = Math.max(360, avail - headH - 12);
      } catch {
        // keep defaults
      }
    };
    this._settingsRecalc = recalc;
    window.addEventListener('resize', recalc);
    this.$nextTick(recalc);

    try {
      const api = (await import('../js/api.js')).default;
      const res = await api.getManagerSettings();
      const s = (res && res.settings) ? res.settings : {};
      this.email = s.email || '';
      this.form.restaurant_name = s.restaurant_name || '';
      this.form.address = s.address || '';
      this.form.gstin = s.gstin || '';
      this.form.phone_number = s.phone_number || '';
      this.form.custom_dish_profit_margin = Number(s.custom_dish_profit_margin || 30);
      this.form.gst_rate = Number(s.gst_rate || 5);
      this.form.bill_terms = s.bill_terms || '';
      this.form.qr_image_path = s.qr_image_path || '';
      this.form.show_restaurant_name = (s.show_restaurant_name !== false);
      this.form.show_address = (s.show_address !== false);
      this.form.show_gstin = (s.show_gstin !== false);
      this.form.show_phone = (s.show_phone !== false);
    } catch (e) {
      this.saveError = e?.message || 'Failed to load settings';
    }

    // Load notification toggles from browser storage (does not touch DB).
    this.applySavedNotificationPrefs();
  },
  beforeUnmount() {
    if (this._settingsRecalc) window.removeEventListener('resize', this._settingsRecalc);
  },
  methods: {
    tabStyle(id) {
      const active = this.section === id;
      return {
        background: active ? '#6F4E37' : 'white',
        color: active ? 'white' : '#1A1208',
        borderColor: active ? '#6F4E37' : 'rgba(111,78,55,0.18)',
        boxShadow: active ? '0 10px 24px rgba(111,78,55,0.18)' : 'none'
      };
    },
    async uploadQr(e) {
      try {
        const file = e?.target?.files?.[0];
        if (!file) return;
        const api = (await import('../js/api.js')).default;

        const fd = new FormData();
        fd.append('file', file);

        const res = await fetch('/api/manager/uploads/image', {
          method: 'POST',
          headers: { 'Authorization': api.getToken() || '' },
          body: fd
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && (data.error || data.message)) || 'Upload failed');

        this.form.qr_image_path = (data && data.path) ? data.path : '';
      } catch (err) {
        this.saveError = err?.message || 'Upload failed';
      } finally {
        if (e && e.target) e.target.value = '';
      }
    },
    async save() {
      this.saveOk = false;
      this.saveError = '';
      this.saving = true;
      try {
        const api = (await import('../js/api.js')).default;
        await api.updateManagerSettings(this.form);
        this.saveOk = true;
        setTimeout(() => { this.saveOk = false; }, 1500);
        this.$emit('refresh');
      } catch (e) {
        this.saveError = e?.message || 'Failed to save settings';
      } finally {
        this.saving = false;
      }
    },
    _defaultNotifPrefs() {
      return {
        new_orders: true,
        low_stock: true,
        daily_summary: false,
        staff_notifications: true,
      };
    },
    _readNotifPrefs() {
      try {
        const raw = localStorage.getItem(this.$options.__NOTIF_STORAGE_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;
        return obj;
      } catch {
        return null;
      }
    },
    _writeNotifPrefs(prefs) {
      try {
        localStorage.setItem(this.$options.__NOTIF_STORAGE_KEY, JSON.stringify(prefs || {}));
      } catch {
        // ignore (storage might be blocked)
      }
      try {
        window.dispatchEvent(new CustomEvent('dineflow:notification-settings-changed', { detail: prefs || {} }));
      } catch {
        // ignore
      }
    },
    applySavedNotificationPrefs() {
      const saved = this._readNotifPrefs() || {};
      const defaults = this._defaultNotifPrefs();
      const prefs = { ...defaults, ...saved };
      for (const n of (this.notificationSettings || [])) {
        if (!n || !n.key) continue;
        if (prefs[n.key] == null) continue;
        n.enabled = Boolean(prefs[n.key]);
      }
    },
    persistNotificationPrefs() {
      const defaults = this._defaultNotifPrefs();
      const prefs = { ...defaults };
      for (const n of (this.notificationSettings || [])) {
        if (!n || !n.key) continue;
        prefs[n.key] = Boolean(n.enabled);
      }
      this._writeNotifPrefs(prefs);

      // Reuse existing "Saved." indicator without changing UI layout.
      this.saveError = '';
      this.saveOk = true;
      setTimeout(() => { this.saveOk = false; }, 1200);
    },
  }
};
