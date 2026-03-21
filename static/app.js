const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    fetchUserData();
    fetchFolders();
    fetchFiles();
    fetchAccessControl();
    fetchActivityLogs();
});

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
    return 'fa-check';
}

async function fetchUserData() {
    try {
        const res = await fetch(`${API_BASE}/user`);
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
        const res = await fetch(`${API_BASE}/folders`);
        const result = await res.json();
        
        if (result.status === 'success') {
            const folders = result.data;
            const container = document.getElementById('folder-list');
            container.innerHTML = ''; // clear loading text
            
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'folder-item';
                div.innerHTML = `
                    <div class="folder-icon"><i class="fa-solid fa-folder"></i></div>
                    <div class="folder-name">${folder.name}</div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error fetching folders:", error);
    }
}

async function fetchFiles() {
    try {
        const res = await fetch(`${API_BASE}/files`);
        const result = await res.json();
        
        if (result.status === 'success') {
            const files = result.data;
            const tbody = document.getElementById('file-list');
            tbody.innerHTML = ''; // clear loading text
            
            files.forEach(file => {
                const tr = document.createElement('tr');
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

async function fetchAccessControl() {
    try {
        const res = await fetch(`${API_BASE}/access-control/doc1`);
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
                        <button class="action-btn" style="background: transparent;"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" style="background: transparent;"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
                        <button class="action-btn" style="background: transparent;"><i class="fa-solid fa-xmark"></i></button>
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
        const res = await fetch(`${API_BASE}/activity`);
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
