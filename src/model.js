// Data model for the team architecture.
// The whole architecture is one JSON object: { domains, nodes, edges }.
// nodes/edges use React Flow's shape so the editor can render them directly.

export const COMPONENT_TYPES = {
  ingest: { label: 'קליטה', icon: '📥' },
  process: { label: 'עיבוד', icon: '⚙️' },
  export: { label: 'ייצוא', icon: '📤' },
  access: { label: 'הנגשה', icon: '🌐' },
  api: { label: 'API', icon: '🚪' },
  db: { label: 'מסד נתונים', icon: '🗄️' },
  queue: { label: 'תור', icon: '📬' },
  storage: { label: 'אחסון', icon: '📦' },
  ui: { label: 'ממשק', icon: '🖥️' },
  monitor: { label: 'ניטור', icon: '📈' },
  other: { label: 'אחר', icon: '🧩' },
};

export const DOMAIN_COLORS = [
  '#4f8cff', '#a66cff', '#ff9f43', '#2ecc8f', '#ff6b81',
  '#00c2d1', '#f6c945', '#8892a6', '#e056fd', '#7bed9f',
];

export function newId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeNode({ id, name, type = 'other', domainId = '', price = 100, owner = '', description = '' }, position = { x: 0, y: 0 }) {
  return {
    id: id || newId('c'),
    type: 'component',
    position,
    data: { name, type, domainId, price, owner, description },
  };
}

export function makeEdge(source, target, label = '') {
  return {
    id: newId('e'),
    source,
    target,
    label,
    type: 'smoothstep',
    markerEnd: { type: 'arrowclosed' },
  };
}

export function sampleArchitecture() {
  const domains = [
    { id: 'd-ingest', name: 'קליטה', color: DOMAIN_COLORS[0] },
    { id: 'd-process', name: 'עיבוד', color: DOMAIN_COLORS[1] },
    { id: 'd-export', name: 'ייצוא', color: DOMAIN_COLORS[2] },
    { id: 'd-access', name: 'הנגשה', color: DOMAIN_COLORS[3] },
    { id: 'd-infra', name: 'תשתית', color: DOMAIN_COLORS[7] },
  ];
  const c = (id, name, type, domainId, price, description) =>
    makeNode({ id, name, type, domainId, price, description });
  const nodes = [
    c('ftp-in', 'קולט FTP', 'ingest', 'd-ingest', 150, 'קולט תוצרים ממסלולי FTP של הספקים'),
    c('api-in', 'קולט API חיצוני', 'ingest', 'd-ingest', 200, 'מקבל תוצרים בדחיפה דרך REST'),
    c('ingest-q', 'תור קליטה', 'queue', 'd-infra', 120, 'מאזן עומסים בין הקליטה לעיבוד'),
    c('normalizer', 'מנרמל תוצרים', 'process', 'd-process', 300, 'ממיר כל תוצר לפורמט אחיד'),
    c('enricher', 'מעשיר מטא-דאטה', 'process', 'd-process', 350, 'מוסיף תגיות, מיקום וסיווג'),
    c('products-db', 'DB תוצרים', 'db', 'd-infra', 400, 'המאגר המרכזי של כל התוצרים'),
    c('partner-export', 'מייצא לשותפים', 'export', 'd-export', 250, 'שולח תוצרים לשותפים חיצוניים'),
    c('reports', 'מחולל דוחות', 'export', 'd-export', 180, 'דוחות יומיים ושבועיים'),
    c('search', 'מנוע חיפוש', 'access', 'd-access', 450, 'חיפוש מהיר על כל התוצרים'),
    c('public-api', 'API ציבורי', 'api', 'd-access', 300, 'נקודת הגישה לצרכנים'),
    c('portal', 'פורטל משתמשים', 'ui', 'd-access', 220, 'ממשק הצפייה של המשתמשים'),
    c('auth', 'Auth', 'api', 'd-infra', 200, 'הזדהות והרשאות'),
    c('monitoring', 'ניטור', 'monitor', 'd-infra', 100, 'מטריקות, התראות ודשבורדים'),
  ];
  const e = (s, t, label) => makeEdge(s, t, label);
  const edges = [
    e('ftp-in', 'ingest-q', 'תוצרים'),
    e('api-in', 'ingest-q', 'תוצרים'),
    e('ingest-q', 'normalizer'),
    e('normalizer', 'enricher'),
    e('enricher', 'products-db'),
    e('products-db', 'partner-export'),
    e('products-db', 'reports'),
    e('products-db', 'search'),
    e('search', 'public-api'),
    e('public-api', 'portal'),
    e('auth', 'public-api', 'טוקנים'),
    e('normalizer', 'monitoring', 'מטריקות'),
  ];
  return { domains, nodes, edges };
}

export function totalValue(nodes) {
  return nodes.reduce((sum, n) => sum + (Number(n.data.price) || 0), 0);
}
