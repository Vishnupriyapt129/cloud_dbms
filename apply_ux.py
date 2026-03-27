import re

with open('frontend/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace specific showModal calls with clean showToast calls
replacements = [
    (r'showModal\(\{\s*title:\s*"Upload Success",\s*desc:\s*"(.+?)",.*?\}\);?', r'showToast("success", "\1");'),
    (r'showModal\(\{\s*title:\s*"Upload Error",\s*desc:\s*"(.+?)",.*?\}\);?', r'showToast("error", "\1");'),
    (r'showModal\(\{\s*title:\s*"Database Updated",\s*desc:\s*"(.+?)",.*?\}\);?', r'showToast("success", "\1");'),
    (r'showModal\(\{\s*title:\s*"success",\s*desc:\s*"(.+?)",.*?\}\);?', r'showToast("success", "\1");'),
    (r'showModal\(\{\s*title:\s*"Folder Created",\s*desc:\s*"(.+?)",.*?\}\);?', r'showToast("success", "\1");'),
    (r'showModal\(\{\s*title:\s*"Error",\s*desc:\s*([^,]+),\s*showInput.*?\}\);?', r'showToast("error", \1);')
]

for old, new in replacements:
    code = re.sub(old, new, code, flags=re.IGNORECASE | re.DOTALL)

append_code = """

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

// Global Drag and Drop Uploader Overrides
document.addEventListener('DOMContentLoaded', () => {
    let overlay = document.createElement('div');
    overlay.className = 'drag-overlay';
    overlay.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Drop file to upload';
    document.body.appendChild(overlay);

    let dragTimer;

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if(!currentFolderId) return; // Only allow drop if a folder is open
        
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
        if(!currentFolderId) return;
        
        let files = e.dataTransfer.files;
        if(files.length > 0) {
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
"""

if "function showToast" not in code:
    code += append_code

with open('frontend/app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated app.js with Toasts and Drag-and-Drop UX!")
