
        const API_BASE = (window.location.protocol === 'file:' || window.location.origin === 'null') ? 'http://localhost:5000/api' : window.location.origin + '/api';
        let pendingUserId = null;

        /* ---- Screen Navigation ---- */
        function showScreen(name) {
            ['roles', 'admin', 'user-login', 'user', 'pending'].forEach(s =>
                document.getElementById('screen-' + s).style.display = 'none'
            );
            document.getElementById('screen-' + name).style.display = 'block';
        }

        function goBackToRoles() {
            showScreen('roles');
        }

        function togglePassword(inputId, iconElement) {
            const input = document.getElementById(inputId);
            if (input.type === 'password') {
                input.type = 'text';
                iconElement.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                iconElement.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }

        /* ---- Password Strength Checker ---- */
        function checkPasswordStrength(password) {
            const container = document.getElementById('password-strength-container');
            if (password.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';

            let strength = 0;
            if (password.length >= 8) strength += 25;
            if (password.match(/[A-Z]/)) strength += 25;
            if (password.match(/[0-9]/)) strength += 25;
            if (password.match(/[^A-Za-z0-9]/)) strength += 25;

            const bar = document.getElementById('strength-bar');
            const text = document.getElementById('strength-text');
            bar.style.width = strength + '%';

            if (strength <= 25) {
                bar.style.background = '#e74c3c';
                text.innerText = 'Strength: Weak';
                text.style.color = '#e74c3c';
            } else if (strength <= 50) {
                bar.style.background = '#f39c12';
                text.innerText = 'Strength: Fair';
                text.style.color = '#f39c12';
            } else if (strength <= 75) {
                bar.style.background = '#3498db';
                text.innerText = 'Strength: Good';
                text.style.color = '#3498db';
            } else {
                bar.style.background = '#2ecc71';
                text.innerText = 'Strength: Strong';
                text.style.color = '#2ecc71';
            }
        }

        /* ---- Custom UI Modal Engine ---- */
        function showModal({ title, desc, showInput = false, defaultValue = '', onConfirm }) {
            const modal = document.getElementById('custom-modal');
            const titleEl = document.getElementById('modal-title');
            const descEl = document.getElementById('modal-desc');
            const inputEl = document.getElementById('modal-input');
            const cancelBtn = document.getElementById('modal-cancel');
            const confirmBtn = document.getElementById('modal-confirm');

            titleEl.innerText = title;
            descEl.innerText = desc;

            inputEl.value = defaultValue;
            inputEl.style.display = showInput ? 'block' : 'none';

            modal.classList.add('active');
            if (showInput) inputEl.focus();

            const cleanup = () => {
                modal.classList.remove('active');
                cancelBtn.onclick = null;
                confirmBtn.onclick = null;
            };

            cancelBtn.onclick = cleanup;

            confirmBtn.onclick = () => {
                const val = inputEl.value;
                cleanup();
                onConfirm(showInput ? val : null);
            };
        }

        /* ---- Toast Helpers ---- */
        function showToast(type, msg) {
            const el = document.getElementById('toast-' + type);
            document.getElementById('toast-' + type + '-text').innerText = msg;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 3800);
        }

        /* ---- ADMIN LOGIN ---- */
        function handleAdminAuth(event) {
            if (event) event.preventDefault();
            const email = document.getElementById('admin-email').value.toLowerCase().trim();

            if (email !== 'anushakpramod24@gmail.com' && email !== 'vishnupriyapt29@gmail.com') {
                showToast('error', 'Access Denied: Invalid Administrator Credentials');
                const pwd = document.getElementById('admin-password');
                pwd.value = '';
                pwd.blur();
                document.getElementById('admin-email').focus();
                return;
            }

            const btn = document.getElementById('admin-submit-btn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

            setTimeout(() => {
                const uid = email.includes('vishnupriya') ? 2 : 1;
                localStorage.setItem('cloudhub_role', 'admin');
                localStorage.setItem('cloudhub_uid', uid);
                window.location.href = `index.html?role=admin&uid=${uid}`;
            }, 800);
        }

        /* ---- USER SIGN-UP + AUTO REQUEST ---- */
        async function handleUserSignup(event) {
            if (event) event.preventDefault();

            const name = document.getElementById('user-name').value.trim();
            const email = document.getElementById('user-email').value.toLowerCase().trim();
            const pwd = document.getElementById('user-password').value;
            const reqType = document.getElementById('user-request-type').value.trim();
            const reason = document.getElementById('user-reason').value.trim();

            if (!name) { showToast('error', 'Please enter your full name.'); return; }
            if (!email || !email.includes('@')) { showToast('error', 'Please enter a valid email address.'); return; }
            if (!pwd || pwd.length < 4) { showToast('error', 'Password must be at least 4 characters long.'); return; }
            if (!reason) { showToast('error', 'Please provide a reason for your access request.'); return; }

            const btn = document.getElementById('user-submit-btn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/user/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        email,
                        password: pwd,
                        request_type: reqType || 'General Access',
                        reason
                    })
                });

                const result = await res.json();

                if (result.status === 'success') {
                    pendingUserId = result.data.user_id;
                    document.getElementById('pending-name-display').textContent = name;
                    showScreen('pending');
                    showToast('success', 'Request submitted! Awaiting admin approval.');
                    
                    // Reset the form fields precisely so reopening it exhibits a blank slate
                    document.getElementById('user-name').value = '';
                    document.getElementById('user-email').value = '';
                    document.getElementById('user-password').value = '';
                    document.getElementById('user-request-type').value = '';
                    document.getElementById('user-reason').value = '';
                    checkPasswordStrength(''); // Reset the UI bar
                    
                    // Reset the button
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Access Request';
                    btn.disabled = false;
                    
                    // Execute a hard browser refresh sequence as requested
                    setTimeout(() => {
                        window.location.reload();
                    }, 2500);
                } else if (result.status === 'already_accepted') {
                    showToast('error', result.message);
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Access Request';
                    btn.disabled = false;
                } else {
                    showToast('error', result.message || 'Signup failed. Please try again.');
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Access Request';
                    btn.disabled = false;
                }
            } catch (e) {
                showToast('error', 'Server offline — run: python app.py');
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Access Request';
                btn.disabled = false;
            }
        }

        /* ---- USER LOGIN ---- */
        async function handleUserLogin(event) {
            if (event) event.preventDefault();

            const email = document.getElementById('user-login-email').value.toLowerCase().trim();
            const pwd = document.getElementById('user-login-password').value;

            if (!email || !pwd) { showToast('error', 'Please enter your email and password.'); return; }

            const btn = document.getElementById('user-login-btn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/user/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password: pwd })
                });

                const result = await res.json();

                if (result.status === 'success') {
                    // Set credentials immediately to avoid race conditions with app.js on the dashboard
                    localStorage.setItem('cloudhub_role', 'user');
                    localStorage.setItem('cloudhub_uid', result.data.user_id);
                    
                    showToast('success', 'Login successful! Redirecting to your dashboard...');
                    
                    setTimeout(() => {
                        window.location.href = 'index.html'; 
                    }, 800);
                } else {
                    showToast('error', result.message || 'Login failed.');
                    document.getElementById('user-login-password').value = '';
                    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In as User';
                    btn.disabled = false;
                }
            } catch (e) {
                showToast('error', 'Server offline — run: python app.py');
                btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In as User';
                btn.disabled = false;
            }
        }

        /* ---- CHECK APPROVAL STATUS ---- */
        async function checkApprovalStatus() {
            if (!pendingUserId) {
                showToast('error', 'Session lost. Please sign up again.');
                return;
            }
            const btn = document.querySelector('#screen-pending .submit-btn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/user/status/${pendingUserId}`);
                const result = await res.json();

                if (result.status === 'success') {
                    const s = result.data.request_status;
                    if (s === 'accepted') {
                        showToast('success', 'Approved! Redirecting to your dashboard...');
                        setTimeout(() => {
                            localStorage.setItem('cloudhub_role', 'user');
                            localStorage.setItem('cloudhub_uid', pendingUserId);
                            window.location.href = `index.html?role=user&uid=${pendingUserId}`;
                        }, 1400);
                        return;
                    } else if (s === 'rejected') {
                        showToast('error', 'Your request was rejected by the admin.');
                    } else {
                        showToast('error', 'Still pending — please wait for admin review.');
                    }
                } else {
                    showToast('error', 'Could not fetch your status. Try again shortly.');
                }
            } catch (e) {
                showToast('error', 'Server offline — run: python app.py');
            }

            btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Check Approval Status';
            btn.disabled = false;
        }
    