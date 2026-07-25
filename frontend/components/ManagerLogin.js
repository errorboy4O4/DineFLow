import api from '../js/api.js';

const { ref } = Vue;

export default {
  template: `
    <div style="min-height:100vh;background:linear-gradient(135deg,#F8F5F0 0%,#EDE8E0 100%);display:flex;align-items:center;justify-content:center;padding:1.25rem;">
      <div style="width:100%;max-width:980px;background:white;border-radius:1.75rem;box-shadow:0 24px 60px rgba(60,40,25,0.18);border:1px solid rgba(111,78,55,0.14);overflow:hidden;display:flex;flex-wrap:wrap;">
        <!-- Brand panel -->
        <div style="flex:1 1 360px;min-width:320px;background:linear-gradient(135deg,#6F4E37 0%,#2A9D8F 100%);padding:2.25rem 2.25rem;position:relative;color:white;">
          <div style="position:absolute;inset:-40% -30% auto auto;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle at center, rgba(255,255,255,0.18), rgba(255,255,255,0));filter:blur(0px);"></div>
          <div style="position:absolute;inset:auto auto -35% -20%;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle at center, rgba(0,0,0,0.10), rgba(0,0,0,0));"></div>

          <div style="position:relative;z-index:1;">
            <div style="display:flex;align-items:center;gap:0.875rem;">
              <div style="width:54px;height:54px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.22);border-radius:16px;display:flex;align-items:center;justify-content:center;">
                <i class="bi bi-cup-hot" style="font-size:1.55rem;"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:1.85rem;line-height:1;color:#fff;">DineFlow</div>
                <div style="margin-top:0.35rem;font-size:0.85rem;font-weight:700;opacity:0.9;letter-spacing:0.04em;">MANAGER PORTAL</div>
              </div>
            </div>

            <div style="margin-top:1.5rem;font-size:1.02rem;font-weight:700;line-height:1.35;max-width:28ch;">
              Run your restaurant faster — pricing, inventory, approvals, and analytics in one place.
            </div>

            <div style="margin-top:1.35rem;display:flex;flex-direction:column;gap:0.75rem;">
              <div style="display:flex;align-items:flex-start;gap:0.65rem;">
                <i class="bi bi-check2-circle" style="margin-top:0.1rem;opacity:0.95;"></i>
                <div style="font-weight:700;opacity:0.95;">Approve orders and track live batches</div>
              </div>
              <div style="display:flex;align-items:flex-start;gap:0.65rem;">
                <i class="bi bi-check2-circle" style="margin-top:0.1rem;opacity:0.95;"></i>
                <div style="font-weight:700;opacity:0.95;">Manage inventory with low/out alerts</div>
              </div>
              <div style="display:flex;align-items:flex-start;gap:0.65rem;">
                <i class="bi bi-check2-circle" style="margin-top:0.1rem;opacity:0.95;"></i>
                <div style="font-weight:700;opacity:0.95;">Set pricing and monitor margins</div>
              </div>
            </div>

            <div style="margin-top:1.75rem;padding:0.85rem 0.95rem;border-radius:0.95rem;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.18);">
              <div style="font-size:0.72rem;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">Tip</div>
              <div style="margin-top:0.35rem;font-weight:700;opacity:0.95;font-size:0.9rem;">
                Use the demo account to explore the dashboard quickly.
              </div>
            </div>
          </div>
        </div>

        <!-- Form panel -->
        <div style="flex:1 1 420px;min-width:320px;padding:2.25rem 2.25rem;">
          <div style="margin-bottom:1.35rem;">
            <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.5rem;color:#1A1208;">Sign in</div>
            <div style="margin-top:0.35rem;color:#6B5744;font-weight:600;font-size:0.92rem;">
              Enter your credentials to continue.
            </div>
          </div>

        <div v-if="error" style="background:#FEE2E2;border:1.5px solid #E63946;color:#991B1B;padding:0.875rem 1rem;border-radius:0.625rem;margin-bottom:1.5rem;font-size:0.875rem;font-weight:700;">
          {{ error }}
        </div>

        <form @submit.prevent="handleLogin" style="display:flex;flex-direction:column;gap:1.25rem;">
          <div>
            <label style="display:block;font-weight:700;font-size:0.875rem;color:#1A1208;margin-bottom:0.625rem;">Email Address</label>
            <div style="position:relative;">
              <i class="bi bi-envelope" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9C8E84;"></i>
              <input
                v-model="email"
                type="email"
                placeholder="manager@dineflow.com"
                required
                autocomplete="username"
                style="width:100%;padding:0.875rem 1rem 0.875rem 2.5rem;border:1.5px solid #E5DDD5;border-radius:0.9rem;font-family:'DM Sans',sans-serif;font-size:0.95rem;transition:border-color 0.2s, box-shadow 0.2s;outline:none;"
                @focus="$event.target.style.borderColor='#6F4E37';$event.target.style.boxShadow='0 0 0 4px rgba(111,78,55,0.10)'"
                @blur="$event.target.style.borderColor='#E5DDD5';$event.target.style.boxShadow='none'"
              />
            </div>
          </div>

          <div>
            <label style="display:block;font-weight:700;font-size:0.875rem;color:#1A1208;margin-bottom:0.625rem;">Password</label>
            <div style="position:relative;">
              <i class="bi bi-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9C8E84;"></i>
              <input
                v-model="password"
                type="password"
                placeholder="Enter your password"
                required
                autocomplete="current-password"
                style="width:100%;padding:0.875rem 1rem 0.875rem 2.5rem;border:1.5px solid #E5DDD5;border-radius:0.9rem;font-family:'DM Sans',sans-serif;font-size:0.95rem;transition:border-color 0.2s, box-shadow 0.2s;outline:none;"
                @focus="$event.target.style.borderColor='#6F4E37';$event.target.style.boxShadow='0 0 0 4px rgba(111,78,55,0.10)'"
                @blur="$event.target.style.borderColor='#E5DDD5';$event.target.style.boxShadow='none'"
              />
            </div>
          </div>

          <button
            type="submit"
            :disabled="loading"
            style="background:#6F4E37;color:white;border:none;border-radius:0.9rem;padding:0.9rem 1.5rem;font-family:'DM Sans',sans-serif;font-weight:900;font-size:1rem;cursor:pointer;transition:background 0.2s, transform 0.05s;margin-top:0.25rem;box-shadow:0 10px 22px rgba(111,78,55,0.18);"
            @mouseover="$event.target.style.background='#4A3423'"
            @mouseout="$event.target.style.background='#6F4E37'"
            @mousedown="$event.target.style.transform='translateY(1px)'"
            @mouseup="$event.target.style.transform='translateY(0px)'"
          >
            <span v-if="loading"><i class="bi bi-hourglass-split" style="margin-right:0.5rem;"></i>Logging in...</span>
            <span v-else><i class="bi bi-arrow-right" style="margin-right:0.5rem;"></i>Login</span>
          </button>
        </form>

        <div style="margin-top:1.5rem;background:#F8F5F0;border:1px solid rgba(111,78,55,0.15);border-radius:1rem;padding:0.95rem 1rem;">
          <div style="font-size:0.75rem;color:#9C8E84;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;">Demo Credentials</div>
          <div style="margin-top:0.25rem;font-size:0.875rem;color:#1A1208;font-weight:700;">
            dine@gmail.com / 12345
          </div>
          <button @click="fillDemo" type="button" class="btn-ghost" style="margin-top:0.75rem;width:100%;">
            Use Demo Account
          </button>
        </div>
        </div>
      </div>
    </div>
  `,
  emits: ['login-success'],
  setup(props, { emit }) {
    const email = ref('');
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    const fillDemo = () => {
      email.value = 'dine@gmail.com';
      password.value = '12345';
    };

    const handleLogin = async () => {
      error.value = '';
      loading.value = true;

      try {
        const result = await api.login(email.value, password.value);

        if (result.success && result.token) {
          api.setToken(result.token);
          emit('login-success', result);
        } else {
          error.value = result.message || 'Login failed. Please try again.';
        }
      } catch (e) {
        error.value = e?.message || 'Error logging in. Please check your credentials.';
        console.error('Login error:', e);
      } finally {
        loading.value = false;
      }
    };

    return {
      email,
      password,
      error,
      loading,
      fillDemo,
      handleLogin
    };
  }
};
