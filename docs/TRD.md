# TRD — My Tasks (할 일 관리 웹 앱)

| 항목 | 내용 |
|---|---|
| 문서 종류 | 기술 요구사항 정의서 (Technical Requirements Document) |
| 버전 | 1.0 |
| 작성일 | 2026-11-11 |
| 관련 문서 | [PRD.md](./PRD.md) · [TASK.md](./TASK.md) |

---

## 1. 기술 개요

| 항목 | 선택 | 이유 |
|---|---|---|
| 언어 | HTML5, CSS3, JavaScript (ES2020, 바닐라) | 빌드 없이 파일만 열면 동작 |
| 프레임워크·라이브러리 | 없음 | 의존성·설치 없음, 작은 규모 |
| 저장소 | `window.localStorage` | 서버 없이 브라우저에 영구 저장 |
| 모달 | 네이티브 `<dialog>` + `showModal()` | 포커스 가두기·Esc 닫기 기본 제공 |
| 드래그 | Pointer Events 직접 구현 | HTML5 Drag & Drop API는 터치에서 동작하지 않음 |
| 레이아웃 | CSS Grid / Flexbox, `display: contents` | 하나의 HTML로 3단·1단 레이아웃 전환 |

### 1.1 파일 구성

```
C:\dev\todolist
├── index.html      (269줄)   마크업 · 테마 깜빡임 방지 인라인 스크립트
├── style.css       (2,135줄) 모바일 우선 기본 스타일 + 데스크톱 반응형 레이아웃
├── script.js       (2,705줄) 앱 전체 로직 (IIFE 하나)
├── docs/           PRD.md · TRD.md · TASK.md
└── mobile_backup/  통합 이전의 모바일 전용 버전 백업 (사용하지 않음)
```

> `web_version/` 폴더와 `desktop.css`는 루트에 통합한 뒤 삭제했다.

---

## 2. 데이터 설계

### 2.1 할 일 (Todo)

```ts
type Category = 'work' | 'personal' | 'study';

interface Todo {
  id: string;          // crypto.randomUUID(), 미지원 시 시간+난수 기반
  text: string;        // 공백 정규화, 1~200자
  completed: boolean;
  createdAt: string;   // ISO 8601 (Date.toISOString)
  category: Category;
}
```

- `todos` 배열의 **순서 자체가 "직접 정렬" 순서**다. 다른 정렬은 화면에 보여 줄 때만 복사본을 정렬하므로 원본 순서가 보존된다.

### 2.2 localStorage 키

| 키 | 값 | 비고 |
|---|---|---|
| `todos` | `Todo[]` JSON | 디바운스 300ms 저장, 페이지 이탈 시 즉시 저장 |
| `todoFilter` | `'all' \| Category` | |
| `todoSort` | `'status' \| 'created' \| 'category' \| 'manual'` | 기본값 `status` |
| `todoTheme` | `'light' \| 'dark'` | 없으면 OS 설정을 따름 |
| `todoKeywords` | `{ work: string[], personal: string[], study: string[] }` | 기본값으로 되돌리면 키 자체를 삭제 |
| `todos_corrupt_backup` | 원본 문자열 | `todos`를 해석할 수 없을 때 버리기 전에 보관 |

### 2.3 내보내기 파일 형식

```json
{
  "app": "my-tasks",
  "version": 1,
  "exportedAt": "2026-11-11T06:00:00.000Z",
  "count": 5,
  "todos": [ /* Todo[] */ ]
}
```
가져오기는 위 형식과 `Todo[]` 배열 그대로, 두 형식을 모두 받는다.

### 2.4 데이터 검증 — `sanitizeTodo()`
저장소에서 읽은 데이터, 가져오기 파일, 다른 탭에서 온 데이터는 모두 이 함수를 거친다.

| 필드 | 검증·보정 |
|---|---|
| `text` | 문자열이 아니거나 비면 항목 제외. 공백 정규화 후 200자로 자름 |
| `id` | 문자열·유한한 숫자만 허용. 비었거나 중복이면 새로 생성 |
| `createdAt` | 해석할 수 없으면 현재 시각 |
| `completed` | `=== true`일 때만 true |
| `category` | 잘못되었거나 없으면 **키워드 자동 분류**, 그래도 없으면 `personal` |

---

## 3. 코드 구조 (`script.js`)

전역 오염을 막기 위해 전체를 즉시 실행 함수(IIFE)로 감싸고 `'use strict'`를 적용한다.

| 섹션 | 위치 | 내용 |
|---|---|---|
| 1. 설정 상수 | `script.js:35` | 저장 키, 카테고리, 제한값, `TIMING`, 기본 키워드, 격언 |
| 2. DOM 참조 | `script.js:131` | `dom` 객체에 요소 캐시 |
| 3. 범용 유틸 | `script.js:211` | `debounce`(flush/cancel), 텍스트 정규화, 상대 시간, 애니메이션 헬퍼 |
| 4. 저장소 | `script.js:359` | `storage` 래퍼, 검증, 로드/저장, 키워드 로드·색인 |
| 5. 앱 상태 | `script.js:577` | `todos`, 필터, 정렬, 검색어, 편집 id, 렌더 캐시, 되돌리기 스택 |
| 6. 피드백 UI | `script.js:609` | `toast()`, `announce()`, `showDialog()` |
| 7. 테마 | `script.js:770` | `currentTheme` / `initialTheme` / `applyTheme` / `toggleTheme` |
| 8. 자동 분류 | `script.js:816` | `scoreCategories` / `classifyText`, 키워드 설정 창 |
| 9. 렌더링 | `script.js:1204` | 대시보드, 필터, 키 기반 목록 재조정 |
| 10. 할 일 조작 | `script.js:1563` | 추가·토글·삭제·되돌리기·인라인 편집 |
| 11. 정렬·드래그 | `script.js:1890` | 정렬, 순서 반영, 포인터 드래그, 고정 영역 높이 |
| 12. 검색·필터 | `script.js:2078` | |
| 13. 내보내기·가져오기 | `script.js:2115` | |
| 14. 격언·응원 | `script.js:2244` | |
| 15. 이벤트 | `script.js:2285` | 이벤트 위임, 전역 단축키, 탭 동기화 |
| 16. 초기화 | `script.js:2682` | |

> **초기화 순서 주의**: `loadTodos()`가 카테고리 없는 데이터를 분류할 때 키워드 색인을 쓰므로, 키워드 로드(4번 섹션 끝)가 상태 초기화(5번)보다 먼저 와야 한다. 이 순서가 바뀌면 TDZ 오류가 발생한다(개발 중 실제로 발생해 수정함).

### 3.1 주요 상수

| 상수 | 값 |
|---|---|
| `MAX_TEXT_LENGTH` | 200 |
| `MAX_IMPORT_BYTES` | 5MB |
| `UNDO_LIMIT` | 20 |
| `MAX_TOASTS` | 3 |
| `MAX_KEYWORD_LENGTH` | 30 |
| `MAX_KEYWORDS_PER_CATEGORY` | 200 |
| `TIMING.saveDebounce / searchDebounce / classifyDebounce` | 300 / 200 / 150 ms |
| `TIMING.toast / undoToast` | 3000 / 6000 ms |
| `TIMING.animFallback` | 600 ms |
| `TIMING.clockTick` | 60000 ms |

---

## 4. 핵심 구현 설계

### 4.1 렌더링 — 키 기반 재조정
`innerHTML`로 목록을 통째로 다시 그리지 않고 `elementCache: Map<id, {el, sig}>`로 DOM을 재사용한다.

1. 항목 서명 `sig` = `text | completed | category | 편집 중 여부 | 검색어`
2. 서명이 같으면 기존 요소를 재사용하고, 다르면 새로 만들어 `replaceWith`
3. 커서를 하나 두고 순서가 다른 요소만 `insertBefore`로 이동
4. 커서 뒤에 남은 요소(더 이상 보이지 않는 항목)만 제거

- 렌더링 전후로 **포커스 위치(항목 id + 버튼 종류)를 기억하고 복원**한다. 요소를 옮기거나 교체해도 키보드 포커스를 잃지 않는다.
- 상대 시간은 1분마다 `.todo-time` 텍스트만 갱신한다(재렌더 없음).
- 대시보드(`renderStats`)는 필터와 무관하게 전체 데이터를 한 번 순회해 계산한다.

### 4.2 애니메이션
| 상황 | 처리 |
|---|---|
| 추가 | `pendingEnter`에 `fade-in` 등록 → 다음 렌더 때 적용 |
| 삭제 | 상태·대시보드를 먼저 갱신 → `fade-out` 재생 → 목록 정리 |
| 완료 토글 | 대시보드 즉시 갱신 → `slide-out` → 재배치 → `slide-in` |
| 진행률 바 | CSS `transition: width 0.6s` |

- `playAnimation()`은 `animationend`를 기다리되, 이벤트가 오지 않는 경우를 대비해 600ms 타임아웃으로도 끝낸다.
- 애니메이션 중인 항목(`.is-animating`)은 클릭을 막는다(체크박스 기본 토글 포함).
- `prefers-reduced-motion`이면 지속 시간을 0이 아닌 0.01ms로 줄인다. `animationend`가 계속 발생해야 하기 때문이다.

### 4.3 인라인 편집
- `editingId`가 있으면 해당 항목을 편집 UI(select + input + ✓/✕)로 렌더링한다.
- **저장 시점**: Enter, ✓ 버튼, 편집 영역 밖으로 포커스 이동(`focusout` → `setTimeout 0` 후 판단). 창 전환(`!document.hasFocus()`)일 때는 저장하지 않고 편집을 유지한다.
- ✓/✕ 버튼은 `pointerdown`에서 처리한다. `click`까지 기다리면 그 사이 `focusout` 자동 저장이 먼저 실행되어 "취소"가 무시되기 때문이다.
- 렌더링 중 발생하는 `focusout`은 `isRendering` 플래그로 무시한다.

### 4.4 되돌리기
- `undoStack`(최대 20개)에 `{ message, restore() }`를 쌓는다.
- 삭제: 원래 인덱스를 기록하고, 인덱스 오름차순으로 다시 끼워 넣어 원래 순서를 정확히 복원한다. 이미 있는 id는 건너뛴다.
- 가져오기: 이전 배열 스냅샷으로 복원한다.
- 알림의 "실행 취소" 버튼은 **자기 작업만** 되돌린다(스택 맨 위가 아닐 수 있음).

### 4.5 드래그 앤 드롭 (Pointer Events)
- 포인터 캡처는 항목이 아니라 **목록(`ul`)**에 건다. 항목을 DOM에서 옮겨도 캡처가 풀리지 않게 하기 위해서다.
- 5px 이상 움직여야 드래그로 판단한다(클릭과 구분).
- 끌고 있는 항목의 중심이 이웃 항목 중앙을 넘으면 자리를 바꾸고, `transform`으로 포인터를 따라가게 보정한다.
- **자동 스크롤**: 위쪽 기준 = 고정된 검색·입력 영역의 아래 끝 + 60px, 아래쪽 기준 = 화면 아래 60px.
- 드래그 중에는 `html.is-dragging-todo { overflow-anchor: none }`으로 **스크롤 앵커링을 끈다**. 끄지 않으면 순서가 바뀔 때 브라우저의 스크롤 보정이 자동 스크롤과 반대로 움직인다.
- 드롭하면 `applyVisibleOrder()`가 보이는 항목의 새 순서를 원본 배열의 "같은 자리들"에만 채워 넣는다. 필터·검색으로 숨겨진 항목의 위치는 그대로 둔다.
- 키보드: 핸들에서 ↑/↓, 어디서든 Alt+↑/↓. 직접 정렬 모드가 아니면 전환 버튼이 있는 안내를 띄운다.

### 4.6 키워드 자동 분류
```
점수(카테고리) = Σ (텍스트에 포함된 키워드의 길이)     // 공백 제거·소문자 비교
결과 = 최고 점수 카테고리 (0점이거나 1·2위 동점이면 null)
```
- 긴 키워드일수록 구체적이므로 가중치를 높게 준다.
- 기본 키워드: 업무 46 / 개인 45 / 공부 41개. 오분류를 줄이려고 "집", "책", "보고"처럼 짧고 흔한 단어는 뺐다.
- 입력 중 150ms 디바운스로 분류한다. 사용자가 드롭다운을 직접 바꾸면 `categoryLocked`로 멈추고, 추가하거나 입력을 비우면 다시 켠다.
- 키워드 설정 창의 변경은 즉시 `todoKeywords`에 저장되고 색인(`keywordIndex`)을 다시 계산한다.
- 같은 키워드를 여러 카테고리에 두지 못하게 막는다.

### 4.7 테마
1. `index.html`의 `<head>` 인라인 스크립트가 CSS보다 먼저 `data-theme`을 설정한다(깜빡임 방지).
2. `applyTheme(theme, { animate, persist })`
   - `animate`: 0.4초 동안만 `.theme-transition` 클래스로 색상 트랜지션을 일괄 적용한다(평소 호버 트랜지션과 충돌 방지).
   - `persist`: 사용자가 직접 바꿀 때만 저장한다(OS 설정 추종과 구분).
3. 저장된 값이 없으면 `prefers-color-scheme` 변경을 따라간다.
4. CSS는 `:root`(라이트)와 `:root[data-theme="dark"]` 두 벌의 변수로 구성하고, `color-scheme`도 함께 바꿔 기본 폼 컨트롤까지 어둡게 한다.

### 4.8 한글 IME 처리
- 입력 폼: `compositionstart/end`로 조합 상태를 추적한다. 조합 중 제출되면 `compositionend` 이후로 미룬다.
- 편집·키워드 입력 Enter: `e.isComposing || e.keyCode === 229`이면 무시한다.
- 단축키는 `e.key` 대신 `e.code`(물리 키)로 판별한다. 한글 자판에서 Alt+N이 'ㅜ'로 인식되는 문제를 피하기 위해서다.

---

## 5. 반응형 레이아웃 설계 (`style.css`)

모바일 우선으로 기본 스타일을 작성하고, 파일 끝부분의 반응형 블록이 덮어쓴다.

| 구간 | 레이아웃 |
|---|---|
| `≤ 480px` | 카드 여백 제거·전체 폭, 필터 가로 스크롤, 입력창 위·버튼 아래 줄 배치, 설정 창은 아래에서 올라오는 시트 |
| `< 960px` | `.sidebar` / `.main` / `.main-head` / `.insights`를 `display: contents`로 풀고 `order`로 1단 순서 지정 (최대 폭 600px 카드) |
| `≥ 960px` | `grid-template-columns: var(--sidebar-w) minmax(0,1fr) var(--insights-w)` 3단. 좌우 패널 `position: sticky; height: 100vh`, `.main-head` sticky |
| `960 ~ 1279px` | 패널 폭 축소: 사이드바 `clamp(200px, 18vw, 230px)`, 진행 현황 `clamp(250px, 22vw, 280px)`. 태그·시간은 아래 줄 |
| `≥ 1280px` | 사이드바 `clamp(240px, 19vw, 300px)`, 진행 현황 `clamp(300px, 24vw, 380px)`. 태그·시간을 같은 줄 오른쪽에 |
| `≥ 1600px` | 목록 최대 폭 1080 → 1180px |
| `pointer: coarse` | `--tap: 44px`, 체크박스 24px |
| `hover: none` | 항목 버튼 항상 표시 |

설계 메모는 다음과 같다.
- **기준을 960px로 정한 이유**: 1024px 창의 실제 화면 폭은 약 1000px이다. 125~150%로 확대한 노트북도 3단이 나오게 하려고 1024 대신 960을 쓴다.
- **목록은 페이지 스크롤을 쓴다**: 패널 안 스크롤이 아니라 페이지 스크롤이라서, 드래그 자동 스크롤(`window.scrollBy`)과 호환된다.
- **고정 영역 높이 반영**: `ResizeObserver`가 `.main-head` 높이를 재서 `--sticky-head-h`에 넣는다. 이 값으로 `scroll-padding-top: calc(var(--sticky-head-h) + 16px)`를 주어, Tab 이동이나 `scrollIntoView` 때 항목이 고정 영역 뒤에 가려지지 않는다.
- **색상은 CSS 변수로 관리**: 카테고리 색은 고정값을 쓰고, 작은 글자용으로 대비를 높인 `--cat-*-text` 변수를 따로 둔다.

---

## 6. 접근성

| 항목 | 구현 |
|---|---|
| 레이블 | 아이콘 버튼·체크박스에 항목 내용을 포함한 `aria-label` (예: `"보고서 작성" 삭제`) |
| 상태 알림 | 화면에 보이지 않는 `#sr-live`(aria-live polite)로 추가·완료·필터·정렬·검색 결과 수를 알림. 토스트 컨테이너도 aria-live |
| 진행률 | `role="progressbar"` + `aria-valuenow` / `aria-valuetext` |
| 테마 토글 | `role="switch"` + `aria-checked` |
| 필터 | `aria-pressed`, `aria-keyshortcuts` |
| 포커스 | 렌더 전후 포커스 복원. 삭제 시 다음(없으면 이전) 항목으로, 편집 종료 시 ✎ 버튼으로, 창을 닫으면 연 요소로(사라졌거나 `<body>`면 입력창으로) |
| 키보드 | 모든 기능 키보드로 가능, 건너뛰기 링크, `:focus-visible` 테두리 |
| 모달 | `<dialog>`로 포커스 가두기. 모달이 열려 있으면 전역 단축키 비활성 |

---

## 7. 오류 처리

| 상황 | 처리 |
|---|---|
| localStorage 접근 불가 (사생활 보호 모드 등) | 예외를 잡고 "새로고침하면 데이터가 사라질 수 있음" 안내(한 번만) |
| 저장 공간 초과 (`QuotaExceededError`) | 내보낸 뒤 정리하라고 안내 |
| `todos` JSON 손상 | `todos_corrupt_backup`에 원본을 보관하고 빈 목록으로 시작 |
| 일부 항목 손상 | 해당 항목만 제외하고 개수 안내 |
| 키워드 설정 손상 | 기본 키워드 사용 |
| 가져오기: 빈 파일, 5MB 초과, 읽기 실패, JSON 아님, 할 일 없음 | 각각 구체적인 오류 메시지로 안내하고 중단 |
| 가져오기 전 백업 실패 | 가져오기 중단 |
| 되돌리기 중 예외 | 오류 안내, 상태 유지 |
| `<dialog>` 미지원 | `window.confirm`으로 대체 |
| `crypto.randomUUID` 미지원 | 시간 + 난수 기반 id |
| 다른 탭과 동시 수정 | `storage` 이벤트로 최신 값을 반영하고, 이 탭에서 대기 중이던 저장은 취소(나중에 쓴 쪽이 우선) |

---

## 8. 성능

- **DOM**: 키 기반 재조정으로 바뀐 항목만 갱신한다. 이벤트는 목록·필터·설정 창 단위로 위임한다(항목마다 리스너를 달지 않음).
- **디바운싱**: 저장 300ms, 검색 200ms, 자동 분류 150ms. 페이지 이탈(`pagehide`)·숨김(`visibilitychange`) 때는 즉시 저장한다.
- **불필요한 쓰기 방지**: 마지막으로 저장한 JSON과 같으면 쓰지 않는다.
- **분류**: 키워드 비교용 키(공백 제거·소문자)를 미리 계산해 둔다.

---

## 9. 테스트 방법

자동 테스트는 헤드리스 Microsoft Edge(`--headless=new --dump-dom`)로 실행했다.
1. 테스트용 HTML이 localStorage에 데이터를 미리 넣는다.
2. 앱 스크립트를 실행한 뒤 테스트 스크립트를 실행한다.
3. 결과를 `<pre id="test-out">`에 기록한다.
4. `window.onerror`로 런타임 오류를 수집한다.

| 테스트 | 항목 수 | 주요 확인 내용 |
|---|---|---|
| 핵심 기능 | 26 | 예전 데이터 자동 분류, 자동 분류, 추가, 중복 확인 창, 토글·정렬, 배지, 삭제·Ctrl+Z, 편집, Alt+2 필터, 검색 하이라이트, Alt+D, 직접 정렬 이동, 저장 구조 |
| 키워드 설정 | 24 | 안내 링크로 열기, 분류 테스트, 추가·중복(같은·다른 카테고리)·빈 값·한 글자 경고, 삭제·되돌리기, 동점, 모달 중 단축키 차단, 저장, 닫힘 후 포커스, 쌓인 확인 창으로 기본값 복원 |
| 고정 영역·드래그 | 1440·1024px 창 | `--sticky-head-h` 측정, `scroll-padding-top`, 포커스 시 가려지지 않음, 드래그 자동 스크롤 방향 |
| 레이아웃 | 스크린샷 | 960 / 984 / 1024 / 1100 / 1280 / 1440 / 1920 / 2560px, 라이트·다크 |

헤드리스 환경의 한계는 다음과 같다.
- 창 폭을 약 492px보다 좁게 만들 수 없어 480px 이하 화면은 확인하지 못했다.
- 이벤트를 코드로 발생시키므로 실제 마우스·터치 드래그와 한글 입력기 동작은 실제 기기에서 확인해야 한다.
- 가상 시간 환경에서는 `<dialog>`의 `close` 이벤트가 늦게 올 수 있다. 그래서 앱은 이 이벤트에 의존하지 않고 닫을 때 바로 정리한다.

---

## 10. 알려진 제약

- `Alt+D`는 Edge/Chrome에서 주소창 이동 단축키라 브라우저가 먼저 가져갈 수 있다(실제 브라우저에서 미확인).
- 가져오기는 현재 데이터를 **대체**한다(합치기 미지원).
- 키워드 설정은 내보내기 파일에 포함되지 않는다.
- 직접 정렬 모드에서는 완료 항목이 아래로 자동 이동하지 않는다.
- localStorage는 브라우저·기기별이라 기기 간 동기화가 없다.
- 아주 넓은 화면에서도 목록은 1열이다(최대 1180px).
