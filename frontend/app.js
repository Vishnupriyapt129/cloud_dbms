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
    
    // UI Role Distinction
    const roleLabel = document.getElementById('nav-role');
    if (roleLabel) roleLabel.textContent = role === 'admin' ? 'Master Administrator' : 'Cloud User';

    if (role === 'admin') {
        const adminEls = document.querySelectorAll('.admin-only');
        adminEls.forEach(el => {
            if (el.tagName === 'LI') el.style.display = 'list-item';
            else el.style.display = 'block';
        });
        
        // Admins start on the Requests page if there are any
        fetchAdminRequests().then(() => {
            const badge = document.getElementById('requests-badge-nav');
            if (badge && parseInt(badge.textContent) > 0) {
                changeView('requests');
            }
        });
    }

    fetchUserData();
    checkApprovalStatus();
    fetchFolders();
    fetchAccessControl();
    fetchActivityLogs();
    
    if (role === 'admin') {
        fetchAdminUsersList();
    }
    setupProfileDropdown();
});

function changeView(view) {
    // 1. Update active sidebar item
    document.querySelectorAll('.side-nav li').forEach(li => li.classList.remove('active'));
    const activeLi = document.getElementById(`nav-${view}`);
    if (activeLi) activeLi.classList.add('active');

    // Hide all main containers
    const containers = ['folder-grid', 'file-panel', 'admin-requests-view', 'admin-users-view', 'admin-home-view', 'folder-breadcrumb'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const actionArea = document.getElementById('action-area');
    const welcome = document.getElementById('welcome-message');
    const banner = document.querySelector('.banner-section');
    const role = localStorage.getItem('cloudhub_role');

    // 2. Logic for each view
    const isAdminView = ['home', 'requests', 'users'].includes(view) && role === 'admin';
    if (banner) {
        if (isAdminView) banner.classList.add('admin-banner');
        else banner.classList.remove('admin-banner');
    }

    if (view === 'home') {
        if (role === 'admin') {
            welcome.textContent = 'Admin Command Center';
            if (actionArea) actionArea.style.display = 'none';
            document.getElementById('admin-home-view').style.display = 'block';
        } else {
            closeFolder();
            welcome.textContent = 'Vault Access';
            if (actionArea) actionArea.style.display = 'flex';
            document.getElementById('folder-grid').style.display = 'grid';
            fetchFolders(true);
        }
    } else if (view === 'folders') {
        closeFolder();
        welcome.textContent = 'Cloud Folders';
        if (actionArea) actionArea.style.display = 'flex';
        document.getElementById('folder-grid').style.display = 'grid';
        fetchFolders(true);
    } else if (view === 'requests') {
        welcome.textContent = 'Admin: User Requests';
        if (actionArea) actionArea.style.display = 'none';
        document.getElementById('admin-requests-view').style.display = 'block';
        fetchAdminRequests();
    } else if (view === 'users') {
        welcome.textContent = 'Admin: User Directory';
        if (actionArea) actionArea.style.display = 'none';
        document.getElementById('admin-users-view').style.display = 'block';
        showAdminUserGrid();
    } else if (view === 'recent') {
        document.getElementById('file-panel').style.display = 'none';
        welcome.textContent = 'Recent Activity (Last 24h)';
        if (actionArea) actionArea.style.display = 'none';
        document.getElementById('folder-grid').style.display = 'grid';
        fetchRecentOnlyGrid();
    } else {
        if (actionArea) actionArea.style.display = 'none';
        const grid = document.getElementById('folder-grid');
        grid.style.display = 'grid';
        grid.innerHTML = `
            <div class="placeholder-view" style="grid-column: 1 / -1; text-align:center; padding: 60px 0;">
                <i class="fa-solid fa-hourglass-half" style="font-size: 4rem; color: var(--border); margin-bottom: 20px; display:block;"></i>
                <h2 style="color: var(--text-muted);">${view.toUpperCase()} view coming soon</h2>
                <button class="btn btn-accent" style="margin: 20px auto;" onclick="changeView('home')">Return Home</button>
            </div>
        `;
        const viewNames = { 'shared':'Shared with Me', 'trash':'Trash Bin' };
        welcome.textContent = viewNames[view] || 'Vault';
    }
}

async function fetchRecentFilesForHome() {
    try {
        const res = await authFetch(`${API_BASE}/files?limit=6`);
        const result = await res.json();
        const grid = document.getElementById('folder-grid');
        
        if (result.status === 'success' && result.data.length > 0) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'grid-column: 1 / -1; margin-bottom: 30px;';
            wrapper.innerHTML = `
                <div style="font-weight:700; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)"></i> Recently Active
                </div>
                <div id="recent-files-strip" style="display:flex; gap:15px; overflow-x:auto; padding-bottom:10px;"></div>
            `;
            grid.appendChild(wrapper);

            const strip = wrapper.querySelector('#recent-files-strip');
            result.data.forEach(file => {
                const card = document.createElement('div');
                card.className = 'recent-file-card';
                card.onclick = () => { /* open specific view if needed */ };
                const iconClass = getFileIconClass(file.type).split(' ')[1];
                card.innerHTML = `
                    <div class="file-mini-icon"><i class="fa-solid ${iconClass}"></i></div>
                    <div class="file-mini-name">${file.name}</div>
                `;
                strip.appendChild(card);
            });

            // Add "All Folders" section title
            const folderHeading = document.createElement('div');
            folderHeading.style.cssText = 'grid-column: 1 / -1; font-weight:700; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin: 10px 0 15px;';
            folderHeading.innerHTML = '<i class="fa-solid fa-folder-tree"></i> Root Directories';
            grid.appendChild(folderHeading);
        }
    } catch(e) { console.error("Home Recent Fetch Error:", e); }
}

async function fetchRecentOnlyGrid() {
    try {
        const res = await authFetch(`${API_BASE}/files?filter=recent`);
        const result = await res.json();
        const grid = document.getElementById('folder-grid');
        grid.innerHTML = ''; 

        if (result.status === 'success') {
            const files = result.data;
            if (files.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding: 60px 0; color:var(--text-muted);"><i class="fa-solid fa-clock-rotate-left" style="font-size:3rem; margin-bottom:15px; opacity:0.3;"></i><p>No uploaded files in the last 24 hours.</p></div>';
                return;
            }

            files.forEach(file => {
                const card = document.createElement('div');
                card.className = 'recent-file-card';
                card.style.width = '100%';
                const iconBase = getFileIconClass(file.type);
                const iClass = iconBase.split(' ')[1];
                card.innerHTML = `
                    <div class="file-mini-icon"><i class="fa-solid ${iClass}"></i></div>
                    <div class="file-mini-name">${file.name}</div>
                    <div style="font-size:0.6rem; opacity:0.4; margin-top:5px;">Uploaded ${file.date_modified}</div>
                `;
                grid.appendChild(card);
            });
        }
    } catch(e) { console.error("Recent Grid Fetch Error:", e); }
}

async function showFullActivityLog() {
    // Reuse existing logic, but ensure limit 50 is used
    const res = await authFetch(`${API_BASE}/activity?limit=50`);
    const result = await res.json();
    
    if (result.status === 'success') {
        const logs = result.data;
        let html = '<div style="max-height: 480px; overflow-y:auto; padding-right:10px;">';
        logs.forEach(log => {
            html += `
                <div style="padding: 14px; border-bottom: 1px solid var(--border); display:flex; gap:15px; align-items:center; transition:0.2s; cursor:default;" class="log-row">
                    <span style="font-size: 0.65rem; color: var(--text-muted); width:90px; flex-shrink:0;">${log.time_ago}</span>
                    <strong style="color: var(--primary); font-size:0.9rem;">${log.user_name}</strong>
                    <span style="font-size:0.9rem;">${log.action}</span>
                    <span style="opacity:0.4; font-size: 0.8rem; margin-left:auto;">${log.target || 'System'}</span>
                </div>
            `;
        });
        html += '</div>';

        const modal = document.getElementById('custom-modal');
        const title = document.getElementById('modal-title');
        const desc = document.getElementById('modal-desc');
        const input = document.getElementById('modal-input');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        title.innerHTML = '<i class="fa-solid fa-history" style="color:var(--primary)"></i> Activity History';
        desc.innerHTML = html;
        input.style.display = 'none';
        confirmBtn.textContent = 'Dismiss Log';
        confirmBtn.onclick = () => modal.classList.remove('active');
        cancelBtn.style.display = 'none';
        
        modal.classList.add('active');
    }
}

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
            const is_admin = user.role === 'admin';
            
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

            const storageLabel = document.querySelector('.storage-labels span:first-child');
            if (storageLabel) {
                storageLabel.textContent = is_admin ? 'Global Capacity' : 'Used Storage';
            }

            const storageText = document.getElementById('sidebar-storage-text');
            if (storageText) {
                storageText.textContent = `${usedStr} / ${totalGB} GB`;
                storageText.title = is_admin ? 'Sum of all user storage' : 'Your personal storage';
            }

            // Hide Upgrade for Admin
            const upgradeBtn = document.querySelector('.btn-upgrade');
            if (upgradeBtn) {
                upgradeBtn.style.display = is_admin ? 'none' : 'block';
            }

            // Ensure even tiny sizes (like MBs out of 20GB) show a visual slice of green!
            let progressPercent = Number(user.storage.percentage) || 0;
            if (usedGB > 0 && progressPercent < 1.5) {
                progressPercent = 1.5; // Hardcode a visual baseline of 1.5% pixels wide.
            }

            if (is_admin) {
                const totalUsers = document.getElementById('admin-total-users');
                const totalLimit = document.getElementById('admin-total-limit');
                const totalUsed = document.getElementById('admin-total-used');
                const usedPerc = document.getElementById('admin-used-percent');
                
                if (totalUsers) totalUsers.textContent = user.user_count || 0;
                if (totalLimit) totalLimit.textContent = `${totalGB} GB`;
                if (totalUsed) totalUsed.textContent = usedStr;
                if (usedPerc) usedPerc.textContent = `${Number(user.storage.percentage).toFixed(1)}% Utilization`;
            }

            // Set progress bar with small delay for animation
            setTimeout(() => {
                const fill = document.getElementById('sidebar-storage-fill');
                if (fill) fill.style.width = `${progressPercent}%`;
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

async function fetchFolders(clear = true) {
    try {
        const res = await authFetch(`${API_BASE}/folders?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const folders = result.data;
            const grid = document.getElementById('folder-grid');
            if (!grid) return;
            if (clear) grid.innerHTML = '';

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

async function fetchFiles(folderId = currentFolderId, filterType = null) {
    currentFolderId = folderId;
    const tbody = document.getElementById('file-list');
    const emptyState = document.getElementById('file-empty-state');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading...
    </td></tr>`;
    if (emptyState) emptyState.style.display = 'none';

    try {
        let url = `${API_BASE}/files?t=${Date.now()}`;
        if (folderId && folderId !== 'null' && folderId !== null) url += `&folder_id=${folderId}`;
        if (filterType) url += `&filter=${filterType}`;

        const res = await authFetch(url);
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

                li.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                        <span style="font-weight:600; font-size:0.8rem;">
                            <span style="color:var(--primary)">${log.user_name}</span> ${log.action}
                        </span>
                        <span style="font-size:0.65rem; opacity:0.5; white-space:nowrap; margin-top:2px;">${log.time_ago}</span>
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
    if (role !== 'admin') return;

    try {
        const res = await authFetch(`${API_BASE}/admin/requests?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const requests = result.data;
            const container = document.getElementById('requests-list');
            const badgeNav = document.getElementById('requests-badge-nav');
            
            if (badgeNav) {
                badgeNav.textContent = requests.length;
                badgeNav.style.display = requests.length > 0 ? 'inline-block' : 'none';
            }
            if (!container) return;
            
            container.innerHTML = '';

            if (requests.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align:center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed var(--border);">
                        <i class="fa-solid fa-circle-check" style="font-size:3rem; color:var(--success); margin-bottom:15px; opacity:0.5;"></i>
                        <h3>All requests handled</h3>
                        <p style="color:var(--text-muted);">No new access requests requiring approval at this time.</p>
                    </div>`;
                return;
            }

            requests.forEach(req => {
                const rolePassed   = req.user_role === 'user';
                const loginsPassed = req.recent_logins <= 5;
                const reasonPassed = req.reason && req.reason.length >= 10;
                const countPassed  = req.number_of_requests <= 3;

                const chip = (ok, label, detail) => {
                    const color = ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
                    const border = ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
                    const icon = ok ? 'fa-check' : 'fa-xmark';
                    const iconColor = ok ? 'var(--success)' : 'var(--accent)';
                    return `
                        <div style="background:${color}; border:1px solid ${border}; border-radius:8px; padding:8px 12px; font-size:0.75rem;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i class="fa-solid ${icon}" style="color:${iconColor}"></i>
                                <strong>${label}</strong>
                            </div>
                            <div style="margin-top:2px; opacity:0.75;">${detail}</div>
                        </div>`;
                };

                const div = document.createElement('div');
                div.className = 'admin-card';
                div.style.padding = '24px';

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div class="avatar-sm"><i class="fa-solid fa-user"></i></div>
                            <div>
                                <h4 style="margin:0;">${req.user_name}</h4>
                                <small style="color:var(--text-muted);">${req.user_role}</small>
                            </div>
                        </div>
                        <small style="color:var(--text-muted);">${req.date_requested}</small>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); border-radius:12px; padding:12px; margin-bottom:15px; border-left:3px solid var(--primary);">
                        <div style="font-weight:700; font-size:0.8rem; color:var(--primary); margin-bottom:4px;">REASON GIVEN:</div>
                        <div style="font-size:0.85rem; line-height:1.4;">"${req.reason}"</div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                        ${chip(rolePassed, 'Role', req.user_role)}
                        ${chip(loginsPassed, 'Activity', req.recent_logins + ' logins')}
                        ${chip(reasonPassed, 'Length', 'Valid context')}
                        ${chip(countPassed, 'Attempts', req.number_of_requests + ' request')}
                    </div>

                    <div style="display:flex; gap:12px;">
                        <button class="btn btn-accept" style="flex:1" onclick="handleRequestAction('${req.id}', 'approve')"><i class="fa-solid fa-check"></i> Accept</button>
                        <button class="btn btn-reject" style="flex:1" onclick="handleRequestAction('${req.id}', 'reject')"><i class="fa-solid fa-xmark"></i> Reject</button>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error('Error fetching requests:', error);
    }
}

let currentAdminTargetId = 'all';

async function fetchAdminUsersList() {
    const grid = document.getElementById('admin-user-grid');
    if (!grid) return;
    
    grid.innerHTML = '<div style="color:var(--text-muted); grid-column:1/-1;">Loading secure user index...</div>';

    try {
        const res = await authFetch(`${API_BASE}/admin/users-list`);
        const result = await res.json();
        if (result.status !== 'success') return;

        grid.innerHTML = '';
        result.data.forEach(user => {
            const card = document.createElement('div');
            card.className = 'folder-card';
            card.style.cssText = 'padding:24px; border-radius:16px; border:1px solid var(--border); transition:0.3s;';
            card.innerHTML = `
                <div style="font-size:2.4rem; color:var(--primary); margin-bottom:12px; opacity:0.8;"><i class="fa-solid fa-user-gear"></i></div>
                <div style="font-weight:700; font-size:1rem; color:white; margin-bottom:4px;">${user.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${user.file_count} Cloud Assets</div>
                <button class="btn btn-sm btn-accent" style="width:100%; margin-top:15px; font-size:0.7rem;">Explore Vault</button>
            `;
            card.onclick = () => exploreAdminUser(user.id, user.name, user.file_count);
            grid.appendChild(card);
        });
    } catch (e) { 
        console.error('Admin user list fetch failed', e);
        grid.innerHTML = '<div style="color:var(--accent);">Database communication error.</div>';
    }
}

function exploreAdminUser(uid, name, fileCount) {
    currentAdminTargetId = uid;
    document.getElementById('admin-user-selection').style.display = 'none';
    document.getElementById('admin-user-audit').style.display = 'block';
    
    document.getElementById('admin-current-target-name').textContent = `Auditing: ${name}`;
    document.getElementById('audit-file-count').textContent = fileCount;
    
    // We don't have a direct folder count in users-list, but we can fetch files to find out
    fetchAdminFiles(); 
}

function showAdminUserGrid() {
    currentAdminTargetId = 'all';
    document.getElementById('admin-user-selection').style.display = 'block';
    document.getElementById('admin-user-audit').style.display = 'none';
    fetchAdminUsersList(); // refresh
}

async function fetchAdminFiles() {
    const ownerId = currentAdminTargetId;
    const container = document.getElementById('admin-file-list');
    if (!container) return;

    container.innerHTML = '<div style="grid-column:1/-1; color:var(--text-muted); padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Indexing assets...</div>';

    try {
        const params = new URLSearchParams({ owner_id: ownerId });
        const res = await authFetch(`${API_BASE}/admin/files?${params}`);
        const result = await res.json();
        if (result.status !== 'success') return;

        const files = result.data;
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:rgba(0,0,0,0.1); border-radius:12px;">No discoverable files for this account.</div>';
            return;
        }

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'audit-file-card';
            const iconClass = getFileIconClass(file.type).split(' ')[1];
            
            card.innerHTML = `
                <div class="audit-file-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="audit-file-info">
                    <span class="name">${file.name}</span>
                    <span class="meta">${file.type} • ${file.size}</span>
                </div>
                <button class="btn-icon-xs" title="Download Audit Copy" onclick="handleDownloadFile('${file.id}')">
                    <i class="fa-solid fa-download"></i>
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Admin file list error', e);
        container.innerHTML = '<div style="color:var(--accent);">Asset retrieval failure</div>';
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
