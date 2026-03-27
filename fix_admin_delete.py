import re

with open('frontend/app.js', encoding='utf-8') as f:
    content = f.read()

# Remove the delete button block from admin file manager (lines 620-623 region)
# Match the pattern: delete button with handleAdminDeleteFile onclick
pattern = r"""                        <button class="action-btn" style="color:#e74c3c;" title="Delete"\s*\n\s*onclick="handleAdminDeleteFile\([^)]+\)">\s*\n\s*<i class="fa-solid fa-trash"></i>\s*\n\s*</button>\s*\n"""

result = re.sub(pattern, '', content, count=1)

if result != content:
    with open('frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(result)
    print('SUCCESS: Delete button removed from admin file manager')
else:
    # Try simpler line-based removal
    lines = content.split('\n')
    new_lines = []
    skip = 0
    for i, line in enumerate(lines):
        if skip > 0:
            skip -= 1
            continue
        if 'handleAdminDeleteFile' in line:
            # Remove this line and the surrounding button block (4 lines total)
            # Go back to find the <button line
            # Remove from new_lines
            while new_lines and '<button' in new_lines[-1] and 'e74c3c' in new_lines[-1]:
                new_lines.pop()
                break
            # Skip closing tag lines (</button>)
            skip = 1  # skip next line (</button>)
            print(f'Line-based: removing admin delete button at line {i+1}')
            continue
        new_lines.append(line)
    
    result2 = '\n'.join(new_lines)
    with open('frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(result2)
    print('Done via line-based approach')
