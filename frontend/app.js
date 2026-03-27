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
    // fetchFiles() is now called only when a folder is opened
    fetchAccessControl();
    fetchActivityLogs();
    fetchAdminRequests();
    if (role === 'admin') {
        fetchAdminUsersList();
        fetchAdminFiles();
    }
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
            document.getElementById('sidebar-storage-text').textContent = `Storage Used: ${usedStr} out of ${totalGB} GB`;

            // Ensure even tiny sizes (like MBs out of 20GB) show a visual slice of green!
            let progressPercent = Number(user.storage.percentage) || 0;
            if (usedGB > 0 && progressPercent < 1.5) {
                progressPercent = 1.5; // Hardcode a visual baseline of 1.5% pixels wide.
            }

            // Set progress bar with small delay for animation
            setTimeout(() => {
                document.getElementById('sidebar-storage-fill').style.width = `${progressPercent}%`;
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
            const grid = document.getElementById('folder-grid');
            if (!grid) return;
            grid.innerHTML = '';

            if (folders.length === 0) {
                grid.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.35;"></i>
                    <p style="font-weight:500;">No folders yet</p>
                    <p style="font-size:0.85rem;opacity:0.7;">Click <strong>New Folder</strong> to create your first folder.</p>
                </div>`;
                return;
            }

            folders.forEach(folder => {
                const colorMap = { yellow:'#ffa502', blue:'#3498db', green:'#2ecc71', red:'#e74c3c', purple:'#9b59b6', gray:'#95a5a6' };
                const folderColor = colorMap[folder.color] || '#ffa502';
                const card = document.createElement('div');
                card.className = 'folder-card';
                card.dataset.folderId = folder.id;
                card.innerHTML = `
                    <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;" class="folder-actions">
                        <button class="action-btn" onclick="handleRenameFolder(event, '${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" onclick="handleDeleteFolder(event, '${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #e74c3c; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="folder-card-icon" style="color:${folderColor};">
                        <i class="fa-solid fa-folder"></i>
                    </div>
                    <div class="folder-card-name">${folder.name}</div>
                    <div class="folder-card-meta">
                        <i class="fa-regular fa-clock" style="font-size:0.7rem;"></i>
                        ${folder.created_at || 'Recent'}
                    </div>
                `;
                // Add hover effect specifically via JS if CSS is lacking
                card.onmouseenter = () => { const act = card.querySelector('.folder-actions'); if(act) act.style.opacity = '1'; };
                card.onmouseleave = () => { const act = card.querySelector('.folder-actions'); if(act) act.style.opacity = '0'; };

                card.addEventListener('click', (e) => {
                    // Prevent opening folder if clicking action buttons
                    if(e.target.closest('.action-btn')) return;
                    openFolder(folder.id, folder.name, folderColor);
                });
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error fetching folders:', error);
    }
}

function openFolder(folderId, folderName, folderColor = '#ffa502') {
    currentFolderId = folderId;

    // Switch views
    document.getElementById('folder-grid').style.display = 'none';
    document.getElementById('file-panel').style.display = 'block';

    // Show breadcrumb
    const bc = document.getElementById('folder-breadcrumb');
    bc.style.display = 'flex';
    document.getElementById('open-folder-name').textContent = folderName;
    document.querySelector('#folder-breadcrumb .fa-folder').style.color = folderColor;

    // Update header title
    // Removed browser-title

    // Show upload button
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) uploadArea.style.display = 'block';

    fetchFiles(folderId);
}

function closeFolder() {
    // Switch back to grid
    document.getElementById('folder-grid').style.display = '';
    document.getElementById('file-panel').style.display = 'none';
    document.getElementById('folder-breadcrumb').style.display = 'none';
    // Removed browser-title

    // Hide upload button
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) uploadArea.style.display = 'none';

    // Clear file list
    const tbody = document.getElementById('file-list');
    if (tbody) tbody.innerHTML = '';
    currentFolderId = null;
}

async function fetchFiles(folderId = currentFolderId) {
    currentFolderId = folderId;
    const tbody = document.getElementById('file-list');
    const emptyState = document.getElementById('file-empty-state');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading files...
    </td></tr>`;
    if (emptyState) emptyState.style.display = 'none';

    try {
        const res = await authFetch(`${API_BASE}/files?folder_id=${folderId}`);
        const result = await res.json();

        if (result.status === 'success') {
            const files = result.data;
            tbody.innerHTML = '';

            if (files.length === 0) {
                if (emptyState) emptyState.style.display = 'block';
                return;
            }

            files.forEach(file => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.onclick = (e) => {
                    if (e.target.closest('.action-btn')) return;
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
                            <button class="action-btn" style="color:#3498db;" title="Download"
                                onclick="handleDownloadFile('${file.id}')">
                                <i class="fa-solid fa-download"></i>
                            </button>
                            <button class="action-btn" style="color:#e74c3c;" title="Delete"
                                onclick="handleDeleteFile('${file.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error fetching files:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#e74c3c;">Failed to load files.</td></tr>`;
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
                const li = document.createElement('div');
                li.className = 'activity-item';

                const iconClass = getActivityIcon(log.icon);

                li.innerHTML = `
                    <div class="activity-content">
                        <strong>${log.user_name}</strong> ${log.action}
                    </div>
                    <span class="activity-time">${log.time_ago}</span>
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

// ─── ADMIN GLOBAL FILE MANAGER ──────────────────────────────────────────────

async function fetchAdminUsersList() {
    const panel = document.getElementById('admin-file-manager-panel');
    if (panel) panel.style.display = 'block';

    try {
        const res = await authFetch(`${API_BASE}/admin/users-list`);
        const result = await res.json();
        if (result.status !== 'success') return;

        const select = document.getElementById('admin-user-filter');
        if (!select) return;

        // Keep the "All Users" option, then add each user
        select.innerHTML = '<option value="all">All Users</option>';
        result.data.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name}  (${u.file_count} file${u.file_count !== 1 ? 's' : ''})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('fetchAdminUsersList error', e);
    }
}

async function fetchAdminFiles() {
    const ownerId = document.getElementById('admin-user-filter')?.value || 'all';
    const q       = document.getElementById('admin-file-search')?.value?.trim() || '';
    const tbody   = document.getElementById('admin-file-list');
    const empty   = document.getElementById('admin-files-empty');
    const badge   = document.getElementById('admin-files-count');

    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading...
    </td></tr>`;
    if (empty) empty.style.display = 'none';

    try {
        const params = new URLSearchParams({ owner_id: ownerId, q });
        const res = await authFetch(`${API_BASE}/admin/files?${params}`);
        const result = await res.json();

        if (result.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#e74c3c;">
                Failed to load files: ${result.message}
            </td></tr>`;
            return;
        }

        const files = result.data;
        if (badge) badge.textContent = files.length;
        tbody.innerHTML = '';

        if (files.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }

        files.forEach(file => {
            // Colour coding by type
            const iconMap = {
                'PDF':        ['bg-pdf',        'fa-file-pdf'],
                'Excel':      ['bg-excel',       'fa-file-excel'],
                'PowerPoint': ['bg-powerpoint',  'fa-file-powerpoint'],
                'Text':       ['bg-text',        'fa-file-lines'],
                'Image':      ['bg-default',     'fa-file-image'],
            };
            const [bgClass, iClass] = iconMap[file.type] || ['bg-default', 'fa-file'];

            const uid = getActiveUid();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="file-name-cell">
                        <div class="file-icon ${bgClass}">
                            <i class="fa-solid ${iClass}"></i>
                        </div>
                        <span title="${file.name}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${file.name}</span>
                    </div>
                </td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(55,130,93,0.12);border:1px solid rgba(55,130,93,0.3);color:#37825d;padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;">
                        <i class="fa-solid fa-user" style="font-size:0.75rem;"></i>${file.owner_name || '—'}
                    </span>
                </td>
                <td>${file.type}</td>
                <td>${file.size}</td>
                <td>${file.date_modified}</td>
                <td>
                    <div class="file-actions" style="opacity:1;">
                        <button class="action-btn" style="color:#3498db;" title="View / Download"
                            onclick="handleDownloadFile('${file.id}')">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('fetchAdminFiles error', e);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#e74c3c;">
            Server unreachable. Is Flask running?
        </td></tr>`;
    }
}

// ────────────────────────────────────────────────────────────────────────────

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
            showToast("success", "File uploaded successfully!");
        }
    } catch (e) {
        console.error("Upload failed", e);
    }
}

function handleDownloadFile(fileId) {
    const uid = getActiveUid();
    window.open(`${API_BASE}/files/download/${fileId}?uid=${uid}`, '_blank');
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

async function handleLogout() {
    try {
        await authFetch(`${API_BASE}/user/logout`, { method: 'POST' });
    } catch (e) {
        console.error("Logout API failed", e);
    }
    localStorage.removeItem('cloudhub_role');
    localStorage.removeItem('cloudhub_uid');
    window.location.href = 'login.html';
}

function handleRenameFolder(event, folderId, oldName) {
    if(event) event.stopPropagation();
    showModal({
        title: "Rename Folder",
        desc: "Enter a new name for this folder:",
        showInput: true,
        defaultValue: oldName,
        onConfirm: async (newName) => {
            if (!newName || newName.trim() === '' || newName === oldName) return;
            try {
                const res = await authFetch(`${API_BASE}/folders/${folderId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    fetchFolders();
                    fetchActivityLogs();
                } else {
                    showToast("error", result.message);
                }
            } catch (e) {
                console.error("Rename failed", e);
            }
        }
    });
}

function handleDeleteFolder(event, folderId, folderName) {
    if(event) event.stopPropagation();
    showModal({
        title: "Delete Folder",
        desc: `Are you sure you want to permanently delete "${folderName}" and all its contents? This action cannot be undone.`,
        showInput: false,
        onConfirm: async () => {
            try {
                const res = await authFetch(`${API_BASE}/folders/${folderId}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.status === 'success') {
                    fetchFolders();
                    fetchActivityLogs();
                    fetchUserData(); // Updates storage
                } else {
                    showToast("error", result.message);
                }
            } catch(e) {
                console.error("Delete failed", e);
            }
        }
    });
}

// ==========================================
// UX ENHANCEMENTS: TOASTS & DRAG-AND-DROP
// ==========================================

function showToast(type, message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutToast 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) forwards';
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

/* UPLOAD LOGIC */
function triggerFileUpload() {
    if (!currentFolderId) {
        showToast('warning', 'Please select a folder first!');
        return;
    }
    document.getElementById('file-upload-input').click();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if(!file || !currentFolderId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_id', currentFolderId);

    showToast('info', `Uploading ${file.name}...`);
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
            showToast('success', `${file.name} uploaded successfully!`);
        } else {
            showToast('error', result.message || 'Upload failed');
        }
    } catch (err) {
        showToast('error', 'Network error during upload');
    } finally {
        event.target.value = '';
    }
}

// Global Drag and Drop Uploader
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('drag-overlay');
    let dragTimer;

    if (!overlay) return;

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dt = e.dataTransfer;
        if (dt.types && (dt.types.indexOf ? dt.types.indexOf('Files') != -1 : dt.types.includes('Files'))) {
            overlay.classList.add('active');
            clearTimeout(dragTimer);
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragTimer = setTimeout(() => {
            overlay.classList.remove('active');
        }, 100);
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        overlay.classList.remove('active');
        
        if (!currentFolderId) {
            showToast('warning', 'Please select a folder first!');
            return;
        }

        let files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder_id', currentFolderId);
            
            showToast('info', `Uploading ${file.name}...`);
            
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
                    showToast('success', `${file.name} uploaded successfully!`);
                } else {
                    showToast('error', result.message || 'Upload failed');
                }
            } catch (err) {
                console.error("Upload Drop Failed", err);
                showToast('error', 'Network error during upload');
            }
        }
    });
});
