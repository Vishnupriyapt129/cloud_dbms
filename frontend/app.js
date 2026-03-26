// Dynamically mounts to ANY custom domain name seamlessly!
const API_BASE = (window.location.protocol === 'file:' || window.location.origin === 'null') ? 'http://localhost:5000/api' : window.location.origin + '/api';

function getActiveUid() {
    return localStorage.getItem('cloudhub_uid') || '1';
}

async function authFetch(url, options = {}) {
    const headers = { ...options.headers, 'Authorization': getActiveUid() };
    return fetch(url, { ...options, headers });
}

let currentFolderId = '1';
let currentFileId = '1';

document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('cloudhub_role');
    if (!role) {
        window.location.href = 'login.html';
        return;
    }
    document.body.classList.add(`role-${role}`);

    fetchUserData();
    checkApprovalStatus();
    fetchFolders();
    fetchFiles();
    fetchAccessControl();
    fetchActivityLogs();
    fetchAdminRequests();
    setupTabs();
    setupProfileDropdown();
});

function setupProfileDropdown() {
    const profileBtn = document.getElementById('profile-dropdown-btn');
    const dropdownMenu = document.getElementById('profile-dropdown-menu');
    if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-item')) {
                dropdownMenu.classList.toggle('active');
            }
        });
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    }
}

function setupTabs() {
    // Make the File Manager layout icons act like tabs
    const iconBtns = document.querySelectorAll('.card-tools .icon-btn');
    iconBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            iconBtns.forEach(b => b.classList.remove('active'));
            const target = e.target.closest('.icon-btn');
            if (target) {
                target.classList.add('active');
                
                // Toggle Grid/List mode
                const isGrid = target.querySelector('.fa-grid-2') || target.querySelector('.fa-table-cells');
                const tableContainer = document.querySelector('.table-responsive');
                if (isGrid) {
                    tableContainer.classList.add('grid-view');
                } else {
                    tableContainer.classList.remove('grid-view');
                }
            }
        });
    });
}

// Helper for icons based on file type
function getFileIconClass(type) {
    if (type === 'PDF') return 'bg-pdf fa-file-pdf';
    if (type === 'Excel') return 'bg-excel fa-file-excel';
    if (type === 'PowerPoint') return 'bg-powerpoint fa-file-powerpoint';
    if (type === 'Text') return 'bg-text fa-file-lines';
    return 'bg-default fa-file';
}

function getActivityIcon(iconType) {
    if (iconType === 'upload') return 'fa-arrow-up-from-bracket';
    if (iconType === 'share') return 'fa-share-nodes';
    if (iconType === 'trash') return 'fa-trash';
    if (iconType === 'login') return 'fa-right-to-bracket';
    if (iconType === 'folder') return 'fa-folder-plus';
    return 'fa-check';
}

async function fetchUserData() {
    try {
        const res = await authFetch(`${API_BASE}/user?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const user = result.data;
            document.getElementById('nav-username').textContent = user.name;
            document.getElementById('welcome-message').textContent = `Welcome, ${user.name}!`;

            // Dropdown menu updates
            const dropdownName = document.getElementById('dropdown-name');
            const dropdownEmail = document.getElementById('dropdown-email');
            if(dropdownName) dropdownName.textContent = user.name;
            if(dropdownEmail) dropdownEmail.textContent = user.email || '';

            // Storage updates
            let usedGB = Number(user.storage.used_gb);
            let totalGB = Number(user.storage.total_gb);
            let usedStr;
            if (usedGB === 0) {
                usedStr = "0 MB";
            } else if (usedGB < 1/1024) {
                usedStr = (usedGB * 1024 * 1024).toFixed(1) + " KB";
            } else if (usedGB < 1) {
                usedStr = (usedGB * 1024).toFixed(1) + " MB";
            } else {
                usedStr = usedGB.toFixed(2) + " GB";
            }
            document.getElementById('storage-text').textContent = `Storage Used: ${usedStr} out of ${totalGB} GB`;

            // Ensure even tiny sizes (like MBs out of 20GB) show a visual slice of green!
            let progressPercent = Number(user.storage.percentage) || 0;
            if (usedGB > 0 && progressPercent < 1.5) {
                progressPercent = 1.5; // Hardcode a visual baseline of 1.5% pixels wide.
            }

            // Set progress bar with small delay for animation
            setTimeout(() => {
                document.getElementById('storage-fill').style.width = `${progressPercent}%`;
            }, 300);
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        document.getElementById('welcome-message').textContent = 'Welcome!';
    }
}

async function checkApprovalStatus() {
    const role = localStorage.getItem('cloudhub_role');
    if (role === 'admin') return;
    try {
        const uid = getActiveUid();
        const res = await authFetch(`${API_BASE}/user/status/${uid}`);
        const result = await res.json();
        if (result.status === 'success' && result.data.request_status === 'pending') {
            window.cloudhubIsPending = true;
            const uploadBtn = document.getElementById('upload-btn');
            const createBtn = document.getElementById('create-folder-btn');
            if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.title = 'Pending Admin Approval'; }
            if (createBtn) { createBtn.disabled = true; createBtn.title = 'Pending Admin Approval'; }
        }
    } catch(e) {}
}

async function fetchFolders() {
    try {
        const res = await authFetch(`${API_BASE}/folders?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const folders = result.data;
            const container = document.getElementById('folder-list');
            container.innerHTML = ''; // clear loading text

            folders.forEach((folder) => {
                const div = document.createElement('div');
                div.className = 'folder-item';
                
                // Keep the visual styling synced with the actual selected folder ID
                if (folder.id === currentFolderId) {
                    div.classList.add('active-folder');
                    document.querySelector('.breadcrumbs').innerHTML = `<i class="fa-solid fa-house"></i> ${folder.name} <span class="divider">|</span> Directory <i class="fa-solid fa-chevron-down"></i>`;
                }
                
                div.innerHTML = `
                    <div class="folder-icon"><i class="fa-solid fa-folder"></i></div>
                    <div class="folder-name">${folder.name}</div>
                `;
                
                // Add click listener to act as tabs
                div.addEventListener('click', () => {
                    document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active-folder'));
                    div.classList.add('active-folder');
                    
                    document.querySelector('.breadcrumbs').innerHTML = `<i class="fa-solid fa-house"></i> ${folder.name} <span class="divider">|</span> Directory <i class="fa-solid fa-chevron-down"></i>`;
                    
                    fetchFiles(folder.id);
                });
                
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error fetching folders:", error);
    }
}

async function fetchFiles(folderId = currentFolderId) {
    currentFolderId = folderId;
    try {
        const res = await authFetch(`${API_BASE}/files?folder_id=${folderId}`);
        const result = await res.json();

        if (result.status === 'success') {
            const files = result.data;
            const tbody = document.getElementById('file-list');
            tbody.innerHTML = ''; // clear loading text

            files.forEach(file => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.onclick = (e) => {
                    if(e.target.closest('.action-btn')) return;
                    currentFileId = file.id;
                    fetchAccessControl(file.id);
                };
                const classes = getFileIconClass(file.type).split(' ');
                const bgClass = classes[0];
                const iClass = classes[1];

                tr.innerHTML = `
                    <td>
                        <div class="file-name-cell">
                            <div class="file-icon ${bgClass}">
                                <i class="fa-solid ${iClass}"></i>
                            </div>
                            <span>${file.name}</span>
                        </div>
                    </td>
                    <td>${file.type}</td>
                    <td>${file.size}</td>
                    <td>${file.date_modified}</td>
                    <td>
                        <div class="file-actions">
                            <button class="action-btn" style="color: #e74c3c; ${window.cloudhubIsPending ? 'display:none;' : ''}" onclick="handleDeleteFile('${file.id}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error("Error fetching files:", error);
    }
}

async function fetchAccessControl(fileId = currentFileId) {
    try {
        const res = await authFetch(`${API_BASE}/access-control/${fileId}?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const ac = result.data;
            document.getElementById('access-filename').textContent = ac.file_name;

            const container = document.getElementById('access-list');
            container.innerHTML = '';

            ac.users.forEach(user => {
                const div = document.createElement('div');
                div.className = 'user-item';

                div.innerHTML = `
                    <div class="user-info">
                        <div class="avatar" style="width: 32px; height: 32px; font-size: 0.9rem;">
                            <i class="fa-solid fa-user"></i>
                        </div>
                        <div>
                            <div class="user-name">${user.name}</div>
                            <div class="user-role">${user.role}</div>
                        </div>
                    </div>
                    <div class="file-actions" style="opacity: 1;">
                        <button class="action-btn" style="background: transparent;" onclick="handleEditUser('${user.id}', '${user.role}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" style="background: transparent;" onclick="handleRemoveUser('${user.id}')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error fetching access control:", error);
    }
}

async function fetchActivityLogs() {
    try {
        const res = await authFetch(`${API_BASE}/activity?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const activities = result.data;
            const container = document.getElementById('activity-list');
            container.innerHTML = '';

            activities.forEach(log => {
                const li = document.createElement('li');
                li.className = 'activity-item';

                const iconClass = getActivityIcon(log.icon);

                li.innerHTML = `
                    <div class="activity-icon">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div>
                        <div class="activity-content">
                            <strong>${log.user_name}</strong> ${log.action} ${log.target}
                        </div>
                        <span class="activity-time">${log.time_ago}</span>
                    </div>
                `;
                container.appendChild(li);
            });
        }
    } catch (error) {
        console.error("Error fetching activity logs:", error);
    }
}

async function fetchAdminRequests() {
    const role = localStorage.getItem('cloudhub_role');
    const panel = document.getElementById('admin-requests-panel');
    if (role !== 'admin') {
        if (panel) panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';

    try {
        const res = await authFetch(`${API_BASE}/admin/requests?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const requests = result.data;
            const container = document.getElementById('requests-list');
            const badge = document.getElementById('requests-badge');
            badge.textContent = requests.length;
            container.innerHTML = '';

            if (requests.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:24px 16px;opacity:0.65;">
                        <i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;"></i>
                        All caught up — no pending requests.
                    </div>`;
                return;
            }

            requests.forEach(req => {
                /* ---- Criteria evaluation logic ---- */
                const rolePassed   = req.user_role === 'user';
                const loginsPassed = req.recent_logins <= 5;
                const loginsFailed = !loginsPassed;
                const reasonPassed = req.reason && req.reason.length >= 15;
                const countPassed  = req.number_of_requests <= 3;        // not spamming
                const countWarned  = req.number_of_requests > 3;

                const chip = (ok, warn, label, detail) => {
                    const color = ok && !warn
                        ? 'rgba(46,204,113,0.18)'   // green
                        : warn
                            ? 'rgba(243,156,18,0.2)'  // orange
                            : 'rgba(231,76,60,0.2)';  // red
                    const border = ok && !warn
                        ? 'rgba(46,204,113,0.55)'
                        : warn
                            ? 'rgba(243,156,18,0.55)'
                            : 'rgba(231,76,60,0.55)';
                    const icon = ok && !warn ? 'fa-check-circle' : warn ? 'fa-triangle-exclamation' : 'fa-times-circle';
                    const iconColor = ok && !warn ? '#2ecc71' : warn ? '#f39c12' : '#e74c3c';
                    return `
                        <div style="background:${color};border:1px solid ${border};border-radius:8px;padding:8px 10px;font-size:0.78rem;">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                                <i class="fa-solid ${icon}" style="color:${iconColor};"></i>
                                <span style="font-weight:600;">${label}</span>
                            </div>
                            <div style="opacity:0.8;padding-left:20px;">${detail}</div>
                        </div>`;
                };

                const roleChip   = chip(rolePassed,  false,     'User Role',         rolePassed ? 'Regular user ✓' : 'Unknown role');
                const loginsChip = chip(loginsPassed, false,    'Recent Logins',     loginsPassed ? `${req.recent_logins} in 24h ✓` : `${req.recent_logins} in 24h (>5 limit)`);
                const reasonChip = chip(reasonPassed, false,    'Request Reason',    reasonPassed ? 'Reason provided ✓' : 'Reason too short!');
                const countChip  = chip(!countWarned, countWarned, 'Request Count',  `${req.number_of_requests} total request(s)`);

                /* ---- Overall recommendation ---- */
                const allGood = rolePassed && loginsPassed && reasonPassed && !countWarned;
                const recoBg     = allGood ? 'rgba(46,204,113,0.12)' : 'rgba(243,156,18,0.12)';
                const recoBorder = allGood ? 'rgba(46,204,113,0.4)'  : 'rgba(243,156,18,0.4)';
                const recoIcon   = allGood ? '✅' : '⚠️';
                const recoText   = allGood ? 'Criteria met — recommended to <strong>Accept</strong>' : 'Some criteria flagged — review carefully';

                const div = document.createElement('div');
                div.className = 'request-item';
                div.style.cssText = 'margin-bottom:18px;padding:16px;background:rgba(255,255,255,0.05);border-radius:14px;border:1px solid var(--glass-border);';

                div.innerHTML = `
                    <!-- Header row -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                        <div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:34px;height:34px;border-radius:50%;background:rgba(101,173,136,0.3);border:2px solid rgba(101,173,136,0.5);display:flex;align-items:center;justify-content:center;">
                                    <i class="fa-solid fa-user" style="font-size:0.9rem;color:#bde0d0;"></i>
                                </div>
                                <div>
                                    <strong style="font-size:1rem;">${req.user_name}</strong>
                                    <span style="margin-left:6px;font-size:0.78rem;opacity:0.65;background:rgba(255,255,255,0.1);padding:2px 7px;border-radius:20px;">${req.user_role}</span>
                                </div>
                            </div>
                        </div>
                        <span style="font-size:0.76rem;background:rgba(0,0,0,0.25);padding:3px 9px;border-radius:12px;white-space:nowrap;">${req.date_requested}</span>
                    </div>

                    <!-- Request type + reason -->
                    <div style="background:rgba(0,0,0,0.15);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:0.9rem;color:#65ad88;margin-bottom:4px;">
                            <i class="fa-solid fa-tag" style="margin-right:6px;"></i>${req.request_type}
                        </div>
                        <div style="font-size:0.83rem;opacity:0.82;font-style:italic;">"${req.reason}"</div>
                    </div>

                    <!-- Criteria grid -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                        ${roleChip}${loginsChip}${reasonChip}${countChip}
                    </div>

                    <!-- Recommendation banner -->
                    <div style="background:${recoBg};border:1px solid ${recoBorder};border-radius:8px;padding:8px 12px;font-size:0.82rem;margin-bottom:12px;">
                        ${recoIcon} ${recoText}
                    </div>

                    <!-- Action buttons -->
                    <div style="display:flex;gap:12px;">
                        <button id="approve-btn-${req.id}" class="btn btn-accept" ${!allGood ? 'disabled' : ''} onclick="handleRequestAction('${req.id}', 'approve')" style="flex:1;">
                            <i class="fa-solid ${allGood ? 'fa-check' : 'fa-lock'}"></i> Accept
                        </button>
                        <button id="reject-btn-${req.id}" class="btn btn-reject" onclick="handleRequestAction('${req.id}', 'reject')" style="flex:1;">
                            <i class="fa-solid fa-xmark"></i> Reject
                        </button>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error('Error fetching requests:', error);
        document.getElementById('requests-list').innerHTML = '<div style="opacity:0.65;text-align:center;padding:16px;">Failed to load requests. Is Flask running?</div>';
    }
}

async function handleRequestAction(reqId, action) {
    const label = action === 'approve' ? 'accept' : 'reject';
    showModal({
        title: action === 'approve' ? 'Accept Request' : 'Reject Request',
        desc: `Are you sure you want to ${label} this access request? This action will be logged.`,
        showInput: false,
        onConfirm: async () => {
            const approveBtn = document.getElementById(`approve-btn-${reqId}`);
            const rejectBtn  = document.getElementById(`reject-btn-${reqId}`);
            if (approveBtn) approveBtn.disabled = true;
            if (rejectBtn)  rejectBtn.disabled  = true;

            try {
                const res = await authFetch(`${API_BASE}/admin/requests/${reqId}/${action}`, { method: 'POST' });
                const result = await res.json();
                if (result.status === 'success') {
                    fetchAdminRequests();
                    fetchActivityLogs();
                    showModal({
                        title: action === 'approve' ? 'Request Accepted' : 'Request Rejected',
                        desc: action === 'approve'
                            ? 'The user has been approved and can now access the dashboard.'
                            : 'The request has been rejected and logged.',
                        showInput: false,
                        onConfirm: () => {}
                    });
                } else {
                    showModal({ title: 'Error', desc: 'Action failed: ' + result.message, showInput: false, onConfirm: () => {} });
                }
            } catch (e) {
                console.error('Request action failed', e);
                if (approveBtn) approveBtn.disabled = false;
                if (rejectBtn)  rejectBtn.disabled  = false;
                showModal({
                    title: 'Network Error',
                    desc: 'Backend server is unreachable. Please make sure Flask is running.',
                    showInput: false,
                    onConfirm: () => {}
                });
            }
        }
    });
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_id', currentFolderId);

    try {
        const res = await authFetch(`${API_BASE}/files/upload`, {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (result.status === 'success') {
            fetchFiles(); 
            fetchActivityLogs();
            fetchUserData();
            showModal({ title: "Upload Success", desc: "File uploaded successfully!", showInput: false, onConfirm: () => {} });
        }
    } catch (e) {
        console.error("Upload failed", e);
    }
}

function handleDeleteFile(fileId) {
    showModal({
        title: "Delete File",
        desc: "Are you sure you want to permanently delete this file from the cloud? This action cannot be undone.",
        showInput: false,
        onConfirm: async () => {
            try {
                const res = await authFetch(`${API_BASE}/files/${fileId}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.status === 'success') {
                    fetchFiles();
                    fetchActivityLogs();
                    fetchUserData();
                } else {
                    showModal({ title: "Delete Error", desc: result.message, showInput: false, onConfirm: () => {} });
                }
            } catch(e) {
                console.error("Delete failed", e);
            }
        }
    });
}

function handleAddUser() {
    showModal({
        title: "Grant Specific Access",
        desc: "Enter the email or name of the user to grant access:",
        showInput: true,
        onConfirm: async (name) => {
            if (!name) return;
            try {
                const res = await authFetch(`${API_BASE}/access-control/${currentFileId}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: name, role: 'Editor' })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    await fetchAccessControl(); 
                    fetchActivityLogs();
                    showModal({ title: "Database Updated", desc: name + " has been successfully granted access privileges.", showInput: false, onConfirm: () => {} });
                } else {
                    showModal({ title: "Registration Error", desc: "Registration lookup failed: " + result.message, showInput: false, onConfirm: () => {} });
                }
            } catch (e) {
                if (e.message.includes('NetworkError') || e.message.includes('Failed to fetch') || e.name === 'TypeError') {
                    showModal({ title: "Network Disconnected", desc: "SERVER IS OFFLINE: Your browser cannot communicate with Flask! Please run 'python app.py' in your backend terminal.", showInput: false, onConfirm: () => {} });
                } else {
                    showModal({ title: "Backend Crash", desc: "Critical execution failure: " + e.message, showInput: false, onConfirm: () => {} });
                }
            }
        }
    });
}

function handleNewFolder() {
    showModal({
        title: "Create Folder",
        desc: "Enter a name for your new directory:",
        showInput: true,
        onConfirm: async (folderName) => {
            if (!folderName) return;
            try {
                const res = await authFetch(`${API_BASE}/folders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: folderName })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    fetchFolders(); 
                    fetchActivityLogs();
                }
            } catch (e) {
                console.error("Create folder failed", e);
            }
        }
    });
}

function handleRemoveUser(userId) {
    showModal({
        title: "Revoke Access",
        desc: "Are you absolutely sure you want to remove this user's privileges?",
        showInput: false,
        onConfirm: async () => {
            try {
                const res = await authFetch(`${API_BASE}/access-control/${currentFileId}/users/${userId}`, { method: 'DELETE' });
                const result = await res.json();
                if(result.status === 'success') {
                    fetchAccessControl();
                    fetchActivityLogs();
                }
            } catch(e) { console.error("Remove user failed", e); }
        }
    });
}

function handleEditUser(userId, currentRole) {
    showModal({
        title: "Modify Access Level",
        desc: "Enter new role constraint (Editor, Viewer, Admin):",
        showInput: true,
        defaultValue: currentRole,
        onConfirm: (newRole) => {
            if (!newRole) return;
        }
    });
}

function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    const rows = document.querySelectorAll('#file-list tr');
    
    rows.forEach(row => {
        // Skip any completely empty or loading rows
        if (row.cells && row.cells.length <= 1) return;
        
        const fileNameCell = row.querySelector('.file-name-cell span');
        if (fileNameCell) {
            const text = fileNameCell.textContent.toLowerCase();
            // Show or hide based on match
            if (text.includes(query)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

function handleLogout() {
    localStorage.removeItem('cloudhub_role');
    window.location.href = 'login.html';
}

// Custom UI Modal Engine
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

function triggerLogout() {
    showModal({
        title: "Sign Out",
        desc: "Are you sure you want to log out of your session?",
        showInput: false,
        onConfirm: () => {
            handleLogout();
        }
    });
}