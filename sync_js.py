import re

with open('frontend/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace old storage IDs with new sidebar IDs
code = code.replace("document.getElementById('storage-text')", "document.getElementById('sidebar-storage-text')")
code = code.replace("document.getElementById('storage-fill')", "document.getElementById('sidebar-storage-fill')")

# Logic for fetching user data - add role update
user_data_regex = r"document\.getElementById\('nav-username'\)\.textContent = result\.data\.name;"
user_data_replace = "document.getElementById('nav-username').textContent = result.data.name;\n            const roleEl = document.getElementById('nav-role'); if(roleEl) roleEl.textContent = result.data.role === 'admin' ? 'Administrator' : 'Basic Account';"
code = re.sub(user_data_regex, user_data_replace, code)

# Fix openFolder/closeFolder logic for new layout
code = code.replace("document.getElementById('browser-title').textContent = folderName;", "// Removed browser-title")
code = code.replace("document.getElementById('browser-title').textContent = 'My Folders';", "// Removed browser-title")

# Updated Folder Card Generation (simplified to match modern-grid)
# The current app.js uses a lot of inline styles/classes for folder cards.
# I'll update the loop that creates folders.

folder_loop_search = r"const card = document\.createElement\('div'\);\s+card\.className = 'folder-item';.*?card\.innerHTML = `.*?`;"
folder_loop_replace = """const card = document.createElement('div');
                card.className = 'folder-card';
                card.innerHTML = `
                    <i class="fa-solid fa-folder"></i>
                    <span>${folder.name}</span>
                    <div class="folder-actions" style="margin-top:10px; opacity:0; transition:0.3s;">
                        <button class="action-btn" onclick="handleRenameFolder('${folder.id}', '${folder.name}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" onclick="handleDeleteFolder('${folder.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `;"""

code = re.sub(folder_loop_search, folder_loop_replace, code, flags=re.DOTALL)

with open('frontend/app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated app.js for Cyber-Dark Sidebar structure!")
