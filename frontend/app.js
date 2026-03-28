// Dynamically mounts to ANY custom domain name seamlessly!
const API_BASE = (window.location.protocol === 'file:' || window.location.origin === 'null') ? 'http://localhost:5000/api' : window.location.origin + '/api';

function getActiveUid() {
    return localStorage.getItem('cloudhub_uid') || '1';
}

async function authFetch(url, options = {}) {
    const headers = { ...options.headers, 'Authorization': getActiveUid() };
    return fetch(url, { ...options, headers });
}

let currentFolderId = null;    // ID of the folder currently open (null = folder grid)
let currentFolderName = null;  // Display name of the open folder
let currentFolderColor = '#ffa502'; // Colour of the open folder icon
let currentFileId = '1';
let viewGeneration = 0; // Incremented on every view change to cancel stale async renders

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
            } else {
                changeView('home');
            }
        });
    } else {
        // Standard user always starts on home
        changeView('home');
    }

    fetchUserData(); // Vital for populating top avatar/navbar for both roles
    checkApprovalStatus();
    fetchAccessControl();
    fetchActivityLogs();
    
    if (role === 'admin') {
        fetchAdminUsersList();
    }
    setupProfileDropdown();
});

function changeView(view) {
    viewGeneration++; // Invalidate any in-flight async renders from the previous view
    const gen = viewGeneration;
    // 1. Update active sidebar item
    document.querySelectorAll('.side-nav li').forEach(li => li.classList.remove('active'));
    const activeLi = document.getElementById(`nav-${view}`);
    if (activeLi) activeLi.classList.add('active');

    // Hide all main containers
    const containers = ['folder-grid', 'file-panel', 'admin-requests-view', 'admin-users-view', 'admin-home-view', 'user-home-view', 'folder-breadcrumb'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const actionArea = document.getElementById('action-area');
    const welcome = document.getElementById('welcome-message');
    const banner = document.querySelector('.banner-section');
    const role = localStorage.getItem('cloudhub_role');

    // Layout adjustment for User Directory logic
    const coreGrid = document.querySelector('.core-grid');
    const activityPanel = document.querySelector('.activity-panel');
    if (view === 'users') {
        if (coreGrid) coreGrid.style.gridTemplateColumns = '1fr';
        if (activityPanel) activityPanel.style.display = 'none';
    } else {
        if (coreGrid) coreGrid.style.gridTemplateColumns = '';
        if (activityPanel) activityPanel.style.display = 'flex';
    }

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
            welcome.textContent = 'My Dashboard';
            if (actionArea) actionArea.style.display = 'none';
            // NOTE: do NOT clear currentFolderId here — preserve folder state across tabs
            const userHome = document.getElementById('user-home-view');
            if (userHome) userHome.style.display = 'block';
            fetchUserData();
        }
    } else if (view === 'folders') {
        if (actionArea) actionArea.style.display = 'flex';

        if (currentFolderId) {
            // A folder is already open — restore the file panel immediately
            welcome.textContent = 'Cloud Folders';
            document.getElementById('folder-grid').style.display = 'none';
            document.getElementById('file-panel').style.display = 'block';
            const bc = document.getElementById('folder-breadcrumb');
            bc.style.display = 'flex';
            const nameEl = document.getElementById('open-folder-name');
            if (nameEl && currentFolderName) nameEl.textContent = currentFolderName;
            const folderIcon = document.querySelector('#folder-breadcrumb .fa-folder');
            if (folderIcon) folderIcon.style.color = currentFolderColor;
            fetchFiles(currentFolderId, null);
        } else {
            // No folder open — show folder grid
            welcome.textContent = 'Cloud Folders';
            const uploadArea = document.getElementById('upload-area');
            if (uploadArea) uploadArea.style.display = 'none';
            document.getElementById('folder-grid').style.display = 'grid';
            document.getElementById('file-panel').style.display = 'none';
            document.getElementById('folder-breadcrumb').style.display = 'none';
            fetchFolders(true, gen);
        }
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
        welcome.textContent = 'Recent Activity (Last 24h)';
        if (actionArea) actionArea.style.display = 'none';
        // NOTE: do NOT set file-panel display:none here — stay consistent, just hide file-panel
        document.getElementById('file-panel').style.display = 'none';
        document.getElementById('folder-grid').style.display = 'grid';
        fetchRecentOnlyGrid(gen);
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
        const container = document.getElementById('user-recent-files');
        if (!container) return;
        
        if (result.status === 'success' && result.data.length > 0) {
            container.innerHTML = `
                <div style="font-weight:700; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)"></i> Recently Active
                </div>
                <div id="recent-files-strip" style="display:flex; gap:15px; overflow-x:auto; padding-bottom:10px;"></div>
            `;

            const strip = container.querySelector('#recent-files-strip');
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
        }
    } catch(e) { console.error("Home Recent Fetch Error:", e); }
}

async function fetchRecentOnlyGrid(gen = viewGeneration) {
    try {
        const res = await authFetch(`${API_BASE}/files?filter=recent`);
        const result = await res.json();
        if (gen !== viewGeneration) return; // View changed while we were fetching — discard
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
            } else {
                const totalFolders = document.getElementById('user-total-folders');
                const totalFiles = document.getElementById('user-total-files');
                const totalUsed = document.getElementById('user-total-used');
                const usedPerc = document.getElementById('user-used-percent');
                
                if (totalFolders) totalFolders.textContent = user.folder_count || 0;
                if (totalFiles) totalFiles.textContent = user.file_count || 0;
                if (totalUsed) totalUsed.textContent = usedStr;
                if (usedPerc) usedPerc.textContent = `${Number(user.storage.percentage).toFixed(1)}% of 1 GB Quota`;
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

async function fetchFolders(clear = true, gen = viewGeneration) {
    try {
        const res = await authFetch(`${API_BASE}/folders?t=${Date.now()}`);
        const result = await res.json();
        if (gen !== viewGeneration) return; // View changed while fetching — discard stale result

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
    currentFolderName = folderName;   // persist for tab-switching restore
    currentFolderColor = folderColor; // persist for breadcrumb colour restore

    // Switch views
    document.getElementById('folder-grid').style.display = 'none';
    document.getElementById('file-panel').style.display = 'block';

    // Show breadcrumb
    const bc = document.getElementById('folder-breadcrumb');
    bc.style.display = 'flex';
    document.getElementById('open-folder-name').textContent = folderName;
    const folderIconEl = document.querySelector('#folder-breadcrumb .fa-folder');
    if (folderIconEl) folderIconEl.style.color = folderColor;

    // Show upload button
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) uploadArea.style.display = 'block';

    fetchFiles(folderId);
}

function closeFolder() {
    // Hide file panel and breadcrumb, show folder grid
    document.getElementById('folder-grid').style.display = 'grid';
    document.getElementById('file-panel').style.display = 'none';
    document.getElementById('folder-breadcrumb').style.display = 'none';

    // Hide upload area
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) uploadArea.style.display = 'none';

    // Clear file list and reset ALL folder state
    const tbody = document.getElementById('file-list');
    if (tbody) tbody.innerHTML = '';
    currentFolderId = null;
    currentFolderName = null;
    currentFolderColor = '#ffa502';
}

async function fetchFiles(folderId = currentFolderId, filterType = null) {
    currentFolderId = folderId;

    // Step 1: find tbody
    const tbody = document.getElementById('file-list');
    if (!tbody) {
        console.error('[fetchFiles] CRITICAL: #file-list tbody not found in DOM!');
        return;
    }

    // Step 2: find/hide empty state
    const emptyState = document.getElementById('file-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Step 3: ensure file-panel is visible
    const filePanel = document.getElementById('file-panel');
    if (filePanel) filePanel.style.display = 'block';

    // Step 4: show loading
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading files...
    </td></tr>`;

    try {
        // Step 5: build URL
        let url = `${API_BASE}/files?t=${Date.now()}`;
        if (folderId && folderId !== 'null' && folderId !== null) {
            url += `&folder_id=${folderId}`;
        }
        if (filterType) url += `&filter=${filterType}`;

        // Step 6: fetch
        const res = await authFetch(url);
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:#e74c3c;padding:20px;">Server error ${res.status}</td></tr>`;
            return;
        }

        const result = await res.json();

        // Step 7: clear and check
        tbody.innerHTML = '';

        if (result.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="5" style="color:#e74c3c;padding:20px;">API error: ${result.message}</td></tr>`;
            return;
        }

        const files = result.data;

        if (!files || files.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        // Step 8: render each file row
        files.forEach(file => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';

            const classes = getFileIconClass(file.type || '').split(' ');
            const bgClass = classes[0] || 'icon-bg-pdf';
            const iClass = classes[1] || 'fa-file';

            tr.innerHTML = `
                <td>
                    <div class="file-name-cell">
                        <div class="file-icon ${bgClass}">
                            <i class="fa-solid ${iClass}"></i>
                        </div>
                        <span>${file.name || 'Unnamed'}</span>
                    </div>
                </td>
                <td>${file.type || '-'}</td>
                <td>${file.size || '-'}</td>
                <td>${file.date_modified || '-'}</td>
                <td>
                    <div class="file-actions">
                        <button class="action-btn" style="color:${file.is_public ? '#f39c12' : '#95a5a6'};" 
                            title="${file.is_public ? 'Make Private' : 'Make Public'}"
                            onclick="event.stopPropagation(); togglePublicStatus('${file.id}', ${!file.is_public})">
                            <i class="fa-solid ${file.is_public ? 'fa-globe' : 'fa-lock'}"></i>
                        </button>
                        <button class="action-btn" style="color:#27ae60;" title="View"
                            onclick="event.stopPropagation(); handleViewAppFile('${file.id}')">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="action-btn" style="color:#3498db;" title="Download"
                            onclick="event.stopPropagation(); handleDownloadFile('${file.id}')">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="action-btn" style="color:#e74c3c;" title="Delete"
                            onclick="event.stopPropagation(); handleDeleteFile('${file.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            // Row click to load access control
            tr.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return;
                currentFileId = file.id;
                fetchAccessControl(file.id);
            });

            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('[fetchFiles] Exception:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="color:#e74c3c;padding:20px;">
            Error loading files: ${error.message}
        </td></tr>`;
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
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        grid.style.gap = '15px';

        result.data.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-directory-card';
            
            // Generate a random avatar colour based on name length for visual variety
            const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e'];
            const avatarColor = colors[user.name.length % colors.length];
            const initial = user.name.charAt(0).toUpperCase();

            card.innerHTML = `
                <div class="user-avatar" style="background: ${avatarColor};">
                    ${initial}
                </div>
                <div class="user-info">
                    <h4>${user.name}</h4>
                    <span class="user-meta">${user.file_count} Cloud Assets</span>
                </div>
                <button class="btn-explore" title="Audit User">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
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

function handleViewAppFile(fileId) {
    // Opens the file inline in a new tab (PDFs, images, videos will render; others will download)
    const uid = getActiveUid();
    window.open(`${API_BASE}/files/download/${fileId}?uid=${uid}`, '_blank');
}

function handleDownloadFile(fileId) {
    const uid = getActiveUid();
    const a = document.createElement('a');
    a.href = `${API_BASE}/files/download/${fileId}?uid=${uid}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

// ── LIVE SEARCH ──────────────────────────────────────────────────────────────
let _searchTimer = null;
let _searchResults = [];      // cache last results for keyboard navigation
let _searchHighlight = -1;    // index of currently highlighted dropdown item

function handleSearch(event) {
    const query = event.target.value.trim();
    clearTimeout(_searchTimer);

    if (!query) {
        closeSearchDropdown();
        document.querySelectorAll('#file-list tr').forEach(r => r.style.display = '');
        _searchResults = [];
        _searchHighlight = -1;
        return;
    }

    // Debounce: wait 280ms after last keystroke
    _searchTimer = setTimeout(() => runSearch(query), 280);
}


// Called via onkeydown="handleSearchKey(event)" on the search input
function handleSearchKey(e) {
    const items = document.querySelectorAll('#search-dropdown .search-item');

    if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchDropdown();
        e.target.value = '';
        _searchResults = [];
        _searchHighlight = -1;
        document.querySelectorAll('#file-list tr').forEach(r => r.style.display = '');
        return;
    }

    if (!items.length) return; // no dropdown open — nothing to navigate

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _searchHighlight = Math.min(_searchHighlight + 1, items.length - 1);
        updateSearchHighlight(items);

    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _searchHighlight = Math.max(_searchHighlight - 1, 0);
        updateSearchHighlight(items);

    } else if (e.key === 'Enter') {
        e.preventDefault();
        // Use the highlighted item, or fall back to the first result
        const idx = _searchHighlight >= 0 ? _searchHighlight : 0;
        if (_searchResults[idx]) {
            navigateToSearchResult(_searchResults[idx]);
        }
    }
}


function updateSearchHighlight(items) {
    items.forEach((el, i) => {
        if (i === _searchHighlight) {
            el.style.background = 'rgba(139,92,246,0.2)';
            el.style.borderLeft = '3px solid var(--primary)';
            el.scrollIntoView({ block: 'nearest' });
        } else {
            el.style.background = '';
            el.style.borderLeft = '3px solid transparent';
        }
    });
}

/** Shared: open the folder that contains this search result file */
function navigateToSearchResult(file) {
    closeSearchDropdown();
    document.getElementById('search-input').value = '';
    _searchResults = [];
    _searchHighlight = -1;

    if (!file.folder_id) return;

    // Set globals so the changeView router knows which folder is "open"
    currentFolderId = file.folder_id;
    currentFolderName = file.folder_name || 'Folder';
    currentFolderColor = '#ffa502'; // default color if unknown

    // Trigger full navigation transition to the Folders tab
    changeView('folders');
}

async function runSearch(query) {
    try {
        const res = await authFetch(`${API_BASE}/files/search?q=${encodeURIComponent(query)}`);
        const result = await res.json();
        _searchResults = result.data || [];
        _searchHighlight = -1;
        showSearchDropdown(_searchResults, query);
    } catch(e) {
        console.error('Search error:', e);
    }
}

function showSearchDropdown(files, query) {
    closeSearchDropdown();

    const searchBox = document.querySelector('.search-box');
    if (!searchBox) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'search-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: calc(100% + 8px);
        left: 0; right: 0;
        background: var(--surface-2, #1e2438);
        border: 1px solid var(--border, #2e3650);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        z-index: 9999;
        overflow: hidden;
        max-height: 380px;
        overflow-y: auto;
    `;

    if (files.length === 0) {
        dropdown.innerHTML = `
            <div style="padding:24px; text-align:center; color:var(--text-muted);">
                <i class="fa-solid fa-magnifying-glass" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
                No files found matching "<strong style="color:var(--primary)">${query}</strong>"
            </div>`;
    } else {
        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 16px 6px; font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:600;';
        header.textContent = `${files.length} result${files.length !== 1 ? 's' : ''} — ↑↓ to navigate, Enter to open`;
        dropdown.appendChild(header);

        files.forEach((file, idx) => {
            const classes = getFileIconClass(file.type || '').split(' ');
            const bgClass = classes[0] || 'bg-default';
            const iClass  = classes[1] || 'fa-file';
            const folderLabel = file.folder_name ? `in ${file.folder_name}` : '';

            const item = document.createElement('div');
            item.className = 'search-item';
            item.style.cssText = `
                display:flex; align-items:center; gap:12px;
                padding:10px 16px; cursor:pointer;
                transition: background 0.15s;
                border-top: 1px solid rgba(255,255,255,0.04);
                border-left: 3px solid transparent;
            `;
            item.onmouseenter = () => {
                _searchHighlight = idx;
                updateSearchHighlight(document.querySelectorAll('#search-dropdown .search-item'));
            };
            item.innerHTML = `
                <div class="file-icon ${bgClass}" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fa-solid ${iClass}" style="font-size:0.85rem;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${file.name}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">
                        ${file.type} · ${file.size} · ${file.date_modified}
                        ${folderLabel ? `<span style="color:var(--primary);margin-left:4px;"><i class="fa-solid fa-folder" style="font-size:0.65rem;"></i> ${folderLabel}</span>` : ''}
                    </div>
                </div>
                <i class="fa-solid fa-arrow-right" style="color:var(--primary);opacity:0.5;font-size:0.7rem;"></i>
            `;
            item.addEventListener('click', () => navigateToSearchResult(file));
            dropdown.appendChild(item);
        });
    }

    searchBox.style.position = 'relative';
    searchBox.appendChild(dropdown);

    setTimeout(() => {
        document.addEventListener('click', _closeSearchOnOutsideClick);
    }, 10);
}

function _closeSearchOnOutsideClick(e) {
    const dd = document.getElementById('search-dropdown');
    const sb = document.querySelector('.search-box');
    if (dd && sb && !sb.contains(e.target)) {
        closeSearchDropdown();
        document.getElementById('search-input').value = '';
        document.querySelectorAll('#file-list tr').forEach(r => r.style.display = '');
        _searchResults = [];
        _searchHighlight = -1;
    }
}

function closeSearchDropdown() {
    const dd = document.getElementById('search-dropdown');
    if (dd) dd.remove();
    document.removeEventListener('click', _closeSearchOnOutsideClick);
}

function triggerLogout() {
    localStorage.removeItem('cloudhub_role');
    localStorage.removeItem('cloudhub_uid');
    window.location.href = 'login.html';
}

function handleLogout() {
    triggerLogout();
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

async function togglePublicStatus(fileId, isPublic) {
    try {
        showToast('info', isPublic ? 'Publishing file to community...' : 'Securing file privately...');
        const res = await authFetch(`${API_BASE}/files/${fileId}/public`, {
            method: 'POST',
            body: JSON.stringify({ is_public: isPublic }),
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();
        if (result.status === 'success') {
            fetchFiles(); 
            fetchActivityLogs();
            showToast('success', result.message);
        } else {
            showToast('error', result.message);
        }
    } catch(err) {
        showToast('error', 'Network error making status update');
    }
}
