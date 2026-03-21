// Dynamically mounts to ANY custom domain name seamlessly!
const API_BASE = window.location.origin + '/api';
let currentFolderId = '1';
let currentFileId = '1';

document.addEventListener('DOMContentLoaded', () => {
    // Prioritize URL parameter to bypass any strict local file security
    const urlParams = new URLSearchParams(window.location.search);
    const urlRole = urlParams.get('role');
    if (urlRole) {
        localStorage.setItem('cloudhub_role', urlRole);
    }
    
    const role = localStorage.getItem('cloudhub_role');
    if (!role) {
        window.location.href = 'login.html';
        return;
    }
    
    // Visually toggle UI states based on active role
    document.body.classList.add(`role-${role}`);
    
    fetchUserData();
    fetchFolders();
    fetchFiles();
    fetchAccessControl();
    fetchActivityLogs();
    setupTabs();
});

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
        const res = await fetch(`${API_BASE}/user?t=${Date.now()}`);
        const result = await res.json();

        if (result.status === 'success') {
            const user = result.data;
            document.getElementById('nav-username').textContent = user.name;
            document.getElementById('welcome-message').textContent = `Welcome, ${user.name}!`;

            // Storage updates
            document.getElementById('storage-text').textContent = `Storage Used: ${user.storage.used_gb} GB of ${user.storage.total_gb} GB`;

            // Set progress bar with small delay for animation
            setTimeout(() => {
                document.getElementById('storage-fill').style.width = `${user.storage.percentage}%`;
            }, 300);
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        document.getElementById('welcome-message').textContent = 'Welcome!';
    }
}

async function fetchFolders() {
    try {
        const res = await fetch(`${API_BASE}/folders?t=${Date.now()}`);
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
        const res = await fetch(`${API_BASE}/files?folder_id=${folderId}`);
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
                            <button class="action-btn"><i class="fa-solid fa-chevron-down"></i></button>
                            <button class="action-btn"><i class="fa-solid fa-bookmark"></i></button>
                            <button class="action-btn"><i class="fa-solid fa-minus"></i></button>
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
        const res = await fetch(`${API_BASE}/access-control/${fileId}?t=${Date.now()}`);
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
        const res = await fetch(`${API_BASE}/activity?t=${Date.now()}`);
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

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_id', currentFolderId);

    try {
        const res = await fetch(`${API_BASE}/files/upload`, {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (result.status === 'success') {
            fetchFiles(); 
            fetchActivityLogs();
            alert('File uploaded successfully!');
        }
    } catch (e) {
        console.error("Upload failed", e);
    }
}

function handleAddUser() {
    showModal({
        title: "Grant Specific Access",
        desc: "Enter the email or name of the user to grant access:",
        showInput: true,
        onConfirm: async (name) => {
            if (!name) return;
            try {
                const res = await fetch(`${API_BASE}/access-control/${currentFileId}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: name, role: 'Editor' })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    await fetchAccessControl(); 
                    fetchActivityLogs();
                    alert("Database successfully updated! " + name + " has been granted access.");
                } else {
                    alert('Registration lookup failed: ' + result.message);
                }
            } catch (e) {
                if (e.message.includes('NetworkError') || e.message.includes('Failed to fetch') || e.name === 'TypeError') {
                    alert("SERVER IS OFFLINE: Your browser cannot communicate with Flask! Please open your terminal, type 'python app.py', and leave that terminal running completely uninterrupted in the background!");
                } else {
                    alert("Critical backend crash: " + e.message);
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
                const res = await fetch(`${API_BASE}/folders`, {
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
                const res = await fetch(`${API_BASE}/access-control/${currentFileId}/users/${userId}`, { method: 'DELETE' });
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