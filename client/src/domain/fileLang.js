// 文件后缀 → 代码编辑器语言 ID 映射

export const EXT_TO_LANG = {
  '.java':      'java',
  '.py':        'python',
  '.js':        'javascript',
  '.jsx':       'javascript',
  '.mjs':       'javascript',
  '.ts':        'typescript',
  '.tsx':       'typescript',
  '.cpp':       'cpp',
  '.cc':        'cpp',
  '.cxx':       'cpp',
  '.c':         'c',
  '.h':         'c',
  '.hpp':       'cpp',
  '.cs':        'csharp',
  '.go':        'go',
  '.rs':        'rust',
  '.rb':        'ruby',
  '.php':       'php',
  '.swift':     'swift',
  '.kt':        'kotlin',
  '.scala':     'scala',
  '.html': 'html',
  '.jsp': 'html',
  '.jspx': 'html',
  '.htm':       'html',
  '.css':       'css',
  '.scss':      'scss',
  '.less':      'less',
  '.vue':       'html',
  '.svelte':    'html',
  '.json':      'json',
  '.xml':       'xml',
  '.yml':       'yaml',
  '.yaml':      'yaml',
  '.md':        'markdown',
  '.markdown':  'markdown',
  '.sql':       'sql',
  '.sh':        'shell',
  '.bash':      'shell',
  '.properties': 'ini',
  '.gradle':    'groovy',
  '.cfg':       'ini',
  '.ini':       'ini',
  '.txt':       'plaintext',
  '.gitignore': 'plaintext',
  '.dockerfile':'dockerfile',
};

// 根据文件后缀获取代码编辑器语言 ID
export function getLanguage(filename) {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return 'plaintext';
  const ext = filename.slice(dotIdx).toLowerCase();
  return EXT_TO_LANG[ext] || 'plaintext';
}
