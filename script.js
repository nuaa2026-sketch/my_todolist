'use strict';

/**
 * ============================================================
 *  My Tasks — 할 일 관리 앱
 * ============================================================
 *  파일 구성
 *   1. 설정 상수
 *   2. DOM 참조
 *   3. 범용 유틸 (debounce, 텍스트 정규화, 날짜 등)
 *   4. 저장소 (localStorage 래퍼, 데이터 검증, 로드/저장)
 *   5. 앱 상태
 *   6. 피드백 UI (토스트, 스크린 리더 알림, 확인 다이얼로그)
 *   7. 테마 (다크/라이트 모드)
 *   8. 키워드 기반 자동 카테고리 분류
 *   9. 렌더링 (대시보드, 필터, 목록 — 키 기반 DOM 재사용)
 *  10. 할 일 조작 (추가/완료/삭제/수정/되돌리기)
 *  11. 정렬과 드래그 앤 드롭
 *  12. 검색 / 필터
 *  13. 내보내기 / 가져오기
 *  14. 격언 & 응원 메시지
 *  15. 이벤트 바인딩 & 키보드 단축키
 *  16. 초기화
 *
 *  데이터 구조 (localStorage 'todos'):
 *   { id: string, text: string, completed: boolean,
 *     createdAt: ISO 문자열, category: 'work' | 'personal' | 'study' }
 *
 *  배열 순서 자체가 "직접 정렬" 순서다. 다른 정렬 방식은 화면에 보여줄 때만
 *  정렬한 복사본을 사용하므로 원본 순서는 유지된다.
 * ============================================================
 */
(() => {
  /* ==========================================================
   * 1. 설정 상수
   * ========================================================== */

  /** localStorage 키 이름 */
  const STORAGE_KEYS = Object.freeze({
    todos: 'todos',
    filter: 'todoFilter',
    sort: 'todoSort',
    theme: 'todoTheme',
    keywords: 'todoKeywords',              // 사용자가 편집한 자동 분류 키워드
    corruptBackup: 'todos_corrupt_backup', // 손상된 데이터를 버리기 전에 보관
  });

  const CATEGORIES = Object.freeze({ work: '업무', personal: '개인', study: '공부' });
  const CATEGORY_KEYS = Object.keys(CATEGORIES);
  const DEFAULT_CATEGORY = 'personal';

  const FILTERS = ['all', ...CATEGORY_KEYS];
  const FILTER_LABELS = Object.freeze({ all: '전체', ...CATEGORIES });

  const SORT_LABELS = Object.freeze({
    status: '완료 상태순',
    created: '생성일순',
    category: '카테고리순',
    manual: '직접 정렬',
  });
  const DEFAULT_SORT = 'status';

  const MAX_TEXT_LENGTH = 200;               // 할 일 최대 글자 수 (input maxlength와 동일)
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;  // 가져오기 파일 최대 크기 5MB
  const UNDO_LIMIT = 20;                     // 되돌리기 기록 최대 개수
  const MAX_TOASTS = 3;                      // 동시에 보이는 토스트 최대 개수
  const MAX_KEYWORD_LENGTH = 30;             // 키워드 하나의 최대 글자 수
  const MAX_KEYWORDS_PER_CATEGORY = 200;     // 카테고리당 최대 키워드 수

  /** 시간 관련 설정 (ms) */
  const TIMING = Object.freeze({
    saveDebounce: 300,     // 연속 변경 시 저장을 묶어서 한 번만
    searchDebounce: 200,   // 검색 입력 디바운스
    classifyDebounce: 150, // 자동 분류 디바운스
    animFallback: 600,     // animationend 미발생 대비 안전장치
    toast: 3000,
    undoToast: 6000,       // 되돌리기 버튼이 있는 토스트는 더 오래
    themeTransition: 400,
    clockTick: 60000,      // "n분 전" 갱신 주기
  });

  /**
   * 자동 카테고리 분류용 기본 키워드.
   * 사용자는 '키워드 설정' 창에서 이 목록을 바꿀 수 있고, 바꾼 목록은 localStorage에 저장된다.
   * 공백을 제거하고 소문자로 비교하므로 "코드 리뷰" / "코드리뷰" 모두 매칭된다.
   * 오분류를 줄이기 위해 너무 짧고 흔한 단어(예: "집", "책", "보고")는 넣지 않았다.
   */
  const DEFAULT_CATEGORY_KEYWORDS = Object.freeze({
    work: [
      '회의', '미팅', '보고서', '업무 보고', '업무', '출근', '퇴근', '프로젝트', '메일', '결재',
      '기획', '기획서', '발표', '클라이언트', '고객', '거래처', '계약', '마감', '팀장', '팀원',
      '상사', '회사', '야근', '출장', '견적', '제안서', '문서 작성', '배포', '코드 리뷰', '스프린트',
      '면접', '인수인계', '매출', '예산', '협업', '슬랙', '엑셀', '세일즈', '마케팅',
      'meeting', 'report', 'deadline', 'client', 'project', 'deploy', 'email',
    ],
    study: [
      '공부', '시험', '과제', '숙제', '강의', '수업', '독서', '책 읽기', '복습', '예습',
      '토익', '토플', '오픽', '자격증', '영어', '수학', '단어', '암기', '논문', '학원',
      '인강', '스터디', '코딩 테스트', '코테', '알고리즘', '문제 풀이', '레포트', '리포트',
      '중간고사', '기말고사', '수능', '튜토리얼', '강좌', '필기', '교재',
      'study', 'exam', 'homework', 'lecture', 'course', 'quiz',
    ],
    personal: [
      '운동', '헬스', '요가', '필라테스', '산책', '러닝', '장보기', '마트', '청소', '빨래',
      '설거지', '요리', '병원', '치과', '약속', '친구', '가족', '엄마', '아빠', '부모님',
      '생일', '여행', '쇼핑', '은행', '공과금', '택배', '저녁', '점심', '카페', '영화',
      '데이트', '미용실', '반려', '강아지', '고양이', '집안일', '휴가', '취미', '게임', '선물',
      'gym', 'grocery', 'dinner', 'lunch', 'birthday',
    ],
  });

  /** 오늘의 격언 목록 */
  const QUOTES = Object.freeze([
    { text: '천 리 길도 한 걸음부터.', author: '속담' },
    { text: '시작이 반이다.', author: '속담' },
    { text: '성공은 매일 반복한 작은 노력들의 합이다.', author: '로버트 콜리어' },
    { text: '우리가 반복적으로 하는 행동이 곧 우리 자신이다. 그러므로 탁월함은 행동이 아니라 습관이다.', author: '윌 듀랜트' },
    { text: '시작하는 방법은 말을 멈추고 행동하는 것이다.', author: '월트 디즈니' },
    { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤저민 프랭클린' },
    { text: '멈추지 않는 한 얼마나 천천히 가는지는 중요하지 않다.', author: '공자' },
    { text: '로마는 하루아침에 이루어지지 않았다.', author: '서양 속담' },
    { text: '완벽함보다 완료가 낫다.', author: '격언' },
    { text: '티끌 모아 태산.', author: '속담' },
    { text: '할 수 있다고 믿든 할 수 없다고 믿든, 당신의 생각이 옳다.', author: '헨리 포드' },
    { text: '작은 기회로부터 종종 위대한 업적이 시작된다.', author: '데모스테네스' },
    { text: '미래를 예측하는 가장 좋은 방법은 미래를 만드는 것이다.', author: '피터 드러커' },
    { text: '실패는 성공의 어머니.', author: '속담' },
  ]);

  /* ==========================================================
   * 2. DOM 참조
   * ========================================================== */

  const byId = (id) => document.getElementById(id);

  const dom = {
    themeToggle: byId('theme-toggle'),
    remainingBadge: byId('remaining-badge'),
    remainingCount: byId('remaining-count'),

    quote: byId('quote'),
    quoteText: byId('quote-text'),
    quoteAuthor: byId('quote-author'),
    quoteRefresh: byId('quote-refresh'),

    overallText: byId('overall-text'),
    overallProgress: byId('overall-progress'),
    overallBar: byId('overall-bar'),
    cheer: byId('cheer-message'),
    todayCount: byId('today-count'),

    search: byId('search-input'),
    searchClear: byId('search-clear'),
    sortSelect: byId('sort-select'),
    filters: byId('filters'),

    form: byId('todo-form'),
    input: byId('todo-input'),
    categorySelect: byId('category-select'),
    autoCategory: byId('auto-category'),

    list: byId('todo-list'),
    empty: byId('empty-message'),

    clearCompleted: byId('clear-completed'),
    completedCount: byId('completed-count'),
    exportBtn: byId('export-btn'),
    importBtn: byId('import-btn'),
    importFile: byId('import-file'),

    toasts: byId('toasts'),
    srLive: byId('sr-live'),

    dialog: byId('dialog'),
    dialogTitle: byId('dialog-title'),
    dialogMessage: byId('dialog-message'),
    dialogActions: byId('dialog-actions'),

    // 데스크톱 레이아웃에서 위에 고정되는 검색/입력 영역 (모바일 전용 마크업에는 없음)
    mainHead: document.querySelector('.main-head'),

    // 키워드 설정 창
    kwOpenBtn: byId('keyword-settings-btn'),
    kwDialog: byId('keyword-dialog'),
    kwSections: byId('kw-sections'),
    kwStatus: byId('kw-status'),
    kwTestInput: byId('kw-test-input'),
    kwTestResult: byId('kw-test-result'),
    kwReset: byId('kw-reset'),
    kwDone: byId('kw-done'),
    kwClose: byId('kw-close'),
  };

  /** 카테고리별 미니 진행률 요소 { work: {count, bar, progress}, ... } */
  const miniStatEls = {};
  document.querySelectorAll('.mini-stat').forEach((el) => {
    miniStatEls[el.dataset.category] = {
      count: el.querySelector('.mini-count'),
      bar: el.querySelector('.progress-bar'),
      progress: el.querySelector('.progress'),
    };
  });

  /** 필터 버튼 { all: {btn, count}, work: ..., ... } */
  const filterEls = {};
  dom.filters.querySelectorAll('.filter-btn').forEach((btn) => {
    filterEls[btn.dataset.filter] = { btn, count: btn.querySelector('.filter-count') };
  });

  /* ==========================================================
   * 3. 범용 유틸
   * ========================================================== */

  /**
   * 마지막 호출 후 wait(ms) 동안 추가 호출이 없을 때 fn 실행.
   * flush(): 대기 중인 호출을 즉시 실행 / cancel(): 대기 중인 호출 취소
   */
  function debounce(fn, wait) {
    let timer = null;
    let lastArgs = [];
    const debounced = (...args) => {
      lastArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...lastArgs);
      }, wait);
    };
    debounced.flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    };
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }

  /** 연속 공백을 하나로 합치고 앞뒤 공백 제거 */
  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  /** 중복 비교용 키 (대소문자/공백 차이 무시) */
  function duplicateKey(value) {
    return normalizeText(value).toLowerCase();
  }

  /** 접근성 레이블 등에 쓸 짧은 텍스트 */
  function shortLabel(text, max = 30) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /** 충돌 가능성이 매우 낮은 고유 id 생성 */
  function generateId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch {
      /* 보안 컨텍스트가 아니면 randomUUID가 없을 수 있음 → 아래 대체 방식 */
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** "방금 전", "5분 전", "2시간 전" 형식의 상대 시간 */
  function formatRelativeTime(isoString) {
    const time = Date.parse(isoString);
    if (Number.isNaN(time)) return '';

    // 기기 시계가 어긋나 미래 시간이 저장된 경우도 "방금 전"으로 처리
    const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (diffSec < 60) return '방금 전';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}분 전`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}일 전`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
    if (diffDay < 365) return `${Math.floor(diffDay / 30)}개월 전`;
    return `${Math.floor(diffDay / 365)}년 전`;
  }

  /** 오늘(로컬 시간 기준) 0시 ~ 내일 0시 범위 [start, end) */
  function todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start.getTime(), end.getTime()];
  }

  function percent(done, total) {
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }

  /** 파일명용 타임스탬프 YYYY-MM-DD_HHmm */
  function fileStamp(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
  }

  /** 글자 입력용 필드인지 (단축키가 입력을 방해하지 않도록 판별) */
  function isTextField(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLInputElement) {
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(el.type);
    }
    return false;
  }

  /** 같은 애니메이션을 다시 재생 (클래스 제거 → 리플로우 → 추가) */
  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // 강제 리플로우로 애니메이션 재시작
    el.classList.add(className);
    const onEnd = (e) => {
      if (e.target !== el) return;
      el.classList.remove(className);
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
  }

  /**
   * 애니메이션 클래스를 붙이고 끝날 때 resolve 하는 Promise.
   * 요소가 숨겨지는 등 animationend가 오지 않는 경우를 대비해 타임아웃으로도 종료한다.
   */
  function playAnimation(el, className) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.removeEventListener('animationend', onEnd);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === el) finish();
      };
      el.addEventListener('animationend', onEnd);
      timer = setTimeout(finish, TIMING.animFallback);
      el.classList.add(className);
    });
  }

  /* ==========================================================
   * 4. 저장소
   * ========================================================== */

  /**
   * localStorage 래퍼.
   * - 사생활 보호 모드, 저장 공간 초과 등으로 예외가 나도 앱이 멈추지 않게 한다.
   * - 실패 시 사용자에게 한 번만 알리고, 다시 성공하면 경고 상태를 초기화한다.
   */
  const storage = {
    warned: false,

    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        this.fail(e);
        return null;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, value);
        this.warned = false;
        return true;
      } catch (e) {
        this.fail(e);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        this.fail(e);
        return false;
      }
    },

    fail(error) {
      console.error('[storage]', error);
      if (this.warned) return;
      this.warned = true;
      const isQuota = error && (error.name === 'QuotaExceededError' || error.code === 22);
      toast(
        isQuota
          ? '저장 공간이 부족해 저장하지 못했습니다. 데이터를 내보낸 뒤 완료 항목을 정리해 주세요.'
          : '브라우저 저장소를 사용할 수 없어 새로고침하면 데이터가 사라질 수 있습니다.',
        { type: 'error', duration: 8000 }
      );
    },
  };

  /**
   * 외부에서 들어온 할 일 객체(저장소/가져오기 파일)를 검증하고 정리한다.
   * 잘못된 항목은 null 반환. usedIds로 id 중복을 막는다.
   */
  function sanitizeTodo(raw, usedIds) {
    if (!raw || typeof raw !== 'object') return null;

    const text = typeof raw.text === 'string' ? normalizeText(raw.text).slice(0, MAX_TEXT_LENGTH) : '';
    if (!text) return null;

    let id = '';
    if (typeof raw.id === 'string') id = raw.id.trim();
    else if (typeof raw.id === 'number' && Number.isFinite(raw.id)) id = String(raw.id);
    if (!id || usedIds.has(id)) id = generateId();
    usedIds.add(id);

    const createdTime = Date.parse(raw.createdAt);
    const createdAt = Number.isNaN(createdTime) ? new Date().toISOString() : new Date(createdTime).toISOString();

    // 카테고리가 없거나 잘못된 경우(이전 버전 데이터 포함) 키워드로 자동 분류
    const category = CATEGORIES[raw.category]
      ? raw.category
      : classifyText(text)?.category ?? DEFAULT_CATEGORY;

    return { id, text, completed: raw.completed === true, createdAt, category };
  }

  /** 할 일 배열 정리 → { list, skipped } */
  function sanitizeList(rawList) {
    const usedIds = new Set();
    const list = [];
    for (const raw of rawList) {
      const todo = sanitizeTodo(raw, usedIds);
      if (todo) list.push(todo);
    }
    return { list, skipped: rawList.length - list.length };
  }

  /** 저장된 할 일 불러오기. 손상된 데이터는 백업해 두고 빈 목록으로 시작한다. */
  function loadTodos() {
    const raw = storage.get(STORAGE_KEYS.todos);
    if (raw === null) return [];

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined;
    }

    if (!Array.isArray(data)) {
      storage.set(STORAGE_KEYS.corruptBackup, raw);
      toast(`저장된 데이터가 손상되어 새로 시작합니다. (원본은 '${STORAGE_KEYS.corruptBackup}'에 보관)`, {
        type: 'error',
        duration: 8000,
      });
      return [];
    }

    const { list, skipped } = sanitizeList(data);
    if (skipped > 0) {
      toast(`손상된 항목 ${skipped}개를 제외하고 불러왔습니다.`, { type: 'warning' });
    }
    return list;
  }

  /** 허용된 값이면 그대로, 아니면 기본값 */
  function pickAllowed(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  /** 마지막으로 저장한 JSON (동일하면 쓰기 생략) */
  let lastSavedJson = null;

  function persistTodos() {
    const json = JSON.stringify(todos);
    if (json === lastSavedJson) return;
    if (storage.set(STORAGE_KEYS.todos, json)) lastSavedJson = json;
  }

  /** 변경이 연달아 일어나도 마지막 한 번만 저장 (디바운스) */
  const scheduleSave = debounce(persistTodos, TIMING.saveDebounce);

  /** 대기 중인 저장을 즉시 실행 (페이지 이탈, 내보내기 직전 등) */
  function saveNow() {
    scheduleSave.cancel();
    persistTodos();
  }

  /* ---------- 자동 분류 키워드 ----------
   * loadTodos()가 카테고리 없는 데이터를 분류할 때 키워드를 쓰므로
   * 반드시 "5. 앱 상태"(todos 로드)보다 먼저 준비해야 한다. */

  /** 비교용 키: 공백 제거 + 소문자 */
  const keywordKey = (word) => String(word).toLowerCase().replace(/\s+/g, '');

  function cloneDefaultKeywords() {
    const copy = {};
    for (const c of CATEGORY_KEYS) copy[c] = [...DEFAULT_CATEGORY_KEYWORDS[c]];
    return copy;
  }

  /**
   * 저장된(또는 다른 탭에서 온) 키워드 객체 검증.
   * 카테고리 항목이 없거나 배열이 아니면 그 카테고리만 기본값을 사용하고,
   * 문자열이 아닌 값 / 빈 값 / 같은 카테고리 안의 중복은 걸러낸다.
   */
  function sanitizeKeywords(raw) {
    const result = {};
    for (const c of CATEGORY_KEYS) {
      const source = raw && Array.isArray(raw[c]) ? raw[c] : DEFAULT_CATEGORY_KEYWORDS[c];
      const seen = new Set();
      result[c] = [];
      for (const value of source) {
        if (typeof value !== 'string') continue;
        const word = normalizeText(value).slice(0, MAX_KEYWORD_LENGTH);
        const key = keywordKey(word);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result[c].push(word);
        if (result[c].length >= MAX_KEYWORDS_PER_CATEGORY) break;
      }
    }
    return result;
  }

  function loadKeywords() {
    const raw = storage.get(STORAGE_KEYS.keywords);
    if (raw === null) return cloneDefaultKeywords();
    try {
      return sanitizeKeywords(JSON.parse(raw));
    } catch {
      toast('키워드 설정이 손상되어 기본 키워드를 사용합니다.', { type: 'warning' });
      return cloneDefaultKeywords();
    }
  }

  /** 분류할 때마다 변환하지 않도록 비교용 키를 미리 계산해 둔 색인 */
  function buildKeywordIndex(keywords) {
    return CATEGORY_KEYS.map((category) => ({
      category,
      words: keywords[category].map((word) => ({ word, key: keywordKey(word) })),
    }));
  }

  /** 현재 사용 중인 키워드 { work: [...], personal: [...], study: [...] } */
  let categoryKeywords = loadKeywords();
  let keywordIndex = buildKeywordIndex(categoryKeywords);

  /** 키워드 변경 후: 색인 재계산 + 저장 */
  function saveKeywords() {
    keywordIndex = buildKeywordIndex(categoryKeywords);
    storage.set(STORAGE_KEYS.keywords, JSON.stringify(categoryKeywords));
  }

  /** 기본값으로 초기화: 저장값을 지워서 이후 기본 목록이 바뀌어도 그대로 따라가게 함 */
  function resetKeywords() {
    categoryKeywords = cloneDefaultKeywords();
    keywordIndex = buildKeywordIndex(categoryKeywords);
    storage.remove(STORAGE_KEYS.keywords);
  }

  /* ==========================================================
   * 5. 앱 상태
   * ========================================================== */

  let todos = loadTodos();
  let currentFilter = pickAllowed(storage.get(STORAGE_KEYS.filter), FILTERS, 'all');
  let currentSort = pickAllowed(storage.get(STORAGE_KEYS.sort), Object.keys(SORT_LABELS), DEFAULT_SORT);
  let searchQuery = '';
  let editingId = null;          // 인라인 편집 중인 항목 id
  let isRendering = false;       // 렌더링 중 발생하는 focusout 무시용
  let categoryLocked = false;    // 사용자가 카테고리를 직접 고르면 자동 분류 중지
  let lastPct = null;            // 100% 달성 순간 감지용
  let lastRemaining = null;      // 배지 애니메이션용
  let quoteIndex = 0;

  /** 다음 렌더링 때 특정 항목에 줄 등장 애니메이션 (id → 클래스명) */
  const pendingEnter = new Map();

  /** 화면에 그려진 항목 캐시 (id → { el, sig }) — DOM 재사용으로 렌더링 비용 절감 */
  const elementCache = new Map();

  /** 되돌리기 기록 스택 */
  const undoStack = [];

  const findTodo = (id) => todos.find((t) => t.id === id);

  /** 화면에 있는 항목 요소 */
  function itemEl(id) {
    const entry = elementCache.get(id);
    return entry && entry.el.isConnected ? entry.el : null;
  }

  /* ==========================================================
   * 6. 피드백 UI
   * ========================================================== */

  /**
   * 토스트 알림.
   * @param {string} message
   * @param {{type?: 'info'|'success'|'warning'|'error', action?: {label: string, run: Function}, duration?: number}} options
   * @returns {Function} 토스트를 닫는 함수
   *
   * - 마우스를 올리거나 포커스가 들어가면 타이머 일시정지 (읽을 시간/버튼 누를 시간 확보)
   * - 토스트 컨테이너가 aria-live 영역이므로 스크린 리더에도 읽힌다.
   */
  function toast(message, { type = 'info', action = null, duration } = {}) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = { success: '✓', warning: '!', error: '!', info: 'i' }[type] || 'i';

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;

    el.append(icon, msg);

    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => {
        dismiss();
        action.run();
      });
      el.append(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', '알림 닫기');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => dismiss());
    el.append(closeBtn);

    dom.toasts.append(el);

    // 너무 많이 쌓이지 않도록 오래된 것부터 제거
    while (dom.toasts.children.length > MAX_TOASTS) {
      dom.toasts.firstElementChild.remove();
    }

    // 일시정지 가능한 자동 닫힘 타이머
    let remaining = duration ?? (action ? TIMING.undoToast : TIMING.toast);
    let timer = null;
    let startedAt = 0;
    let paused = false;

    const start = () => {
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    };
    const pause = () => {
      if (paused) return;
      paused = true;
      clearTimeout(timer);
      remaining = Math.max(1000, remaining - (Date.now() - startedAt));
    };
    const resume = () => {
      if (!paused) return;
      paused = false;
      start();
    };

    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', () => {
      if (!el.contains(document.activeElement)) resume();
    });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', (e) => {
      if (!el.contains(e.relatedTarget)) resume();
    });

    function dismiss() {
      if (el.dataset.closing) return;
      el.dataset.closing = '1';
      clearTimeout(timer);
      // 토스트 안에 포커스가 있었다면 입력창으로 돌려보냄 (포커스 유실 방지)
      const hadFocus = el.contains(document.activeElement);
      el.classList.add('toast-out');
      setTimeout(() => {
        el.remove();
        if (hadFocus) dom.input.focus();
      }, 200);
    }

    start();
    return dismiss;
  }

  /** 화면에는 보이지 않고 스크린 리더만 읽는 알림 */
  function announce(message) {
    dom.srLive.textContent = '';
    // 같은 문구도 다시 읽히도록 비운 뒤 약간의 지연 후 설정
    setTimeout(() => {
      dom.srLive.textContent = message;
    }, 50);
  }

  /**
   * 확인 다이얼로그 (네이티브 <dialog> 사용 → 포커스 가두기, Esc 닫기 기본 지원).
   * @param {{title: string, message: string, buttons: Array<{label, value, variant?, autofocus?}>}} options
   * @returns {Promise<string|null>} 누른 버튼의 value. 취소/Esc/바깥 클릭은 null
   */
  function showDialog({ title, message, buttons }) {
    // <dialog>를 지원하지 않는 오래된 브라우저 → window.confirm으로 대체
    if (typeof dom.dialog.showModal !== 'function') {
      const confirmBtn = buttons.find((b) => b.variant === 'primary' || b.variant === 'danger') || buttons[buttons.length - 1];
      return Promise.resolve(window.confirm(`${title}\n\n${message}`) ? confirmBtn.value : null);
    }

    // 이미 열려 있으면 중복으로 열지 않음
    if (dom.dialog.open) return Promise.resolve(null);

    const opener = document.activeElement;
    dom.dialogTitle.textContent = title;
    dom.dialogMessage.textContent = message;
    dom.dialogActions.replaceChildren();

    let focusTarget = null;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'submit'; // form[method=dialog] 안의 submit → dialog.returnValue = value
      btn.value = b.value;
      btn.textContent = b.label;
      btn.className = `btn btn-${b.variant || 'secondary'}`;
      if (b.autofocus) focusTarget = btn;
      dom.dialogActions.append(btn);
    }

    dom.dialog.returnValue = '';

    return new Promise((resolve) => {
      dom.dialog.addEventListener(
        'close',
        () => {
          const value = dom.dialog.returnValue;
          // 다이얼로그를 연 요소로 포커스 복귀
          if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
          resolve(value && value !== 'cancel' ? value : null);
        },
        { once: true }
      );
      dom.dialog.showModal();
      (focusTarget || dom.dialogActions.firstElementChild)?.focus();
    });
  }

  /* ==========================================================
   * 7. 테마 (다크/라이트 모드)
   * ========================================================== */

  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let themeTransitionTimer = null;

  /** 현재 적용된 테마 */
  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  /** 저장된 테마 → 없으면 OS 설정 */
  function initialTheme() {
    const saved = storage.get(STORAGE_KEYS.theme);
    if (saved === 'dark' || saved === 'light') return saved;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  /**
   * 테마 적용.
   * animate: 전환 순간에만 색상 트랜지션 클래스를 붙여 부드럽게 바뀌게 함
   * persist: 사용자가 직접 바꾼 경우에만 저장 (OS 설정 추종과 구분)
   */
  function applyTheme(theme, { animate = false, persist = false } = {}) {
    const root = document.documentElement;
    if (animate) {
      root.classList.add('theme-transition');
      clearTimeout(themeTransitionTimer);
      themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transition'), TIMING.themeTransition);
    }
    root.dataset.theme = theme;

    const isDark = theme === 'dark';
    dom.themeToggle.setAttribute('aria-checked', String(isDark));
    dom.themeToggle.title = isDark ? '라이트 모드로 전환 (Alt+D)' : '다크 모드로 전환 (Alt+D)';

    if (persist) storage.set(STORAGE_KEYS.theme, theme);
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next, { animate: true, persist: true });
    announce(next === 'dark' ? '다크 모드로 전환했습니다.' : '라이트 모드로 전환했습니다.');
  }

  /* ==========================================================
   * 8. 키워드 기반 자동 카테고리 분류
   * ========================================================== */

  /**
   * 카테고리별 점수 계산.
   * 매칭된 키워드 길이의 합을 점수로 사용 (긴 키워드일수록 구체적이므로 가중치↑)
   * @returns {Array<{category: string, score: number, matches: string[]}>}
   */
  function scoreCategories(text) {
    const target = keywordKey(text || '');
    return keywordIndex.map(({ category, words }) => {
      const matches = [];
      let score = 0;
      if (target) {
        for (const { word, key } of words) {
          if (key && target.includes(key)) {
            matches.push(word);
            score += key.length;
          }
        }
      }
      return { category, score, matches };
    });
  }

  /**
   * 텍스트에 포함된 키워드로 카테고리 추정.
   * 최고 점수가 동점이면 판단하지 않음(null) → 사용자가 고른 값 유지
   * @returns {{category: string, keyword: string} | null}
   */
  function classifyText(text) {
    const ranked = scoreCategories(text)
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) return null;
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
    return { category: ranked[0].category, keyword: ranked[0].matches[0] };
  }

  /** 안내 문구 안에 넣는 '키워드 설정' 바로가기 버튼 */
  function createKeywordLink(label = '키워드 설정') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kw-link';
    btn.textContent = label;
    return btn;
  }

  /** 입력 중인 텍스트를 분류해 드롭다운에 반영하고 안내 문구 표시 */
  function updateAutoCategory() {
    const text = normalizeText(dom.input.value);
    dom.autoCategory.replaceChildren();

    if (!text) return;

    if (categoryLocked) {
      dom.autoCategory.textContent = '직접 선택한 카테고리를 사용합니다.';
      return;
    }

    const result = classifyText(text);
    if (!result) {
      // 어느 정도 입력했는데도 분류가 안 되면 키워드 추가를 안내
      if (text.length >= 4) {
        dom.autoCategory.append('일치하는 키워드가 없어요 · ', createKeywordLink('키워드 추가하기'));
      }
      return;
    }

    if (dom.categorySelect.value !== result.category) {
      dom.categorySelect.value = result.category;
      restartAnimation(dom.categorySelect, 'auto-applied');
    }

    const chip = document.createElement('span');
    chip.className = 'auto-chip';
    chip.dataset.category = result.category;
    chip.textContent = CATEGORIES[result.category];
    dom.autoCategory.append('자동 분류 ', chip, ` · '${result.keyword}' 키워드 · `, createKeywordLink());
  }

  const scheduleClassify = debounce(updateAutoCategory, TIMING.classifyDebounce);

  /** 추가 완료 후 자동 분류 상태 초기화 */
  function resetAutoCategory() {
    scheduleClassify.cancel();
    categoryLocked = false;
    dom.autoCategory.replaceChildren();
  }

  /* ---------- 키워드 설정 창 ----------
   * 카테고리별 키워드를 칩(chip)으로 보여 주고 추가/삭제/기본값 복원을 제공한다.
   * 변경 즉시 저장되고 자동 분류에 바로 반영된다.
   * 창은 모달이라 일반 토스트가 배경 뒤로 가려지므로, 피드백은 창 안의 상태 줄(kw-status)에 표시한다. */

  let kwOpener = null;        // 창을 연 요소 (닫을 때 포커스 복귀)
  let kwStatusTimer = null;
  let kwComposing = false;    // 한글 조합 중 Enter 제출 방지
  let kwPendingForm = null;
  let kwCloseHandled = true;  // 닫힘 후 정리를 한 번만 실행하기 위한 플래그

  /** 키워드가 어느 카테고리에 이미 있는지 */
  function findKeywordOwner(key) {
    for (const c of CATEGORY_KEYS) {
      const word = categoryKeywords[c].find((w) => keywordKey(w) === key);
      if (word) return { category: c, word };
    }
    return null;
  }

  /**
   * 키워드 추가 (검증 포함).
   * 같은 키워드가 다른 카테고리에 있으면 분류가 모호해지므로 막는다.
   * @returns {{ok: boolean, message: string, warn?: boolean, word?: string}}
   */
  function addKeyword(category, rawValue) {
    const word = normalizeText(rawValue);
    if (!word) return { ok: false, message: '키워드를 입력해 주세요.' };
    if (word.length > MAX_KEYWORD_LENGTH) {
      return { ok: false, message: `키워드는 ${MAX_KEYWORD_LENGTH}자 이하로 입력해 주세요.` };
    }

    const key = keywordKey(word);
    const owner = findKeywordOwner(key);
    if (owner) {
      return {
        ok: false,
        message:
          owner.category === category
            ? `'${owner.word}'은(는) 이미 등록된 키워드입니다.`
            : `'${owner.word}'은(는) 이미 '${CATEGORIES[owner.category]}' 키워드입니다. 옮기려면 먼저 그쪽에서 삭제해 주세요.`,
      };
    }
    if (categoryKeywords[category].length >= MAX_KEYWORDS_PER_CATEGORY) {
      return { ok: false, message: `카테고리당 최대 ${MAX_KEYWORDS_PER_CATEGORY}개까지 등록할 수 있습니다.` };
    }

    categoryKeywords[category].push(word);
    saveKeywords();

    const short = key.length === 1;
    return {
      ok: true,
      word,
      warn: short,
      message:
        `'${word}'을(를) ${CATEGORIES[category]} 키워드에 추가했습니다.` +
        (short ? ' 한 글자 키워드는 다른 단어에도 쉽게 포함되어 오분류가 늘 수 있어요.' : ''),
    };
  }

  /** 상태 줄 메시지 (action: 되돌리기 같은 버튼) */
  function setKwStatus(message, type = 'info', action = null) {
    clearTimeout(kwStatusTimer);
    dom.kwStatus.replaceChildren();
    dom.kwStatus.dataset.type = type;
    if (!message) return;

    dom.kwStatus.append(message);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kw-link';
      btn.textContent = action.label;
      btn.addEventListener('click', action.run, { once: true });
      dom.kwStatus.append(' ', btn);
    }
    kwStatusTimer = setTimeout(() => {
      // 상태 줄 안의 버튼에 포커스가 있으면 지우지 않음
      if (!dom.kwStatus.contains(document.activeElement)) dom.kwStatus.replaceChildren();
    }, action ? 8000 : 4000);
  }

  /** 카테고리 하나의 섹션 (제목 + 칩 목록 + 추가 폼) */
  function createKeywordSection(category) {
    const label = CATEGORIES[category];
    const words = categoryKeywords[category];

    const section = document.createElement('section');
    section.className = 'kw-section';
    section.dataset.category = category;

    const heading = document.createElement('h3');
    heading.className = 'kw-cat';
    const dot = document.createElement('span');
    dot.className = 'kw-dot';
    dot.setAttribute('aria-hidden', 'true');
    const count = document.createElement('span');
    count.className = 'kw-count';
    count.textContent = `${words.length}개`;
    heading.append(dot, label, count);

    const list = document.createElement('ul');
    list.className = 'kw-chips';
    list.setAttribute('aria-label', `${label} 키워드 목록`);
    if (words.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'kw-empty';
      empty.textContent = '키워드가 없습니다. 아래에서 추가해 보세요.';
      list.append(empty);
    }
    for (const word of words) {
      const li = document.createElement('li');
      li.className = 'kw-chip';
      const text = document.createElement('span');
      text.className = 'kw-word';
      text.textContent = word;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'kw-remove';
      remove.dataset.word = word;
      remove.setAttribute('aria-label', `'${word}' 키워드 삭제`);
      remove.title = '삭제';
      remove.textContent = '×';
      li.append(text, remove);
      list.append(li);
    }

    const form = document.createElement('form');
    form.className = 'kw-add';
    form.dataset.category = category;
    form.noValidate = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kw-input';
    input.maxLength = MAX_KEYWORD_LENGTH;
    input.autocomplete = 'off';
    input.placeholder = `${label} 키워드 추가`;
    input.setAttribute('aria-label', `${label} 카테고리에 키워드 추가`);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-ghost';
    submit.textContent = '추가';
    form.append(input, submit);

    section.append(heading, list, form);
    return section;
  }

  function renderKeywordSections() {
    dom.kwSections.replaceChildren(...CATEGORY_KEYS.map(createKeywordSection));
  }

  /** 한 카테고리만 다시 그림 (다른 섹션의 입력값/스크롤 유지) */
  function rerenderKeywordSection(category) {
    const fresh = createKeywordSection(category);
    const old = dom.kwSections.querySelector(`.kw-section[data-category="${category}"]`);
    if (old) old.replaceWith(fresh);
    else dom.kwSections.append(fresh);
    return fresh;
  }

  /** 분류 테스트: 입력 문장이 어떻게 분류되는지 근거와 함께 표시 */
  function updateKeywordTest() {
    const text = normalizeText(dom.kwTestInput.value);
    dom.kwTestResult.replaceChildren();

    if (!text) {
      dom.kwTestResult.textContent = '문장을 입력하면 어떤 카테고리로 분류되는지 보여 드려요.';
      return;
    }

    const matched = scoreCategories(text).filter((s) => s.score > 0);
    const result = classifyText(text);
    const describe = (s) => `${CATEGORIES[s.category]}(${s.matches.join(', ')})`;

    if (matched.length === 0) {
      dom.kwTestResult.textContent = '일치하는 키워드가 없어 자동 분류되지 않습니다.';
      return;
    }
    if (!result) {
      dom.kwTestResult.textContent = `점수가 같아 자동 분류하지 않습니다: ${matched.map(describe).join(' / ')}`;
      return;
    }

    const chip = document.createElement('span');
    chip.className = 'auto-chip';
    chip.dataset.category = result.category;
    chip.textContent = CATEGORIES[result.category];
    const winner = matched.find((s) => s.category === result.category);
    const others = matched.filter((s) => s.category !== result.category);
    dom.kwTestResult.append(
      '→ ',
      chip,
      ` 일치: ${winner.matches.join(', ')}`,
      others.length ? ` (그 외: ${others.map(describe).join(' / ')})` : ''
    );
  }

  /** 키워드가 바뀐 뒤 테스트 결과와 입력창 자동 분류를 갱신 */
  function afterKeywordsChanged() {
    updateKeywordTest();
    if (normalizeText(dom.input.value)) updateAutoCategory();
  }

  function openKeywordSettings() {
    if (typeof dom.kwDialog.showModal !== 'function') {
      toast('이 브라우저는 설정 창을 지원하지 않습니다. 최신 브라우저를 사용해 주세요.', { type: 'error' });
      return;
    }
    if (dom.kwDialog.open) return;
    if (editingId) commitEdit({ refocus: false });

    kwOpener = document.activeElement;
    kwCloseHandled = false;
    renderKeywordSections();
    setKwStatus('');
    // 입력 중이던 문장이 있으면 바로 테스트해 볼 수 있게 채워 둠
    dom.kwTestInput.value = normalizeText(dom.input.value);
    updateKeywordTest();
    dom.kwDialog.showModal();
    dom.kwTestInput.focus();
    dom.kwTestInput.select();
  }

  /** 키워드 추가 폼 제출 처리 */
  function handleKeywordSubmit(form) {
    const category = form.dataset.category;
    const input = form.querySelector('.kw-input');
    const res = addKeyword(category, input.value);

    if (!res.ok) {
      setKwStatus(res.message, 'error');
      restartAnimation(input, 'shake');
      input.focus();
      input.select();
      return;
    }

    const section = rerenderKeywordSection(category);
    const chips = section.querySelectorAll('.kw-chip');
    chips[chips.length - 1]?.classList.add('kw-new');
    section.querySelector('.kw-chips').scrollTop = section.querySelector('.kw-chips').scrollHeight;
    section.querySelector('.kw-input').focus();
    setKwStatus(res.message, res.warn ? 'warning' : 'success');
    afterKeywordsChanged();
  }

  /** 키워드 삭제 (원래 위치로 되돌리기 가능) */
  function handleKeywordRemove(button) {
    const section = button.closest('.kw-section');
    const category = section.dataset.category;
    const word = button.dataset.word;
    const index = categoryKeywords[category].indexOf(word);
    if (index === -1) return;

    categoryKeywords[category].splice(index, 1);
    saveKeywords();

    // 포커스: 같은 자리의 다음 칩 → 이전 칩 → 추가 입력창
    const fresh = rerenderKeywordSection(category);
    const removeButtons = fresh.querySelectorAll('.kw-remove');
    (removeButtons[index] || removeButtons[index - 1] || fresh.querySelector('.kw-input')).focus();

    setKwStatus(`'${word}' 키워드를 삭제했습니다.`, 'info', {
      label: '되돌리기',
      run: () => {
        if (findKeywordOwner(keywordKey(word))) return; // 그 사이 다시 추가된 경우
        categoryKeywords[category].splice(Math.min(index, categoryKeywords[category].length), 0, word);
        saveKeywords();
        const restored = rerenderKeywordSection(category);
        restored.querySelectorAll('.kw-chip')[index]?.classList.add('kw-new');
        restored.querySelectorAll('.kw-remove')[index]?.focus();
        setKwStatus(`'${word}' 키워드를 복구했습니다.`, 'success');
        afterKeywordsChanged();
      },
    });
    afterKeywordsChanged();
  }

  async function handleKeywordReset() {
    const answer = await showDialog({
      title: '기본 키워드로 되돌리기',
      message: '직접 추가하거나 삭제한 키워드가 모두 사라지고 처음 제공된 키워드 목록으로 돌아갑니다.\n계속할까요?',
      buttons: [
        { label: '취소', value: 'cancel', autofocus: true },
        { label: '되돌리기', value: 'reset', variant: 'danger' },
      ],
    });
    if (answer !== 'reset') return;

    resetKeywords();
    renderKeywordSections();
    setKwStatus('기본 키워드로 되돌렸습니다.', 'success');
    afterKeywordsChanged();
  }

  /* ==========================================================
   * 9. 렌더링
   * ========================================================== */

  /** 현재 필터 + 검색어 조건을 만족하는 할 일을 정렬해서 반환 (원본은 변경하지 않음) */
  function getVisibleTodos() {
    const q = searchQuery.toLowerCase();
    const filtered = todos.filter(
      (t) =>
        (currentFilter === 'all' || t.category === currentFilter) &&
        (!q || t.text.toLowerCase().includes(q))
    );
    return sortTodos(filtered);
  }

  /** 정렬 (Array.prototype.sort는 안정 정렬이라 같은 값끼리는 기존 순서 유지) */
  function sortTodos(list) {
    const byStatus = (a, b) => Number(a.completed) - Number(b.completed);
    switch (currentSort) {
      case 'manual':
        return list; // 배열 순서 그대로
      case 'created':
        return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); // 최신순
      case 'category':
        return list.sort(
          (a, b) => CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category) || byStatus(a, b)
        );
      case 'status':
      default:
        return list.sort(byStatus); // 미완료 → 완료
    }
  }

  /** 대시보드 / 배지 / 필터 개수 / 응원 메시지 갱신 (필터와 무관하게 전체 기준) */
  function renderStats() {
    const [todayStart, todayEnd] = todayRange();
    const per = {};
    CATEGORY_KEYS.forEach((c) => (per[c] = { done: 0, total: 0 }));

    let done = 0;
    let today = 0;
    for (const t of todos) {
      if (t.completed) done++;
      const created = Date.parse(t.createdAt);
      if (created >= todayStart && created < todayEnd) today++;
      per[t.category].total++;
      if (t.completed) per[t.category].done++;
    }

    const total = todos.length;
    const remaining = total - done;
    const pct = percent(done, total);

    // 전체 진행률
    dom.overallText.textContent = `${done}/${total} 완료 (${pct}%)`;
    dom.overallBar.style.width = `${pct}%`;
    dom.overallBar.classList.toggle('is-complete', total > 0 && pct === 100);
    dom.overallProgress.setAttribute('aria-valuenow', String(pct));
    dom.overallProgress.setAttribute('aria-valuetext', `${total}개 중 ${done}개 완료, ${pct}퍼센트`);

    // 카테고리별 미니 진행률
    for (const c of CATEGORY_KEYS) {
      const { done: cd, total: ct } = per[c];
      const cp = percent(cd, ct);
      const els = miniStatEls[c];
      if (!els) continue;
      els.count.textContent = `${cd}/${ct}`;
      els.bar.style.width = `${cp}%`;
      els.progress.setAttribute('aria-valuenow', String(cp));
      els.progress.setAttribute('aria-valuetext', `${ct}개 중 ${cd}개 완료`);
    }

    dom.todayCount.textContent = String(today);

    // 남은 할 일 배지 (값이 바뀌면 통통 튀는 애니메이션)
    dom.remainingCount.textContent = String(remaining);
    dom.remainingBadge.classList.toggle('is-zero', remaining === 0);
    if (lastRemaining !== null && lastRemaining !== remaining) restartAnimation(dom.remainingBadge, 'bump');
    lastRemaining = remaining;

    // 필터 버튼 옆 남은 개수
    filterEls.all.count.textContent = String(remaining);
    for (const c of CATEGORY_KEYS) {
      filterEls[c].count.textContent = String(per[c].total - per[c].done);
    }

    // 완료 항목 삭제 버튼
    dom.completedCount.textContent = `(${done})`;
    dom.clearCompleted.disabled = done === 0;

    // 응원 메시지
    dom.cheer.textContent = cheerMessage(done, total);

    // 방금 100%를 달성했다면 축하
    if (lastPct !== null && total > 0 && pct === 100 && lastPct < 100) {
      toast('🎉 모든 할 일을 완료했어요! 수고하셨습니다!', { type: 'success' });
    }
    lastPct = pct;
  }

  /** 필터 버튼 활성 상태 */
  function renderFilters() {
    for (const f of FILTERS) {
      const active = f === currentFilter;
      filterEls[f].btn.classList.toggle('active', active);
      filterEls[f].btn.setAttribute('aria-pressed', String(active));
    }
  }

  /** 정렬 UI 상태 */
  function renderSortUI() {
    dom.sortSelect.value = currentSort;
    dom.list.classList.toggle('is-manual', currentSort === 'manual');
  }

  /** 검색어 하이라이트 (<mark>) — 사용자 텍스트는 항상 텍스트 노드로만 넣어 XSS 방지 */
  function appendHighlighted(parent, text, query) {
    if (!query) {
      parent.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let pos = 0;
    let idx;
    while ((idx = lower.indexOf(q, pos)) !== -1) {
      if (idx > pos) parent.append(text.slice(pos, idx));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(idx, idx + q.length);
      parent.append(mark);
      pos = idx + q.length;
    }
    if (pos < text.length) parent.append(text.slice(pos));
  }

  function createCategorySelect(className, selected) {
    const select = document.createElement('select');
    select.className = className;
    select.setAttribute('aria-label', '카테고리');
    for (const [value, label] of Object.entries(CATEGORIES)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selected;
      select.append(option);
    }
    return select;
  }

  function createButton(className, text, ariaLabel, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.setAttribute('aria-label', ariaLabel);
    if (title) btn.title = title;
    return btn;
  }

  /** 보기 모드 본문: 텍스트 + 카테고리 태그 + 생성 시간 */
  function createViewBody(todo) {
    const body = document.createElement('div');
    body.className = 'todo-body';

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.title = '더블클릭하여 수정';
    appendHighlighted(text, todo.text, searchQuery);

    const meta = document.createElement('div');
    meta.className = 'todo-meta';

    const tag = document.createElement('span');
    tag.className = 'category-tag';
    tag.textContent = CATEGORIES[todo.category];

    const time = document.createElement('time');
    time.className = 'todo-time';
    time.dateTime = todo.createdAt;
    time.title = new Date(todo.createdAt).toLocaleString('ko-KR');
    time.textContent = formatRelativeTime(todo.createdAt);

    meta.append(tag, time);
    body.append(text, meta);
    return body;
  }

  /** 편집 모드 본문: 카테고리 select + 텍스트 input + 저장/취소 버튼 */
  function createEditBody(todo) {
    const wrap = document.createElement('div');
    wrap.className = 'todo-edit';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', '할 일 수정');

    const select = createCategorySelect('edit-select', todo.category);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = todo.text;
    input.maxLength = MAX_TEXT_LENGTH;
    input.setAttribute('aria-label', '할 일 내용 (Enter 저장, Esc 취소)');

    const save = createButton('item-btn edit-save', '✓', '저장 (Enter)', '저장 (Enter)');
    const cancel = createButton('item-btn edit-cancel', '✕', '취소 (Esc)', '취소 (Esc)');

    wrap.append(select, input, save, cancel);
    return wrap;
  }

  /** 할 일 항목 요소 생성 */
  function createTodoElement(todo) {
    const editing = todo.id === editingId;
    const label = shortLabel(todo.text);

    const li = document.createElement('li');
    li.className = 'todo-item';
    if (todo.completed) li.classList.add('completed');
    if (editing) li.classList.add('editing');
    li.dataset.id = todo.id;
    li.dataset.category = todo.category;

    // 직접 정렬 모드에서만 CSS로 보이는 드래그 핸들 (키보드: ↑/↓)
    const handle = createButton(
      'drag-handle',
      '⠿',
      `"${label}" 순서 변경. 위아래 방향키로 이동`,
      '드래그하여 순서 변경'
    );

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.completed;
    checkbox.setAttribute('aria-label', `"${label}" 완료`);

    li.append(handle, checkbox, editing ? createEditBody(todo) : createViewBody(todo));

    if (!editing) {
      const actions = document.createElement('div');
      actions.className = 'todo-actions';
      actions.append(
        createButton('item-btn edit-btn', '✎', `"${label}" 수정`, '수정 (더블클릭)'),
        createButton('item-btn delete-btn', '×', `"${label}" 삭제`, '삭제')
      );
      li.append(actions);
    }
    return li;
  }

  /**
   * 항목의 "모양"을 결정하는 값들의 서명.
   * 서명이 같으면 기존 DOM을 그대로 재사용하고, 다를 때만 새로 만든다.
   */
  function signatureOf(todo) {
    return [todo.text, todo.completed, todo.category, todo.id === editingId, searchQuery].join('\u0001');
  }

  const FOCUS_ROLES = ['todo-checkbox', 'edit-btn', 'delete-btn', 'drag-handle', 'edit-input', 'edit-select'];

  /** 렌더링 전 목록 안의 포커스 위치 기억 (항목 id + 어떤 버튼인지) */
  function captureFocus() {
    const active = document.activeElement;
    if (!active || !dom.list.contains(active)) return null;
    const item = active.closest('.todo-item');
    const role = FOCUS_ROLES.find((r) => active.classList.contains(r));
    return item && role ? { id: item.dataset.id, role } : null;
  }

  /** DOM 이동/교체로 포커스가 사라졌다면 같은 항목의 같은 버튼으로 복원 */
  function restoreFocus(info) {
    if (!info) return;
    const item = itemEl(info.id);
    if (!item || item.contains(document.activeElement)) return;
    const target = item.querySelector(`.${info.role}`) || item.querySelector('.todo-checkbox');
    target?.focus({ preventScroll: true });
  }

  /**
   * 목록 렌더링 — 키 기반 재조정(reconciliation).
   * 매번 innerHTML을 비우고 다시 만드는 대신:
   *  1) 바뀐 항목만 새로 만들고
   *  2) 순서가 다른 요소만 insertBefore로 옮기고
   *  3) 더 이상 보이지 않는 요소만 제거한다.
   * 항목이 수백 개여도 체크 하나 바꿀 때 DOM 변경은 최소화된다.
   */
  function renderList() {
    isRendering = true;
    try {
      const focusInfo = captureFocus();
      const visible = getVisibleTodos();
      let cursor = dom.list.firstElementChild;

      for (const todo of visible) {
        const sig = signatureOf(todo);
        let entry = elementCache.get(todo.id);

        if (!entry || entry.sig !== sig) {
          const el = createTodoElement(todo);
          if (entry && entry.el.parentNode === dom.list) {
            if (cursor === entry.el) cursor = el;
            entry.el.replaceWith(el);
          }
          entry = { el, sig };
          elementCache.set(todo.id, entry);
        }

        const anim = pendingEnter.get(todo.id);
        if (anim) restartAnimation(entry.el, anim);

        if (entry.el === cursor) {
          cursor = cursor.nextElementSibling;
        } else {
          dom.list.insertBefore(entry.el, cursor);
        }
      }

      // cursor 이후에 남은 요소들은 더 이상 보이지 않는 항목
      while (cursor) {
        const next = cursor.nextElementSibling;
        elementCache.delete(cursor.dataset.id);
        cursor.remove();
        cursor = next;
      }

      pendingEnter.clear();
      restoreFocus(focusInfo);
      updateEmptyState(visible.length);
    } finally {
      isRendering = false;
    }
  }

  /** 빈 상태 메시지 (전체가 비었는지, 필터/검색 결과가 없는지 구분) */
  function updateEmptyState(visibleCount) {
    let message = '';
    if (visibleCount === 0) {
      if (todos.length === 0) {
        message = '할 일이 없습니다. 추가해보세요!';
      } else if (searchQuery) {
        message = `"${searchQuery}"에 대한 검색 결과가 없습니다.`;
      } else if (currentFilter !== 'all') {
        message = `'${CATEGORIES[currentFilter]}' 카테고리에 할 일이 없습니다. 추가해보세요!`;
      } else {
        message = '할 일이 없습니다. 추가해보세요!';
      }
    }
    dom.empty.textContent = message;
    dom.empty.hidden = !message;
  }

  /** 전체 렌더링 */
  function render() {
    renderStats();
    renderFilters();
    renderSortUI();
    renderList();
  }

  /* ==========================================================
   * 10. 할 일 조작
   * ========================================================== */

  /** 같은 내용의 할 일 찾기 (대소문자/공백 무시) */
  function findDuplicate(text, excludeId = null) {
    const key = duplicateKey(text);
    return todos.find((t) => t.id !== excludeId && duplicateKey(t.text) === key) || null;
  }

  /** 입력값 검증 실패 시 피드백 (흔들림 + 알림) */
  function rejectInput(message) {
    restartAnimation(dom.input, 'shake');
    dom.input.setAttribute('aria-invalid', 'true');
    toast(message, { type: 'warning' });
    dom.input.focus();
  }

  let addInFlight = false; // 중복 확인 다이얼로그가 떠 있는 동안 재제출 방지

  /** 폼 제출 처리: 검증 → 중복 확인 → 추가 */
  async function handleAdd() {
    if (addInFlight) return;

    const text = normalizeText(dom.input.value).slice(0, MAX_TEXT_LENGTH);
    if (!text) {
      rejectInput('할 일 내용을 입력해 주세요.');
      return;
    }

    // 디바운스 대기 중인 자동 분류를 즉시 반영한 뒤 카테고리 결정
    scheduleClassify.flush();
    const category = pickAllowed(dom.categorySelect.value, CATEGORY_KEYS, DEFAULT_CATEGORY);

    const dup = findDuplicate(text);
    if (dup) {
      addInFlight = true;
      try {
        const answer = await showDialog({
          title: '중복된 할 일',
          message: `"${shortLabel(dup.text, 50)}"은(는) 이미 ${dup.completed ? '완료된 항목으로 ' : ''}목록에 있습니다.\n그래도 추가할까요?`,
          buttons: [
            { label: '취소', value: 'cancel', autofocus: true },
            { label: '추가', value: 'add', variant: 'primary' },
          ],
        });
        if (answer !== 'add') {
          dom.input.focus();
          dom.input.select();
          return;
        }
      } finally {
        addInFlight = false;
      }
    }

    addTodo(text, category);
    dom.input.value = '';
    dom.input.removeAttribute('aria-invalid');
    resetAutoCategory();
    dom.input.focus();
  }

  /** 할 일 추가 */
  function addTodo(text, category) {
    const todo = {
      id: generateId(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
      category,
    };
    todos.push(todo);
    scheduleSave();

    pendingEnter.set(todo.id, 'fade-in');
    renderStats();
    renderList();

    const el = itemEl(todo.id);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      announce(`"${shortLabel(text)}" 추가됨, ${CATEGORIES[category]} 카테고리`);
    } else {
      // 필터나 검색 때문에 방금 추가한 항목이 안 보이는 경우 안내
      toast(`'${CATEGORIES[category]}'에 추가했지만 현재 필터/검색 조건 때문에 보이지 않아요.`, {
        type: 'info',
        action: { label: '모두 보기', run: showAll },
      });
    }
  }

  /** 필터/검색 해제 */
  function showAll() {
    clearSearch({ focus: false });
    setFilter('all');
  }

  /** 완료 토글 (대시보드는 즉시, 목록은 슬라이드 애니메이션 후 재배치) */
  async function toggleTodo(id) {
    const todo = findTodo(id);
    if (!todo) return;

    const el = itemEl(id);
    if (el?.classList.contains('is-animating')) return;

    todo.completed = !todo.completed;
    scheduleSave();
    renderStats();
    announce(`"${shortLabel(todo.text)}" ${todo.completed ? '완료' : '미완료로 변경'}`);

    if (el) {
      el.classList.add('is-animating');
      el.classList.toggle('completed', todo.completed);
      const cb = el.querySelector('.todo-checkbox');
      if (cb) cb.checked = todo.completed;
      await playAnimation(el, 'slide-out');
    }

    pendingEnter.set(id, 'slide-in');
    renderList();
  }

  /**
   * 여러 항목 삭제 (단일 삭제 / 완료 항목 일괄 삭제 공용).
   * 원래 위치(index)를 기억해 두어 되돌리기 시 정확히 같은 자리에 복구한다.
   */
  async function deleteTodos(ids, { label } = {}) {
    const idSet = new Set(ids);
    const records = [];
    todos.forEach((todo, index) => {
      if (idSet.has(todo.id)) records.push({ todo, index });
    });
    if (records.length === 0) return;

    // 삭제될 항목에 포커스가 있었다면 다음(없으면 이전) 항목으로 옮길 준비
    const active = document.activeElement;
    const focusedItem = active && dom.list.contains(active) ? active.closest('.todo-item') : null;
    let nextFocusId = null;
    if (focusedItem && idSet.has(focusedItem.dataset.id)) {
      const order = [...dom.list.children].map((el) => el.dataset.id);
      const pos = order.indexOf(focusedItem.dataset.id);
      nextFocusId =
        order.slice(pos + 1).find((id) => !idSet.has(id)) ||
        order.slice(0, pos).reverse().find((id) => !idSet.has(id)) ||
        null;
    }

    if (editingId && idSet.has(editingId)) editingId = null;

    // 상태 먼저 갱신 → 대시보드 즉시 반영
    todos = todos.filter((t) => !idSet.has(t.id));
    scheduleSave();
    renderStats();

    const name = label || `"${shortLabel(records[0].todo.text, 20)}"`;
    const entry = {
      message: `${name} 복구했습니다.`,
      restore() {
        const existing = new Set(todos.map((t) => t.id));
        // index 오름차순으로 끼워 넣어야 원래 순서가 정확히 복원됨
        for (const { todo, index } of records) {
          if (existing.has(todo.id)) continue; // 다른 경로로 이미 복구된 경우
          todos.splice(Math.min(index, todos.length), 0, todo);
          pendingEnter.set(todo.id, 'fade-in');
        }
      },
    };
    pushUndo(entry);
    toast(`${name} 삭제했습니다.`, {
      action: { label: '실행 취소', run: () => performUndo(entry) },
    });

    // 페이드아웃 후 목록 정리
    const els = records.map((r) => itemEl(r.todo.id)).filter(Boolean);
    await Promise.all(
      els.map((el) => {
        el.classList.add('is-animating');
        return playAnimation(el, 'fade-out');
      })
    );
    renderList();

    if (nextFocusId && itemEl(nextFocusId)) {
      itemEl(nextFocusId).querySelector('.todo-checkbox')?.focus();
    } else if (focusedItem) {
      dom.input.focus();
    }
  }

  /** 완료 항목 일괄 삭제 (확인 다이얼로그) */
  async function clearCompleted() {
    const count = todos.filter((t) => t.completed).length;
    if (count === 0) {
      toast('삭제할 완료 항목이 없습니다.');
      return;
    }

    const answer = await showDialog({
      title: '완료된 항목 삭제',
      message: `완료된 할 일 ${count}개를 모두 삭제할까요?\n삭제한 뒤에도 '실행 취소'로 되돌릴 수 있습니다.`,
      buttons: [
        { label: '취소', value: 'cancel', autofocus: true },
        { label: `${count}개 삭제`, value: 'delete', variant: 'danger' },
      ],
    });
    if (answer !== 'delete') return;

    // 다이얼로그가 떠 있는 동안 다른 탭에서 바뀌었을 수 있으므로 다시 계산
    const ids = todos.filter((t) => t.completed).map((t) => t.id);
    if (ids.length === 0) return;
    deleteTodos(ids, { label: `완료 항목 ${ids.length}개를` });
  }

  /* ---------- 되돌리기 ---------- */

  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  /** 특정 기록 되돌리기 (토스트 버튼은 자기 작업만 되돌림) */
  function performUndo(entry) {
    const idx = undoStack.indexOf(entry);
    if (idx === -1) {
      toast('이미 복구했거나 만료된 작업입니다.', { type: 'warning' });
      return;
    }
    undoStack.splice(idx, 1);
    if (editingId) cancelEdit({ refocus: false });

    try {
      entry.restore();
    } catch (e) {
      console.error('[undo]', e);
      toast('복구 중 오류가 발생했습니다.', { type: 'error' });
      return;
    }
    scheduleSave();
    render();
    toast(entry.message, { type: 'success' });
  }

  /** Ctrl+Z: 가장 최근 작업 되돌리기 */
  function undoLast() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) {
      toast('되돌릴 작업이 없습니다.');
      return;
    }
    performUndo(entry);
  }

  /* ---------- 인라인 편집 ---------- */

  function startEdit(id) {
    if (editingId === id) return;
    if (editingId) commitEdit({ refocus: false });
    if (!findTodo(id)) return;

    editingId = id;
    renderList();

    const input = itemEl(id)?.querySelector('.edit-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  /**
   * 편집 저장.
   * refocus: Enter/저장 버튼으로 끝낸 경우 해당 항목의 수정 버튼으로 포커스 복귀.
   *          (다른 곳을 클릭해서 끝난 경우에는 포커스를 빼앗지 않음)
   */
  function commitEdit({ refocus = true } = {}) {
    if (!editingId) return;
    const id = editingId;
    const el = itemEl(id);
    const todo = findTodo(id);
    editingId = null; // 렌더링 중 focusout으로 재진입하지 않도록 먼저 해제

    if (el && todo) {
      const newText = normalizeText(el.querySelector('.edit-input')?.value).slice(0, MAX_TEXT_LENGTH);
      const newCategory = pickAllowed(el.querySelector('.edit-select')?.value, CATEGORY_KEYS, todo.category);

      if (!newText) {
        toast('내용이 비어 있어 이전 내용을 유지합니다.', { type: 'warning' });
      }

      const textChanged = Boolean(newText) && newText !== todo.text;
      const categoryChanged = newCategory !== todo.category;

      if (textChanged || categoryChanged) {
        if (textChanged) todo.text = newText;
        todo.category = newCategory;
        scheduleSave();
        pendingEnter.set(id, 'flash');

        if (textChanged && findDuplicate(newText, id)) {
          toast('같은 내용의 할 일이 이미 있습니다.', { type: 'warning' });
        }
        announce('수정했습니다.');
      }
    }

    renderStats();
    renderList();

    const after = itemEl(id);
    if (!after && todo) {
      toast('수정한 항목이 현재 필터/검색 조건에서 벗어나 숨겨졌습니다.', {
        action: { label: '모두 보기', run: showAll },
      });
    }
    if (refocus) (after?.querySelector('.edit-btn') || dom.input).focus();
  }

  function cancelEdit({ refocus = true } = {}) {
    if (!editingId) return;
    const id = editingId;
    editingId = null;
    renderList();
    announce('수정을 취소했습니다.');
    if (refocus) itemEl(id)?.querySelector('.edit-btn')?.focus();
  }

  /* ==========================================================
   * 11. 정렬과 드래그 앤 드롭
   * ========================================================== */

  function setSort(sort) {
    if (!SORT_LABELS[sort]) return;
    currentSort = sort;
    storage.set(STORAGE_KEYS.sort, sort);
    renderSortUI();
    renderList();
    if (sort === 'manual') {
      toast('⠿ 핸들을 드래그하거나 Alt+↑/↓ 로 순서를 바꿀 수 있어요.');
    } else {
      announce(`${SORT_LABELS[sort]}으로 정렬했습니다.`);
    }
  }

  /**
   * 화면에 보이는 항목들의 새 순서를 원본 배열에 반영.
   * 필터/검색으로 숨겨진 항목은 원래 자리에 그대로 두고,
   * 보이는 항목이 차지하던 "자리"에만 새 순서대로 채워 넣는다.
   */
  function applyVisibleOrder(orderedIds) {
    const byIdMap = new Map(todos.map((t) => [t.id, t]));
    const ids = orderedIds.filter((id) => byIdMap.has(id));
    const idSet = new Set(ids);
    if (ids.length !== idSet.size) return false; // 중복 id → 비정상

    let k = 0;
    todos = todos.map((t) => (idSet.has(t.id) ? byIdMap.get(ids[k++]) : t));
    scheduleSave();
    return true;
  }

  /** 키보드로 순서 이동 (Alt+↑/↓ 또는 핸들에서 ↑/↓) */
  function moveTodo(id, delta) {
    if (currentSort !== 'manual') {
      toast('순서 변경은 "직접 정렬" 모드에서 할 수 있어요.', {
        action: { label: '직접 정렬로 전환', run: () => setSort('manual') },
      });
      return;
    }
    const ids = getVisibleTodos().map((t) => t.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1) return;
    if (to < 0 || to >= ids.length) {
      announce(to < 0 ? '이미 맨 위입니다.' : '이미 맨 아래입니다.');
      return;
    }
    [ids[from], ids[to]] = [ids[to], ids[from]];
    if (!applyVisibleOrder(ids)) return;
    renderList();
    announce(`${ids.length}개 중 ${to + 1}번째로 이동했습니다.`);
  }

  /**
   * 포인터 이벤트 기반 드래그 앤 드롭.
   * HTML5 Drag & Drop API는 터치 기기에서 동작하지 않으므로 직접 구현한다.
   * - 포인터 캡처는 목록(ul)에 걸어 항목이 DOM에서 이동해도 캡처가 풀리지 않게 함
   * - 끌고 있는 항목의 중심이 이웃 항목의 중앙을 넘으면 자리를 바꿈
   * - transform으로 손가락/커서 위치를 따라가게 보정
   */
  let drag = null;

  function onDragStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle || currentSort !== 'manual' || editingId) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const item = handle.closest('.todo-item');
    if (!item || item.classList.contains('is-animating')) return;

    e.preventDefault();
    try {
      dom.list.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 실패해도 드래그는 계속 가능 */
    }

    drag = {
      id: item.dataset.id,
      item,
      pointerId: e.pointerId,
      startY: e.clientY + window.scrollY,
      startTop: item.offsetTop,
      moved: false,
      originalOrder: [...dom.list.children].map((el) => el.dataset.id),
    };
  }

  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    const pageY = e.clientY + window.scrollY;
    const dy = pageY - drag.startY;

    // 살짝 누른 것(클릭)과 드래그를 구분하는 최소 이동 거리
    if (!drag.moved) {
      if (Math.abs(dy) < 5) return;
      drag.moved = true;
      drag.item.classList.add('dragging');
      dom.list.classList.add('is-dragging');
      // 스크롤 앵커링 끄기: 드래그 중 항목 순서가 바뀌면 브라우저가 화면 위치를 유지하려고
      // 스크롤을 보정하는데, 이것이 자동 스크롤과 반대로 움직여 위로 끌 때 화면이 내려가 버린다.
      document.documentElement.classList.add('is-dragging-todo');
    }

    const { item } = drag;
    const desiredTop = drag.startTop + dy;
    const center = desiredTop + item.offsetHeight / 2;

    // 위쪽 이웃의 중앙보다 올라가면 앞으로
    let prev = item.previousElementSibling;
    while (prev && center < prev.offsetTop + prev.offsetHeight / 2) {
      dom.list.insertBefore(item, prev);
      prev = item.previousElementSibling;
    }
    // 아래쪽 이웃의 중앙보다 내려가면 뒤로
    let next = item.nextElementSibling;
    while (next && center > next.offsetTop + next.offsetHeight / 2) {
      dom.list.insertBefore(next, item);
      next = item.nextElementSibling;
    }

    item.style.transform = `translateY(${desiredTop - item.offsetTop}px)`;

    // 화면 가장자리에서 자동 스크롤.
    // 데스크톱 레이아웃에서는 위쪽 기준을 화면 맨 위가 아니라 고정된 검색/입력 영역의 아래 끝으로 잡는다.
    // (그렇지 않으면 항목이 고정 영역 뒤로 숨은 뒤에야 스크롤이 시작됨)
    const edge = 60;
    const topEdge = stickyHeadBottom() + edge;
    if (e.clientY < topEdge) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
  }

  /**
   * 화면 위에 고정(sticky)된 영역의 아래 끝 y좌표.
   * 고정 영역이 없거나(모바일 1단 레이아웃) sticky가 아니면 0.
   */
  function stickyHeadBottom() {
    if (!dom.mainHead) return 0;
    if (getComputedStyle(dom.mainHead).position !== 'sticky') return 0;
    return Math.max(0, dom.mainHead.getBoundingClientRect().bottom);
  }

  /**
   * 고정 영역 높이를 CSS 변수(--sticky-head-h)로 반영 → desktop.css의 scroll-padding-top이 사용.
   * 자동 분류 안내 줄이 생기거나, 창 크기가 바뀌어 높이가 달라질 때마다 다시 잰다.
   */
  function syncStickyHeadHeight() {
    if (!dom.mainHead) return;
    const height = Math.round(dom.mainHead.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--sticky-head-h', `${height}px`);
  }

  function endDrag(cancelled) {
    if (!drag) return;
    const { item, moved, id, pointerId, originalOrder } = drag;
    drag = null;

    try {
      dom.list.releasePointerCapture(pointerId);
    } catch {
      /* 이미 해제됨 */
    }
    item.style.transform = '';
    item.classList.remove('dragging');
    dom.list.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-dragging-todo');

    if (!moved) return;

    if (cancelled) {
      renderList(); // 원래 순서로 되돌림
      announce('순서 변경을 취소했습니다.');
      return;
    }

    const newOrder = [...dom.list.children].map((el) => el.dataset.id);
    if (newOrder.join() !== originalOrder.join() && applyVisibleOrder(newOrder)) {
      pendingEnter.set(id, 'flash');
      renderList();
      announce(`${newOrder.length}개 중 ${newOrder.indexOf(id) + 1}번째로 이동했습니다.`);
    }
    itemEl(id)?.querySelector('.drag-handle')?.focus({ preventScroll: true });
  }

  /* ==========================================================
   * 12. 검색 / 필터
   * ========================================================== */

  function setFilter(filter, { viaShortcut = false } = {}) {
    if (!FILTERS.includes(filter)) return;
    if (viaShortcut) restartAnimation(filterEls[filter].btn, 'pulse');
    if (filter === currentFilter) return;

    currentFilter = filter;
    storage.set(STORAGE_KEYS.filter, filter);

    // 특정 카테고리를 보는 중이면 새 할 일 기본 카테고리도 맞춰 줌 (자동 분류가 우선)
    if (filter !== 'all' && !normalizeText(dom.input.value)) dom.categorySelect.value = filter;

    renderFilters();
    renderList();
    announce(`${FILTER_LABELS[filter]} 필터, ${dom.list.children.length}개 표시`);
  }

  const applySearch = debounce(() => {
    searchQuery = normalizeText(dom.search.value);
    renderList();
    if (searchQuery) announce(`검색 결과 ${dom.list.children.length}개`);
  }, TIMING.searchDebounce);

  function clearSearch({ focus = true } = {}) {
    applySearch.cancel();
    dom.search.value = '';
    dom.searchClear.hidden = true;
    if (searchQuery) {
      searchQuery = '';
      renderList();
    }
    if (focus) dom.search.focus();
  }

  /* ==========================================================
   * 13. 내보내기 / 가져오기
   * ========================================================== */

  /** JSON 파일로 내보내기. 성공 여부 반환 */
  function exportData({ silent = false } = {}) {
    saveNow();
    if (todos.length === 0) {
      if (!silent) toast('내보낼 할 일이 없습니다.', { type: 'warning' });
      return false;
    }
    try {
      const payload = {
        app: 'my-tasks',
        version: 1,
        exportedAt: new Date().toISOString(),
        count: todos.length,
        todos,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-tasks-${fileStamp()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      // 다운로드가 시작될 시간을 준 뒤 메모리 해제
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`할 일 ${todos.length}개를 내보냈습니다.`, { type: 'success' });
      return true;
    } catch (e) {
      console.error('[export]', e);
      toast('내보내기에 실패했습니다.', { type: 'error' });
      return false;
    }
  }

  /**
   * JSON 파일 가져오기.
   * 지원 형식: 내보내기 형식({ todos: [...] }) 또는 할 일 배열([...]) 그대로.
   * 현재 데이터가 있으면 백업 여부를 묻고, 가져온 뒤에도 '실행 취소'로 되돌릴 수 있다.
   */
  async function importFile(file) {
    if (!file) return;

    if (file.size === 0) {
      toast('빈 파일입니다.', { type: 'error' });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      toast('파일이 너무 큽니다. (최대 5MB)', { type: 'error' });
      return;
    }

    let text;
    try {
      text = await file.text();
    } catch (e) {
      console.error('[import]', e);
      toast('파일을 읽지 못했습니다.', { type: 'error' });
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      toast('올바른 JSON 파일이 아닙니다.', { type: 'error' });
      return;
    }

    const rawList = Array.isArray(data) ? data : data && Array.isArray(data.todos) ? data.todos : null;
    if (!rawList) {
      toast('파일에서 할 일 데이터를 찾을 수 없습니다.', { type: 'error' });
      return;
    }

    const { list: imported, skipped } = sanitizeList(rawList);
    if (imported.length === 0) {
      toast('가져올 수 있는 할 일이 없습니다.', { type: 'error' });
      return;
    }

    // 현재 데이터가 있으면 교체 전 백업 확인
    if (todos.length > 0) {
      const choice = await showDialog({
        title: '데이터 가져오기',
        message:
          `"${file.name}"에서 할 일 ${imported.length}개를 가져옵니다.\n` +
          `현재 할 일 ${todos.length}개는 가져온 데이터로 교체됩니다.\n\n` +
          '가져오기 전에 현재 데이터를 파일로 백업할까요?',
        buttons: [
          { label: '취소', value: 'cancel' },
          { label: '백업 없이 가져오기', value: 'replace' },
          { label: '백업 후 가져오기', value: 'backup', variant: 'primary', autofocus: true },
        ],
      });
      if (!choice) {
        toast('가져오기를 취소했습니다.');
        return;
      }
      if (choice === 'backup' && !exportData({ silent: true })) {
        toast('백업에 실패해 가져오기를 중단했습니다.', { type: 'error' });
        return;
      }
    }

    const snapshot = todos;
    if (editingId) editingId = null;
    todos = imported;
    imported.forEach((t) => pendingEnter.set(t.id, 'fade-in'));
    saveNow();

    const undoEntry = {
      message: '가져오기 전 데이터로 복구했습니다.',
      restore() {
        todos = snapshot;
      },
    };
    pushUndo(undoEntry);

    render();
    toast(
      `할 일 ${imported.length}개를 가져왔습니다.` + (skipped ? ` (잘못된 항목 ${skipped}개 제외)` : ''),
      { type: 'success', action: { label: '실행 취소', run: () => performUndo(undoEntry) } }
    );
  }

  /* ==========================================================
   * 14. 격언 & 응원 메시지
   * ========================================================== */

  /** 날짜마다 바뀌는 인덱스 (같은 날에는 같은 격언) */
  function dailyQuoteIndex() {
    const d = new Date();
    const dayNumber = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
    return ((dayNumber % QUOTES.length) + QUOTES.length) % QUOTES.length;
  }

  function showQuote(index, { animate = false } = {}) {
    quoteIndex = index;
    const { text, author } = QUOTES[index];
    dom.quoteText.textContent = text;
    dom.quoteAuthor.textContent = author;
    if (animate) restartAnimation(dom.quote, 'is-changing');
  }

  /** 현재와 다른 격언을 무작위로 */
  function randomQuote() {
    if (QUOTES.length < 2) return;
    let next;
    do {
      next = Math.floor(Math.random() * QUOTES.length);
    } while (next === quoteIndex);
    showQuote(next, { animate: true });
  }

  /** 완료율에 따른 응원 메시지 */
  function cheerMessage(done, total) {
    if (total === 0) return '할 일을 추가하고 오늘을 시작해 보세요! ✨';
    const ratio = done / total;
    if (ratio === 1) return '모두 완료! 정말 대단해요 🎉';
    if (ratio >= 0.75) return '거의 다 왔어요! 조금만 더 힘내요 🔥';
    if (ratio >= 0.5) return '절반을 넘었어요! 이 페이스 그대로 👍';
    if (ratio >= 0.25) return '좋은 출발이에요! 계속 가 볼까요? 🚀';
    if (ratio > 0) return '첫걸음을 뗐어요! 하나씩 해 나가요 🌱';
    return '시작이 반이에요! 첫 번째 할 일부터 해 볼까요? 💪';
  }

  /* ==========================================================
   * 15. 이벤트 바인딩 & 키보드 단축키
   * ========================================================== */

  /* ---------- 입력 폼 (한글 IME 대응) ----------
   * 한글 조합 중 Enter를 누르면 브라우저에 따라 조합이 끝나기 전에 submit이 발생해
   * 마지막 글자가 입력창에 남는 문제가 있다. 조합 중이면 조합이 끝난 뒤 제출한다. */
  let composing = false;
  let submitAfterComposition = false;

  dom.input.addEventListener('compositionstart', () => {
    composing = true;
  });
  dom.input.addEventListener('compositionend', () => {
    composing = false;
    if (submitAfterComposition) {
      submitAfterComposition = false;
      setTimeout(handleAdd, 0);
    }
  });

  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (composing) {
      submitAfterComposition = true;
      return;
    }
    handleAdd();
  });

  dom.input.addEventListener('input', () => {
    dom.input.removeAttribute('aria-invalid');
    if (!dom.input.value) {
      resetAutoCategory(); // 입력을 다 지우면 자동 분류 다시 활성화
      return;
    }
    scheduleClassify();
  });

  // 사용자가 직접 카테고리를 고르면 그 선택을 존중 (자동 분류 중지)
  dom.categorySelect.addEventListener('change', () => {
    categoryLocked = true;
    scheduleClassify.cancel();
    updateAutoCategory();
  });

  /* ---------- 목록: 이벤트 위임 ---------- */

  // 저장/취소 버튼은 pointerdown에서 처리:
  // click까지 기다리면 그 사이 focusout → 자동 저장이 먼저 실행되어 '취소'가 무시될 수 있음
  dom.list.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.edit-cancel')) {
      e.preventDefault();
      cancelEdit({ refocus: true });
      return;
    }
    if (e.target.closest('.edit-save')) {
      e.preventDefault();
      commitEdit({ refocus: true });
      return;
    }
    onDragStart(e);
  });

  dom.list.addEventListener('pointermove', onDragMove);
  dom.list.addEventListener('pointerup', (e) => {
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  });
  dom.list.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  });
  dom.list.addEventListener('lostpointercapture', (e) => {
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  });

  dom.list.addEventListener('click', (e) => {
    const item = e.target.closest('.todo-item');
    if (!item) return;
    const { id } = item.dataset;

    // 애니메이션 중 재클릭 방지 (체크박스의 기본 토글도 막음)
    if (item.classList.contains('is-animating')) {
      e.preventDefault();
      return;
    }

    if (e.target.closest('.todo-checkbox')) toggleTodo(id);
    else if (e.target.closest('.delete-btn')) deleteTodos([id]);
    else if (e.target.closest('.edit-btn')) startEdit(id);
    else if (e.target.closest('.edit-save')) commitEdit({ refocus: true }); // 키보드(Enter/Space)로 누른 경우
    else if (e.target.closest('.edit-cancel')) cancelEdit({ refocus: true });
  });

  // 텍스트 더블클릭 → 편집
  dom.list.addEventListener('dblclick', (e) => {
    const text = e.target.closest('.todo-text');
    if (!text) return;
    const item = text.closest('.todo-item');
    if (item) startEdit(item.dataset.id);
  });

  // 편집 중 카테고리를 바꾸면 테두리 색 미리보기
  dom.list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('edit-select')) return;
    const item = e.target.closest('.todo-item');
    if (item) item.dataset.category = e.target.value;
  });

  dom.list.addEventListener('keydown', (e) => {
    // 편집 중: Enter 저장 / Esc 취소
    if (editingId && e.target.closest('.todo-edit')) {
      // 한글 조합 중 Enter는 조합 확정용이므로 무시 (마지막 글자 잘림 방지)
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.target.closest('button')) {
        e.preventDefault();
        commitEdit({ refocus: true });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit({ refocus: true });
      }
      return;
    }

    // 드래그 핸들에 포커스: ↑/↓ 로 순서 이동
    if (e.target.classList.contains('drag-handle') && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      e.preventDefault();
      moveTodo(e.target.closest('.todo-item').dataset.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    // 텍스트 영역이 아닌 항목에서 F2 → 편집
    if (e.key === 'F2') {
      const item = e.target.closest('.todo-item');
      if (item) {
        e.preventDefault();
        startEdit(item.dataset.id);
      }
    }
  });

  // 편집 영역 밖으로 포커스가 나가면 자동 저장
  dom.list.addEventListener('focusout', (e) => {
    if (!editingId || isRendering) return;
    const editor = e.target.closest('.todo-edit');
    if (!editor) return;
    if (e.relatedTarget && editor.contains(e.relatedTarget)) return; // input ↔ select 이동

    const id = editingId;
    // 포커스 이동이 끝난 뒤 판단
    setTimeout(() => {
      if (editingId !== id) return;
      if (!document.hasFocus()) return; // 다른 창/탭으로 전환한 경우 편집 유지
      if (editor.isConnected && editor.contains(document.activeElement)) return;
      commitEdit({ refocus: false });
    }, 0);
  });

  /* ---------- 필터 / 검색 / 정렬 ---------- */

  dom.filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (btn) setFilter(btn.dataset.filter);
  });

  dom.search.addEventListener('input', () => {
    dom.searchClear.hidden = !dom.search.value;
    applySearch();
  });

  dom.search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dom.search.value) clearSearch();
      else dom.search.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      applySearch.flush();
    }
  });

  dom.searchClear.addEventListener('click', () => clearSearch());

  dom.sortSelect.addEventListener('change', () => setSort(dom.sortSelect.value));

  /* ---------- 하단 액션 / 기타 ---------- */

  dom.clearCompleted.addEventListener('click', clearCompleted);
  dom.exportBtn.addEventListener('click', () => exportData());
  dom.importBtn.addEventListener('click', () => dom.importFile.click());
  dom.importFile.addEventListener('change', async () => {
    const file = dom.importFile.files && dom.importFile.files[0];
    dom.importFile.value = ''; // 같은 파일을 다시 선택해도 change가 발생하도록
    try {
      await importFile(file);
    } catch (e) {
      console.error('[import]', e);
      toast('가져오는 중 알 수 없는 오류가 발생했습니다.', { type: 'error' });
    }
  });

  dom.themeToggle.addEventListener('click', toggleTheme);
  dom.quoteRefresh.addEventListener('click', randomQuote);

  // 다이얼로그 바깥(배경) 클릭 시 닫기
  dom.dialog.addEventListener('click', (e) => {
    if (e.target === dom.dialog) dom.dialog.close('cancel');
  });

  /* ---------- 키워드 설정 창 ---------- */

  dom.kwOpenBtn.addEventListener('click', openKeywordSettings);

  // 입력창 아래 안내 문구의 '키워드 설정' 바로가기
  dom.autoCategory.addEventListener('click', (e) => {
    if (e.target.closest('.kw-link')) openKeywordSettings();
  });

  dom.kwDone.addEventListener('click', closeKeywordSettings);
  dom.kwClose.addEventListener('click', closeKeywordSettings);
  dom.kwReset.addEventListener('click', handleKeywordReset);
  dom.kwTestInput.addEventListener('input', updateKeywordTest);

  // 배경 클릭 시 닫기
  dom.kwDialog.addEventListener('click', (e) => {
    if (e.target === dom.kwDialog) closeKeywordSettings();
  });

  // Esc: 기본 닫기 대신 같은 정리 경로 사용
  dom.kwDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeKeywordSettings();
  });

  // 혹시 다른 경로로 닫혀도 정리가 실행되도록 (중복 실행은 내부에서 방지)
  dom.kwDialog.addEventListener('close', onKeywordDialogClosed);

  /**
   * 창 닫기. 'close' 이벤트는 비동기로 전달되므로 기다리지 않고 바로 정리한다.
   */
  function closeKeywordSettings() {
    if (!dom.kwDialog.open) return;
    dom.kwDialog.close();
    onKeywordDialogClosed();
  }

  /** 닫힌 뒤 정리: 상태 타이머 해제 + 연 요소로 포커스 복귀 (한 번만) */
  function onKeywordDialogClosed() {
    if (kwCloseHandled) return;
    kwCloseHandled = true;
    clearTimeout(kwStatusTimer);
    // 연 요소가 사라졌거나(안내 문구 링크는 다시 그려짐) body인 경우(Safari는 클릭해도 버튼에 포커스가 안 감) 입력창으로
    const target =
      kwOpener && kwOpener.isConnected && kwOpener !== document.body && typeof kwOpener.focus === 'function'
        ? kwOpener
        : dom.input;
    kwOpener = null;
    target.focus();
  }

  dom.kwSections.addEventListener('click', (e) => {
    const remove = e.target.closest('.kw-remove');
    if (remove) handleKeywordRemove(remove);
  });

  // 키워드 추가 (한글 조합 중 Enter면 조합이 끝난 뒤 제출)
  dom.kwSections.addEventListener('compositionstart', () => {
    kwComposing = true;
  });
  dom.kwSections.addEventListener('compositionend', () => {
    kwComposing = false;
    if (kwPendingForm) {
      const form = kwPendingForm;
      kwPendingForm = null;
      setTimeout(() => handleKeywordSubmit(form), 0);
    }
  });
  dom.kwSections.addEventListener('submit', (e) => {
    const form = e.target.closest('.kw-add');
    if (!form) return;
    e.preventDefault();
    if (kwComposing) {
      kwPendingForm = form;
      return;
    }
    handleKeywordSubmit(form);
  });

  /* ---------- 전역 키보드 단축키 ----------
   * e.key 대신 e.code를 사용: 한글 자판 상태에서도 Alt+N이 'ㅜ'로 인식되지 않음 */
  const FILTER_SHORTCUTS = {
    Digit1: 'all', Digit2: 'work', Digit3: 'personal', Digit4: 'study',
    Numpad1: 'all', Numpad2: 'work', Numpad3: 'personal', Numpad4: 'study',
  };

  document.addEventListener('keydown', (e) => {
    if (dom.dialog.open || dom.kwDialog.open) return; // 모달이 열려 있으면 단축키 비활성

    // 드래그 중 Esc → 취소
    if (drag && e.key === 'Escape') {
      e.preventDefault();
      endDrag(true);
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      let handled = true;
      if (e.code === 'KeyN') {
        dom.input.focus();
        dom.input.select();
      } else if (e.code === 'KeyD') {
        toggleTheme();
      } else if (FILTER_SHORTCUTS[e.code]) {
        setFilter(FILTER_SHORTCUTS[e.code], { viaShortcut: true });
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const item = document.activeElement?.closest?.('.todo-item');
        if (item && !editingId) moveTodo(item.dataset.id, e.code === 'ArrowUp' ? -1 : 1);
        else handled = false;
      } else {
        handled = false;
      }
      if (handled) e.preventDefault();
      return;
    }

    // Ctrl/Cmd+Z: 입력창 밖에서만 앱 되돌리기 (입력창 안에서는 브라우저 기본 실행 취소)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && !isTextField(e.target)) {
      e.preventDefault();
      undoLast();
      return;
    }

    // '/' : 검색창으로
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextField(e.target)) {
      e.preventDefault();
      dom.search.focus();
      dom.search.select();
    }
  });

  /* ---------- 저장 보장 & 탭 간 동기화 ---------- */

  // 페이지를 떠나거나 백그라운드로 갈 때 대기 중인 저장을 즉시 실행
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  // 다른 탭에서 변경하면 이 탭에도 반영
  window.addEventListener('storage', (e) => {
    if (e.storageArea !== localStorage) return;

    if (e.key === STORAGE_KEYS.todos && e.newValue !== null) {
      let data;
      try {
        data = JSON.parse(e.newValue);
      } catch {
        return;
      }
      if (!Array.isArray(data)) return;

      scheduleSave.cancel(); // 이 탭의 대기 중인 저장이 덮어쓰지 않도록
      todos = sanitizeList(data).list;
      lastSavedJson = e.newValue;
      if (editingId && !findTodo(editingId)) editingId = null;
      render();
      toast('다른 탭에서 변경된 내용을 반영했습니다.');
    } else if (e.key === STORAGE_KEYS.theme && (e.newValue === 'dark' || e.newValue === 'light')) {
      applyTheme(e.newValue, { animate: true });
    } else if (e.key === STORAGE_KEYS.keywords) {
      // 다른 탭에서 키워드를 편집하거나 기본값으로 되돌린 경우
      let next = null;
      if (e.newValue === null) {
        next = cloneDefaultKeywords();
      } else {
        try {
          next = sanitizeKeywords(JSON.parse(e.newValue));
        } catch {
          return;
        }
      }
      categoryKeywords = next;
      keywordIndex = buildKeywordIndex(categoryKeywords);
      if (dom.kwDialog.open) {
        renderKeywordSections();
        setKwStatus('다른 탭에서 변경된 키워드를 반영했습니다.');
      }
      afterKeywordsChanged();
    }
  });

  // 사용자가 테마를 직접 고른 적이 없으면 OS 설정 변경을 따라감
  darkQuery?.addEventListener?.('change', (e) => {
    const saved = storage.get(STORAGE_KEYS.theme);
    if (saved !== 'dark' && saved !== 'light') applyTheme(e.matches ? 'dark' : 'light', { animate: true });
  });

  /* ==========================================================
   * 16. 초기화
   * ========================================================== */

  applyTheme(initialTheme());
  showQuote(dailyQuoteIndex());

  // 고정 영역 높이 추적 (ResizeObserver 미지원 브라우저는 창 크기 변경 때만)
  syncStickyHeadHeight();
  if (dom.mainHead && 'ResizeObserver' in window) {
    new ResizeObserver(syncStickyHeadHeight).observe(dom.mainHead);
  } else {
    window.addEventListener('resize', debounce(syncStickyHeadHeight, 150));
  }
  if (currentFilter !== 'all') dom.categorySelect.value = currentFilter;
  render();

  // 1분마다 "n분 전" 표시와 "오늘 추가" 개수 갱신 (자정 넘김 대응)
  setInterval(() => {
    dom.list.querySelectorAll('.todo-time').forEach((el) => {
      el.textContent = formatRelativeTime(el.dateTime);
    });
    renderStats();
  }, TIMING.clockTick);
})();
