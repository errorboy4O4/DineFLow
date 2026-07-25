import api from '../js/api.js';

const { ref, computed, onMounted } = Vue;

let _qrLibPromise = null;
async function _getQrLib() {
  if (_qrLibPromise) return _qrLibPromise;
  // ESM build via jsdelivr. If this fails (offline), we still show the URL text.
  _qrLibPromise = import('https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm');
  return _qrLibPromise;
}

async function _makeQrDataUrl(text, size = 220) {
  const mod = await _getQrLib();
  const QRCode = mod.default || mod;
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}

let _pdfLibPromise = null;
async function _getPdfLib() {
  if (_pdfLibPromise) return _pdfLibPromise;
  _pdfLibPromise = import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
  return _pdfLibPromise;
}

export default {
  template: `
    <div class="slide-up" style="max-width:1120px;margin:0 auto;">
      <div style="margin-bottom:1.25rem;">
        <h2 style="font-family:'Playfair Display',serif;font-weight:800;font-size:1.6rem;color:#1A1208;margin:0;">Staff Access Control</h2>
        <p style="margin:0.35rem 0 0;color:#9C8E84;font-weight:700;">Generate QR codes for staff login and manage role-based access to DineFlow.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Chef -->
        <div class="panel" style="border:2px solid rgba(111,78,55,0.25);">
          <div class="p-4 border-b flex items-center gap-3" style="border-color:rgba(111,78,55,0.1)">
            <div style="width:44px;height:44px;border-radius:12px;background:#6F4E37;color:#F8F5F0;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">
              <i class="bi bi-fire"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;font-size:1.05rem;">Chef</div>
              <div style="font-size:0.8125rem;color:#9C8E84;font-weight:700;">Kitchen station access</div>
            </div>
          </div>

          <div style="padding:1.25rem;">
            <div style="background:#F8F5F0;border-radius:0.75rem;padding:0.9rem 1rem;color:#6B5744;font-weight:800;display:flex;gap:0.75rem;align-items:flex-start;">
              <i class="bi bi-info-circle" style="margin-top:2px;"></i>
              <div>Chefs scan this QR to access the kitchen order queue and recipe system.</div>
            </div>

            <div style="margin-top:1rem;display:flex;flex-direction:column;gap:0.75rem;">
              <button @click="openRoleQr('chef')" class="btn-primary" style="width:100%;padding:0.85rem;border-radius:0.75rem;font-weight:900;background:#6F4E37;">
                <i class="bi bi-qr-code" style="margin-right:0.5rem;"></i> Generate Chef QR Code
              </button>
              <button @click="openRoleDashboard('chef')" class="btn-ghost" style="width:100%;padding:0.85rem;border-radius:0.75rem;font-weight:900;">
                <i class="bi bi-box-arrow-up-right" style="margin-right:0.5rem;"></i> Open Chef Dashboard
              </button>
            </div>
          </div>
        </div>

        <!-- Waiter -->
        <div class="panel" style="border:2px solid rgba(58,175,169,0.35);">
          <div class="p-4 border-b flex items-center gap-3" style="border-color:rgba(111,78,55,0.1)">
            <div style="width:44px;height:44px;border-radius:12px;background:#3AAFA9;color:#F8F5F0;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">
              <i class="bi bi-person-badge"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;font-size:1.05rem;">Waiter</div>
              <div style="font-size:0.8125rem;color:#9C8E84;font-weight:700;">Service floor access</div>
            </div>
          </div>

          <div style="padding:1.25rem;">
            <div style="background:#EDF7F6;border-radius:0.75rem;padding:0.9rem 1rem;color:#2A8F8A;font-weight:800;display:flex;gap:0.75rem;align-items:flex-start;">
              <i class="bi bi-info-circle" style="margin-top:2px;"></i>
              <div>Waiters scan this QR to access table management, orders and billing.</div>
            </div>

            <div style="margin-top:1rem;display:flex;flex-direction:column;gap:0.75rem;">
              <button @click="openRoleQr('waiter')" class="btn-primary" style="width:100%;padding:0.85rem;border-radius:0.75rem;font-weight:900;background:#3AAFA9;">
                <i class="bi bi-qr-code" style="margin-right:0.5rem;"></i> Generate Waiter QR Code
              </button>
              <button @click="openRoleDashboard('waiter')" class="btn-ghost" style="width:100%;padding:0.85rem;border-radius:0.75rem;font-weight:900;color:#2A8F8A;border-color:rgba(58,175,169,0.55);">
                <i class="bi bi-box-arrow-up-right" style="margin-right:0.5rem;"></i> Open Waiter Dashboard
              </button>
            </div>
          </div>
        </div>

        <!-- Tables -->
        <div class="panel lg:col-span-2" style="border:2px solid rgba(244,162,97,0.45);max-width:920px;margin:0 auto;">
          <div class="p-4 border-b flex items-center gap-3" style="border-color:rgba(111,78,55,0.1)">
            <div style="width:44px;height:44px;border-radius:12px;background:#F4A261;color:#1A1208;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">
              <i class="bi bi-grid-3x3-gap"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;font-size:1.05rem;">Table QR Codes</div>
              <div style="font-size:0.8125rem;color:#9C8E84;font-weight:700;">Per-table digital menu access for guests</div>
            </div>
          </div>

          <div style="padding:1.25rem;">
            <div style="background:#FFFBF0;border-radius:0.75rem;padding:0.9rem 1rem;color:#92400E;font-weight:800;display:flex;gap:0.75rem;align-items:flex-start;">
              <i class="bi bi-info-circle" style="margin-top:2px;"></i>
              <div>Guests scan table QRs to view the digital menu and place orders. Generate one per table.</div>
            </div>

            <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
              <button @click="openTablesModal" class="btn-primary" style="padding:0.9rem 1.25rem;border-radius:0.75rem;font-weight:900;background:#F4A261;color:#1A1208;">
                <i class="bi bi-qr-code" style="margin-right:0.5rem;"></i> Generate Table QR Codes
              </button>
              <button @click="viewCurrentTables" class="btn-ghost" style="padding:0.9rem 1.25rem;border-radius:0.75rem;font-weight:900;border-color:rgba(244,162,97,0.6);color:#92400E;">
                <i class="bi bi-eye" style="margin-right:0.5rem;"></i> View Current QRs
              </button>
              <button @click="deleteAllTables" class="btn-ghost" style="padding:0.9rem 1.25rem;border-radius:0.75rem;font-weight:900;border-color:rgba(230,57,70,0.55);color:#E63946;">
                <i class="bi bi-trash" style="margin-right:0.5rem;"></i> Delete QRs
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Role QR modal -->
      <teleport to="body">
        <div v-show="roleQrOpen" @click.self="closeRoleQr"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:2000;padding:24px;">
          <div style="width:min(720px, calc(100vw - 48px));background:white;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,0.25);overflow:hidden;">
            <div :style="\`padding:1rem 1.25rem;background:\${roleQrHeaderBg};color:white;display:flex;align-items:center;justify-content:space-between;\`">
              <div style="display:flex;gap:0.75rem;align-items:center;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;">
                  <i :class="roleQrHeaderIcon"></i>
                </div>
                <div>
                  <div style="font-weight:900;font-size:1.05rem;">{{ roleQrTitle }}</div>
                  <div style="opacity:0.85;font-weight:700;font-size:0.8rem;">DineFlow Access Pass</div>
                </div>
              </div>
              <button @click="closeRoleQr" style="width:42px;height:42px;border-radius:12px;border:none;background:rgba(255,255,255,0.18);color:white;cursor:pointer;">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>

            <div style="padding:1.5rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center;justify-content:center;">
              <div style="width:240px;height:240px;border-radius:14px;background:#FAFAF7;border:1.5px solid #E5DDD5;display:flex;align-items:center;justify-content:center;">
                <img v-if="roleQrDataUrl" :src="roleQrDataUrl" alt="QR" style="width:220px;height:220px;display:block;" />
                <div v-else style="color:#9C8E84;font-weight:800;text-align:center;padding:1rem;">Generating QR...</div>
              </div>
              <div style="flex:1;min-width:260px;max-width:360px;">
                <div style="font-weight:900;color:#1A1208;font-size:1rem;margin-bottom:0.5rem;">Scan to open</div>
                <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;font-size:0.78rem;background:#F8F5F0;border:1.5px solid #E5DDD5;padding:0.75rem;border-radius:12px;word-break:break-all;">
                  {{ roleQrUrl }}
                </div>
                <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
                  <button class="btn-primary" @click="copy(roleQrUrl)" style="background:#1A1208;">
                    <i class="bi bi-clipboard" style="margin-right:0.5rem;"></i> Copy Link
                  </button>
                  <button class="btn-ghost" @click="openUrl(roleQrUrl)">
                    <i class="bi bi-box-arrow-up-right" style="margin-right:0.5rem;"></i> Open
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </teleport>

      <!-- Tables modal -->
      <teleport to="body">
        <div v-show="tablesOpen" @click.self="closeTablesModal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:2000;padding:24px;">
          <div style="width:min(860px, calc(100vw - 48px));background:white;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,0.25);overflow:hidden;">
            <div style="padding:1rem 1.25rem;background:linear-gradient(135deg,#4A3423,#6F4E37);color:white;display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;gap:0.75rem;align-items:center;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;">
                  <i class="bi bi-grid-3x3-gap"></i>
                </div>
                <div>
                  <div style="font-weight:900;font-size:1.05rem;">Table QR Codes</div>
                  <div style="opacity:0.85;font-weight:700;font-size:0.8rem;">DineFlow Access Pass</div>
                </div>
              </div>
              <button @click="closeTablesModal" style="width:42px;height:42px;border-radius:12px;border:none;background:rgba(255,255,255,0.18);color:white;cursor:pointer;">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>

            <div style="padding:1.5rem;">
              <div v-if="!tablesGenerated">
                <div style="text-align:center;margin-top:0.25rem;">
                  <div style="font-size:2.25rem;margin-bottom:0.5rem;">🪑</div>
                  <div style="font-weight:900;font-size:1.25rem;color:#1A1208;">How many tables?</div>
                  <div style="margin-top:0.35rem;color:#9C8E84;font-weight:800;">Enter the number of tables (max 50)</div>
                </div>

                <div style="margin-top:1.25rem;display:flex;justify-content:center;">
                  <input v-model="tableCount" type="number" min="1" max="50" placeholder="e.g. 12"
                         style="width:160px;text-align:center;padding:0.85rem 1rem;border:1.5px solid #E5DDD5;border-radius:0.75rem;background:#FAFAF7;font-weight:900;font-size:1.05rem;" />
                </div>

                <div v-if="tablesError" style="margin-top:1rem;background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem;font-weight:900;text-align:center;">
                  {{ tablesError }}
                </div>

                <div style="margin-top:1.5rem;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
                  <button class="btn-ghost" @click="closeTablesModal" style="min-width:140px;padding:0.85rem 1.25rem;border-radius:0.75rem;font-weight:900;">
                    Cancel
                  </button>
                  <button class="btn-primary" @click="generateTables" :disabled="tablesLoading" style="min-width:220px;padding:0.85rem 1.25rem;border-radius:0.75rem;font-weight:900;background:#6F4E37;">
                    <i class="bi bi-qr-code" style="margin-right:0.5rem;"></i>
                    <span v-if="tablesLoading">Generating...</span>
                    <span v-else>Generate QR Codes</span>
                  </button>
                </div>
              </div>

              <div v-else>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:900;font-size:1.15rem;color:#1A1208;">Generated {{ tableQrs.length }} tables</div>
                    <div style="color:#9C8E84;font-weight:800;font-size:0.85rem;">Scan to open customer menu for each table.</div>
                  </div>
                  <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <button class="btn-ghost" @click="tablesGenerated=false" style="font-weight:900;">
                      Back
                    </button>
                    <button class="btn-ghost" @click="deleteAllTables" style="font-weight:900;border-color:rgba(230,57,70,0.55);color:#E63946;">
                      <i class="bi bi-trash" style="margin-right:0.5rem;"></i> Delete QRs
                    </button>
                    <button class="btn-primary" @click="exportTablesPdf" :disabled="pdfExporting" style="background:#1A1208;font-weight:900;">
                      <i class="bi bi-filetype-pdf" style="margin-right:0.5rem;"></i>
                      <span v-if="pdfExporting">Exporting...</span>
                      <span v-else>Export as PDF</span>
                    </button>
                  </div>
                </div>

                <div style="margin-top:1rem;max-height:420px;overflow:auto;padding-right:4px;">
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;">
                    <div v-for="t in tableQrs" :key="t.table_number" style="border:1.5px solid #E5DDD5;border-radius:16px;padding:0.85rem;background:#FAFAF7;">
                      <div style="display:flex;align-items:center;justify-content:space-between;">
                        <div style="font-weight:900;color:#1A1208;">Table {{ t.table_number }}</div>
                        <button @click="copy(t.url)" title="Copy link" style="border:none;background:transparent;color:#6F4E37;cursor:pointer;">
                          <i class="bi bi-clipboard"></i>
                        </button>
                      </div>
                      <div style="margin-top:0.6rem;display:flex;align-items:center;justify-content:center;">
                        <img v-if="t.qr" :src="t.qr" alt="QR" style="width:160px;height:160px;display:block;" />
                        <div v-else style="width:160px;height:160px;border-radius:12px;border:1.5px dashed #D9CFC6;display:flex;align-items:center;justify-content:center;color:#9C8E84;font-weight:900;">
                          QR...
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </teleport>
    </div>
  `,
  setup() {
    const roleQrOpen = ref(false);
    const roleQrType = ref('chef'); // chef | waiter
    const roleQrUrl = ref('');
    const roleQrDataUrl = ref('');

    const tablesOpen = ref(false);
    const tableCount = ref('');
    const tablesLoading = ref(false);
    const tablesError = ref('');
    const tablesGenerated = ref(false);
    const tableQrs = ref([]);
    const pdfExporting = ref(false);
    const viewingCurrent = ref(false);

    const resolvedOrigin = ref(window.location.origin);

    const origin = computed(() => resolvedOrigin.value || window.location.origin);

    const resolveOriginForQr = async () => {
      // Ask the backend for a best-effort LAN/hotspot origin (e.g., 192.168.137.1).
      // This is important because the laptop can be on Wi‑Fi (10.x) while also
      // hosting a hotspot (192.168.137.1). We want QRs to work for guests.
      try {
        const res = await api.getManagerPublicOrigin();
        const o = (res && res.origin) ? String(res.origin).trim() : '';
        if (o) resolvedOrigin.value = o.replace(/\/+$/, '');
      } catch {
        resolvedOrigin.value = window.location.origin;
      }
    };

    const roleQrTitle = computed(() => (roleQrType.value === 'chef' ? 'Chef QR Code' : 'Waiter QR Code'));
    const roleQrHeaderBg = computed(() =>
      roleQrType.value === 'chef' ? 'linear-gradient(135deg,#4A3423,#6F4E37)' : 'linear-gradient(135deg,#2A8F8A,#3AAFA9)'
    );
    const roleQrHeaderIcon = computed(() =>
      roleQrType.value === 'chef' ? 'bi bi-fire' : 'bi bi-person-badge'
    );

    const openUrl = (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore
      }
    };

    const openRoleDashboard = (role) => {
      const page = role === 'chef' ? '/chef-dashboard-mobile.html' : '/waiter.html';
      openUrl(`${origin.value}${page}`);
    };

    const openRoleQr = async (role) => {
      roleQrType.value = role;
      roleQrOpen.value = true;
      roleQrDataUrl.value = '';
      const page = role === 'chef' ? '/chef-dashboard-mobile.html' : '/waiter.html';
      const url = `${origin.value}${page}`;
      roleQrUrl.value = url;

      try {
        roleQrDataUrl.value = await _makeQrDataUrl(url, 220);
      } catch {
        roleQrDataUrl.value = '';
      }
    };

    const closeRoleQr = () => {
      roleQrOpen.value = false;
    };

    const openTablesModal = () => {
      tablesOpen.value = true;
      tablesGenerated.value = false;
      viewingCurrent.value = false;
      tablesError.value = '';
      tablesLoading.value = false;
      tableQrs.value = [];
      if (!tableCount.value) tableCount.value = '12';
    };

    onMounted(() => {
      resolveOriginForQr();
    });

    const closeTablesModal = () => {
      tablesOpen.value = false;
    };

    const generateTables = async () => {
      tablesError.value = '';
      const n = Number(tableCount.value);
      if (!Number.isFinite(n) || n <= 0 || n > 50) {
        tablesError.value = 'Please enter a number between 1 and 50.';
        return;
      }

      tablesLoading.value = true;
      try {
        const res = await api.ensureTables(n);
        const tables = res.tables || [];
        viewingCurrent.value = false;

        // Build URLs + QRs
        const list = tables.map((t) => {
          const url = `${origin.value}/customer.html?table=${encodeURIComponent(t.table_number)}&token=${encodeURIComponent(t.table_token)}`;
          return { table_number: t.table_number, table_token: t.table_token, url, qr: '' };
        });
        tableQrs.value = list;
        tablesGenerated.value = true;

        // Generate QRs (best-effort)
        for (let i = 0; i < tableQrs.value.length; i++) {
          try {
            tableQrs.value[i].qr = await _makeQrDataUrl(tableQrs.value[i].url, 200);
          } catch {
            tableQrs.value[i].qr = '';
          }
        }
      } catch (e) {
        tablesError.value = e?.message || 'Failed to generate tables';
      } finally {
        tablesLoading.value = false;
      }
    };

    const _loadTablesIntoQrs = async (tables) => {
      const list = (tables || []).map((t) => {
        const url = `${origin.value}/customer.html?table=${encodeURIComponent(t.table_number)}&token=${encodeURIComponent(t.table_token)}`;
        return { table_number: t.table_number, table_token: t.table_token, url, qr: '' };
      });
      tableQrs.value = list;
      tablesGenerated.value = true;

      for (let i = 0; i < tableQrs.value.length; i++) {
        try {
          tableQrs.value[i].qr = await _makeQrDataUrl(tableQrs.value[i].url, 200);
        } catch {
          tableQrs.value[i].qr = '';
        }
      }
    };

    const viewCurrentTables = async () => {
      tablesError.value = '';
      tablesOpen.value = true;
      tablesLoading.value = true;
      tablesGenerated.value = false;
      viewingCurrent.value = true;
      tableQrs.value = [];
      try {
        const res = await api.getTables();
        const tables = res.tables || [];
        if (tables.length === 0) {
          tablesError.value = 'No table QRs generated yet.';
          tablesGenerated.value = false;
          return;
        }
        await _loadTablesIntoQrs(tables);
      } catch (e) {
        tablesError.value = e?.message || 'Failed to load tables';
      } finally {
        tablesLoading.value = false;
      }
    };

    const deleteAllTables = async () => {
      if (!confirm('Delete all table QR codes? (Tables will be deactivated)')) return;
      tablesError.value = '';
      tablesLoading.value = true;
      try {
        const res = await api.clearTables();
        if (res && res.success) {
          tableQrs.value = [];
          tablesGenerated.value = false;
          viewingCurrent.value = false;
        }
      } catch (e) {
        tablesError.value = e?.message || 'Failed to delete table QRs';
      } finally {
        tablesLoading.value = false;
      }
    };

    const copyAllTableLinks = async () => {
      const text = (tableQrs.value || []).map(t => `Table ${t.table_number}: ${t.url}`).join('\n');
      await copy(text);
    };

    const exportTablesPdf = async () => {
      if (!tableQrs.value || tableQrs.value.length === 0) return;
      pdfExporting.value = true;
      tablesError.value = '';
      try {
        // Ensure QR images exist (best-effort)
        for (let i = 0; i < tableQrs.value.length; i++) {
          if (!tableQrs.value[i].qr) {
            try { tableQrs.value[i].qr = await _makeQrDataUrl(tableQrs.value[i].url, 220); } catch {}
          }
        }

        const mod = await _getPdfLib();
        const jsPDF = mod.jsPDF || (mod.default && mod.default.jsPDF) || mod.default;
        if (!jsPDF) throw new Error('PDF library failed to load');

        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        for (let i = 0; i < tableQrs.value.length; i++) {
          const t = tableQrs.value[i];
          if (i > 0) doc.addPage();

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(22);
          doc.text(`Table ${t.table_number}`, pageW / 2, 72, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(12);
          doc.text('Scan to open customer menu', pageW / 2, 94, { align: 'center' });

          const imgSize = 320;
          const x = (pageW - imgSize) / 2;
          const y = (pageH - imgSize) / 2 - 10;
          if (t.qr) {
            // PNG data URL from qrcode library
            doc.addImage(t.qr, 'PNG', x, y, imgSize, imgSize);
          }

          doc.setFontSize(9);
          const urlText = t.url || '';
          // Wrap URL across multiple lines if needed
          const maxWidth = pageW - 72;
          const lines = doc.splitTextToSize(urlText, maxWidth);
          doc.text(lines, 36, pageH - 72);
        }

        doc.save('table-qr-codes.pdf');
      } catch (e) {
        tablesError.value = e?.message || 'Failed to export PDF';
      } finally {
        pdfExporting.value = false;
      }
    };

    return {
      roleQrOpen,
      roleQrType,
      roleQrUrl,
      roleQrDataUrl,
      roleQrTitle,
      roleQrHeaderBg,
      roleQrHeaderIcon,

      tablesOpen,
      tableCount,
      tablesLoading,
      tablesError,
      tablesGenerated,
      tableQrs,
      pdfExporting,
      viewingCurrent,

      openUrl,
      copy,
      openRoleDashboard,
      openRoleQr,
      closeRoleQr,

      openTablesModal,
      closeTablesModal,
      generateTables,
      copyAllTableLinks,
      exportTablesPdf,
      viewCurrentTables,
      deleteAllTables,
    };
  }
};
