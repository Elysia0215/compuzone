import re

files = [
    'src/components/ChatbotKomi.tsx',
    'src/components/NotificationManager.tsx',
    'src/components/StoreHeader.tsx',
]

pattern = r'<<<<<<< HEAD\n(.*?)=======.*?>>>>>>> [^\n]+\n'

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    resolved = re.sub(pattern, r'\1', content, flags=re.DOTALL)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(resolved)
    
    print(f'완료: {filepath}')

print('모든 파일 충돌 마커 제거 완료!')
