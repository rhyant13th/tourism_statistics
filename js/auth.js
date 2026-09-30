/**
 * LOGIN & ROLES: sign-in form, admin vs view-only mode, logout.
 */

function applyRoleUI() {
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = window.isAdmin ? '' : 'none';
    });
    const badge = document.getElementById('userRoleBadge');
    if (badge && window.currentUser) {
        badge.classList.remove('hidden');
        if (window.isAdmin) {
            badge.className = 'hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-800 text-teal-100';
            badge.innerHTML = '<i class="fa-solid fa-shield-halved mr-1"></i> Admin · ' + window.currentUser.email;
        } else {
            badge.className = 'hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-200';
            badge.innerHTML = '<i class="fa-solid fa-eye mr-1"></i> Viewer · ' + window.currentUser.email;
        }
    }
    // Re-render tables so action buttons respect the current role
    if (typeof renderAETable === 'function') try { renderAETable(); } catch(e) {}
    if (typeof renderTAssTable === 'function') try { renderTAssTable(); } catch(e) {}
}

function requireAdmin(actionName) {
    if (!window.isAdmin) {
        showToast('View-only mode: only the admin can ' + (actionName || 'make changes') + '.', 'warning');
        return false;
    }
    return true;
}

async function handleLogout() {
    try {
        if (window.firebaseAuthFns && window.firebaseAuth) {
            await window.firebaseAuthFns.signOut(window.firebaseAuth);
        }
    } catch (err) {
        console.error(err);
    }
}

function setupAuth() {
    return new Promise((resolve) => {
        const waitForAuth = () => {
            if (!window.firebaseAuth || !window.firebaseAuthFns) {
                setTimeout(waitForAuth, 50);
                return;
            }
            const { onAuthStateChanged, signInWithEmailAndPassword } = window.firebaseAuthFns;

            // Login form
            const form = document.getElementById('loginForm');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('loginEmail').value.trim();
                    const password = document.getElementById('loginPassword').value;
                    const errBox = document.getElementById('loginError');
                    const btn = document.getElementById('loginSubmitBtn');
                    errBox.classList.add('hidden');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
                    try {
                        await signInWithEmailAndPassword(window.firebaseAuth, email, password);
                    } catch (err) {
                        errBox.textContent = err.message || 'Login failed';
                        errBox.classList.remove('hidden');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign in';
                    }
                });
            }

            onAuthStateChanged(window.firebaseAuth, (user) => {
                window.currentUser = user;
                window.isAdmin = !!(user && ADMIN_EMAILS.includes(user.email));
                const overlay = document.getElementById('loginOverlay');
                const shell = document.getElementById('appShell');
                if (user) {
                    if (overlay) overlay.classList.add('hidden');
                    if (shell) {
                        shell.classList.remove('hidden');
                        shell.classList.add('flex');
                    }
                    applyRoleUI();
                    resolve(user);
                } else {
                    if (overlay) overlay.classList.remove('hidden');
                    if (shell) {
                        shell.classList.add('hidden');
                        shell.classList.remove('flex');
                    }
                    window.isAdmin = false;
                }
            });
        };
        waitForAuth();
    });
}
