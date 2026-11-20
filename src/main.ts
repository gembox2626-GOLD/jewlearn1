import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { lessonMeta, weekPlans } from './lesson-data';
import './style.css';

type Lesson = { id: string; title: string; body: string; phase: number };
type Reference = { group: string; title: string; url: string };
type Progress = { completed: string[]; lastLesson: string };
type View = 'home' | 'lesson' | 'tools' | 'plan' | 'references';

const PHASES: Record<number, { title: string; short: string; description: string; icon: string }> = {
  1: { title: 'استكشف المهنة', short: 'البداية', description: 'تعرف على الناس والأخلاق والجذور التي صنعت المهنة.', icon: '١' },
  2: { title: 'تعلّم المهنة', short: 'المعرفة', description: 'افهم المعدن والعيار والحجر والسوق بعين مهنية.', icon: '٢' },
  3: { title: 'مارس المهنة', short: 'التطبيق', description: 'حوّل المعرفة إلى خدمة وقرارات تشغيل يومية.', icon: '٣' },
};
const md = new Marked({ gfm: true, breaks: true });
const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Missing app root');
const root: HTMLElement = appRoot;

let lessons: Lesson[] = [];
let references: Reference[] = [];
let progress: Progress = readProgress();
let currentView: View = 'home';
let currentLessonId = progress.lastLesson;
let labUnmount: (() => void) | null = null;
let preferredDevice: 'xrf' | 'scale' = 'xrf';
let searchTerm = '';
let quizAnswer: number | null = null;
let quizRevealed = false;
type AudioAsset = { audio: string; transcript: string };
let audioAssets: Record<string, AudioAsset> = {};

function readProgress(): Progress {
  try {
    const raw = localStorage.getItem('masar-jewlearn-v1');
    if (!raw) return { completed: [], lastLesson: '' };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { completed: Array.isArray(parsed.completed) ? parsed.completed : [], lastLesson: typeof parsed.lastLesson === 'string' ? parsed.lastLesson : '' };
  } catch {
    return { completed: [], lastLesson: '' };
  }
}

function saveProgress() {
  try { localStorage.setItem('masar-jewlearn-v1', JSON.stringify(progress)); } catch { /* Private browsing may disable local storage. */ }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function renderAudio(lessonId: string): string {
  const asset = audioAssets[lessonId];
  if (!asset) return '';
  return `<section class="lesson-audio" aria-label="التعليق الصوتي للدرس">
    <div class="lesson-audio-heading"><span class="lesson-audio-icon" aria-hidden="true">♫</span><div><span class="eyebrow">اسمع الشرح</span><strong>شرح الدرس بالعامية المصرية</strong><small>راوي مصري · النص مكتوب للمراجعة</small></div></div>
    <audio controls preload="metadata" src="${escapeHtml(asset.audio)}" aria-label="شرح صوتي باللهجة المصرية">متصفحك لا يدعم تشغيل الصوت. <a href="${escapeHtml(asset.audio)}">افتح الملف الصوتي</a></audio>
    <details class="audio-transcript" data-transcript="${escapeHtml(asset.transcript)}"><summary>اقرأ نص التعليق الصوتي</summary><div class="audio-transcript-content" aria-live="polite">افتح القسم لتحميل النص المكتوب.</div></details>
  </section>`;
}

function parseLessons(markdown: string): Lesson[] {
  const beforeReferences = markdown.split('## المراجع المجمعة')[0] ?? markdown;
  const result: Lesson[] = [];
  let current: Lesson | null = null;
  for (const line of beforeReferences.split('\n')) {
    const heading = line.match(/^### (\d+\.\d+)\s+(.+)$/);
    if (heading) {
      if (current) result.push(current);
      current = { id: heading[1] ?? '', title: heading[2] ?? '', body: '', phase: Number((heading[1] ?? '0').split('.')[0]) };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) result.push(current);
  return result;
}

function parseReferences(markdown: string): Reference[] {
  const start = markdown.indexOf('## المراجع المجمعة');
  if (start < 0) return [];
  const result: Reference[] = [];
  let group = 'مراجع الدبلومة';
  for (const line of markdown.slice(start).split('\n')) {
    const heading = line.match(/^### (.+)$/);
    if (heading) { group = heading[1] ?? group; continue; }
    const item = line.match(/^- (.*?)\s*:\s*(https?:\/\/\S+)\s*$/);
    if (!item) continue;
    const title = item[1]?.trim() ?? '';
    const rawUrl = item[2] ?? '';
    try {
      const url = new URL(rawUrl);
      if (url.protocol === 'https:') result.push({ group, title, url: url.href });
    } catch { /* Ignore malformed source links rather than render unsafe URLs. */ }
  }
  return result;
}

function percentDone(): number {
  return lessons.length ? Math.round(progress.completed.filter((id) => lessons.some((lesson) => lesson.id === id)).length / lessons.length * 100) : 0;
}

function icon(name: string): string {
  const icons: Record<string, string> = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a5 5 0 0 0-6.6 6.6l-4.8 4.8a2 2 0 0 0 2.8 2.8l4.8-4.8a5 5 0 0 0 6.6-6.6l-3 3-3.3-3.3z"/></svg>',
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4m8-4v4M3 9h18m-14 4h2m4 0h2m-8 4h2"/></svg>',
    refs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5zm0 0v17M9 6h7m-7 4h7"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  };
  return icons[name] ?? '';
}

function shell(): string {
  return `
    <div class="app-shell">
      <button class="mobile-scrim" data-action="close-menu" aria-label="إغلاق القائمة" tabindex="-1"></button>
      <aside class="sidebar" id="sidebar" aria-label="التنقل في الدبلومة">
        <a class="brand" href="#home" data-view="home" aria-label="مرسم الصائغ، الرئيسية">
          <span class="brand-mark"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m24 3 18 15-18 27L6 18z"/><path d="m6 18 18 5 18-5M24 3v20"/></svg></span>
          <span class="brand-type"><strong>مرسم الصائغ</strong><small>دبلومة المهنة · نسخة تفاعلية</small></span>
        </a>
        <div class="sidebar-progress">
          <div class="progress-ring" id="progress-ring"><span id="progress-number">٠٪</span></div>
          <div><strong>رحلتك التعليمية</strong><p id="progress-copy">لسه ما بدأتش. كل درس خطوة.</p></div>
        </div>
        <nav class="primary-nav" aria-label="القائمة الرئيسية">
          <button type="button" data-view="home" class="primary-link is-active">${icon('home')}<span>لوحة الرحلة</span></button>
          <button type="button" data-view="tools" class="primary-link">${icon('tools')}<span>مختبر الأجهزة</span><i class="nav-new">3D</i></button>
          <button type="button" data-view="plan" class="primary-link">${icon('plan')}<span>خطة ٤ أسابيع</span></button>
          <button type="button" data-view="references" class="primary-link">${icon('refs')}<span>مكتبة المراجع</span></button>
        </nav>
        <div class="curriculum-heading"><div><span class="eyebrow">محتوى الدبلومة</span><strong>المسار التعليمي</strong></div><span class="topic-total" id="topic-total">١٦ درس</span></div>
        <label class="search-box"><span class="search-icon">⌕</span><input id="lesson-search" type="search" placeholder="ابحث في الدروس…" autocomplete="off" aria-label="ابحث في الدروس"><kbd>/</kbd></label>
        <div class="curriculum-list" id="topic-nav"></div>
        <div class="sidebar-foot"><span class="foot-dot"></span><span>تعلم على مهل. الدقة أهم من السرعة.</span></div>
      </aside>
      <div class="main-column">
        <header class="topbar">
          <div class="topbar-start"><button class="mobile-menu-button" data-action="open-menu" aria-label="فتح القائمة"><span></span><span></span></button><div class="crumbs"><span>الدبلومة</span><i>/</i><strong id="top-context">لوحة الرحلة</strong></div></div>
          <div class="topbar-end"><span class="live-progress"><i></i><span id="top-progress">٠ من ١٦ درس</span></span><button type="button" class="top-continue" data-action="continue">تابع التعلّم ${icon('arrow')}</button></div>
        </header>
        <main id="view" class="page-view" tabindex="-1"></main>
        <footer class="site-footer"><span>مرسم الصائغ</span><span>مادة تعليمية — تحقّق من الإجراء الساري في بلدك</span></footer>
      </div>
    </div>`;
}

function renderSidebar() {
  const nav = document.querySelector<HTMLElement>('#topic-nav');
  if (!nav) return;
  const matching = lessons.filter((lesson) => `${lesson.id} ${lesson.title} ${lesson.body}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const stageMarkup = [1, 2, 3].map((phase) => {
    const phaseLessons = matching.filter((lesson) => lesson.phase === phase);
    const countAll = lessons.filter((lesson) => lesson.phase === phase).length;
    if (!phaseLessons.length && searchTerm) return '';
    const open = searchTerm || (currentLessonId && phase === Number(currentLessonId.split('.')[0])) || (!currentLessonId && phase === 1);
    return `<details class="phase-group" ${open ? 'open' : ''}><summary><span class="phase-index">${PHASES[phase]?.icon ?? ''}</span><span class="phase-summary"><strong>${PHASES[phase]?.title ?? ''}</strong><small>${countAll} دروس</small></span><span class="phase-chevron">⌄</span></summary><div class="phase-lessons">${phaseLessons.map((lesson) => `<button type="button" class="lesson-link ${currentView === 'lesson' && currentLessonId === lesson.id ? 'is-active' : ''}" data-topic="${lesson.id}"><span class="lesson-state ${progress.completed.includes(lesson.id) ? 'is-done' : ''}">${progress.completed.includes(lesson.id) ? icon('check') : `<span>${lesson.id.split('.')[1]}</span>`}</span><span class="lesson-link-text">${escapeHtml(lesson.title)}</span></button>`).join('')}</div></details>`;
  }).join('');
  nav.innerHTML = stageMarkup || `<div class="search-empty">مفيش درس مطابق. جرّب كلمة تانية.</div>`;
  const percent = percentDone();
  const progressNumber = document.querySelector<HTMLElement>('#progress-number');
  const progressRing = document.querySelector<HTMLElement>('#progress-ring');
  const progressCopy = document.querySelector<HTMLElement>('#progress-copy');
  const topProgress = document.querySelector<HTMLElement>('#top-progress');
  const topicTotal = document.querySelector<HTMLElement>('#topic-total');
  if (progressNumber) progressNumber.textContent = `${percent.toLocaleString('ar-EG')}٪`;
  if (progressRing) progressRing.style.setProperty('--progress', `${percent}%`);
  if (progressCopy) progressCopy.textContent = progress.completed.length ? `أنهيت ${progress.completed.length.toLocaleString('ar-EG')} من ${lessons.length.toLocaleString('ar-EG')} درس.` : 'لسه ما بدأتش. كل درس خطوة.';
  if (topProgress) topProgress.textContent = `${progress.completed.length.toLocaleString('ar-EG')} من ${lessons.length.toLocaleString('ar-EG')} درس`;
  if (topicTotal) topicTotal.textContent = `${lessons.length.toLocaleString('ar-EG')} درس`;
  document.querySelectorAll<HTMLButtonElement>('.primary-link').forEach((button) => button.classList.toggle('is-active', button.dataset.view === currentView && currentView !== 'lesson'));
}

function go(view: View, lessonId?: string) {
  currentView = view;
  if (lessonId) {
    currentLessonId = lessonId;
    progress.lastLesson = lessonId;
    saveProgress();
  }
  quizAnswer = null;
  quizRevealed = false;
  labUnmount?.();
  labUnmount = null;
  renderSidebar();
  renderView();
  document.querySelector('#top-context')!.textContent = currentView === 'lesson' ? (lessons.find((lesson) => lesson.id === currentLessonId)?.title ?? 'الدرس') : ({ home: 'لوحة الرحلة', tools: 'مختبر الأجهزة', plan: 'خطة المذاكرة', references: 'مكتبة المراجع' }[currentView] ?? 'الدبلومة');
  document.body.classList.remove('menu-open');
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function topicButtonText(lesson: Lesson): string {
  return `${lesson.id} ${lesson.title}`;
}

function renderHome(): string {
  const done = progress.completed.length;
  const next = lessons.find((lesson) => !progress.completed.includes(lesson.id)) ?? lessons[0];
  const resume = lessons.find((lesson) => lesson.id === progress.lastLesson) ?? next;
  const phaseCards = [1, 2, 3].map((phase) => {
    const items = lessons.filter((lesson) => lesson.phase === phase);
    const completed = items.filter((lesson) => progress.completed.includes(lesson.id)).length;
    return `<button class="journey-card phase-card phase-${phase}" type="button" data-topic="${items[0]?.id ?? ''}"><span class="journey-card-top"><span class="journey-num">${PHASES[phase]?.icon}</span><span class="journey-count">${completed.toLocaleString('ar-EG')} / ${items.length.toLocaleString('ar-EG')} دروس</span></span><strong>${PHASES[phase]?.title}</strong><p>${PHASES[phase]?.description}</p><span class="card-arrow">${icon('arrow')}</span></button>`;
  }).join('');
  const recentLesson = resume ? `<div class="resume-card"><div class="resume-icon">${progress.completed.includes(resume.id) ? '✓' : '↗'}</div><div class="resume-copy"><span class="eyebrow">${progress.lastLesson ? 'آخر مكان وقفت عنده' : 'الخطوة المقترحة'}</span><strong>${escapeHtml(topicButtonText(resume))}</strong><small>${PHASES[resume.phase]?.title ?? ''} · حوالي ٨–١٢ دقيقة</small></div><button type="button" data-topic="${resume.id}" class="button button-dark">${progress.lastLesson ? 'كمّل' : 'ابدأ'} ${icon('arrow')}</button></div>` : '';

  return `<section class="home-view">
    <div class="hero-panel">
      <div class="hero-copy"><div class="hero-kicker"><span class="kicker-line"></span> تعلّم المهنة من جوّه السوق</div><h1>من أول وزن…<br><em>لآخر قرار بيع.</em></h1><p>دبلومة الجواهرجي بقت رحلة تفاعلية: افهم المعدن، جرّب الفحص، واتدرّب على مواقف المحل خطوة بخطوة.</p><div class="hero-actions"><button type="button" class="button button-gold" data-topic="${(resume ?? lessons[0])?.id ?? ''}">${progress.lastLesson ? 'ارجع لدرسك' : 'ابدأ أول درس'} ${icon('arrow')}</button><button type="button" class="button button-quiet" data-view="tools"><span class="play-dot">▸</span> افتح المختبر ثلاثي الأبعاد</button></div><div class="hero-proof"><span><b>١٦</b> محور عملي</span><i></i><span><b>٤</b> أسابيع مذاكرة</span><i></i><span><b>٢</b> أجهزة تفاعلية</span></div></div>
      <div class="hero-art"><div class="hero-art-glow"></div><div class="hero-art-orbit orbit-a"></div><div class="hero-art-orbit orbit-b"></div><div class="hero-art-gem"><svg viewBox="0 0 240 280" aria-hidden="true"><path d="M120 12 216 78 120 265 24 78Z" fill="#e0c37e"/><path d="M24 78h192l-96 187z" fill="#b88a39"/><path d="M120 12 24 78l96 25z" fill="#f1e1b9"/><path d="m120 12 96 66-96 25z" fill="#d7b568"/><path d="m24 78 96 187V103z" fill="#d4ae5d"/><path d="m216 78-96 187V103z" fill="#9e742d"/><path d="M24 78h192M120 12v253M24 78l96 25 96-25" fill="none" stroke="#fff5d8" stroke-opacity=".65" stroke-width="3"/></svg></div><div class="hero-art-glint glint-one"></div><div class="hero-art-glint glint-two"></div><div class="hero-note note-one"><span class="note-dot"></span> عيار · وزن · أمانة</div><div class="hero-note note-two"><span class="note-line"></span> معرفة تتحول لمهارة</div><div class="hero-art-caption">ورشة معرفة…<br><strong>تليق بثقتك.</strong></div><div class="hero-art-num">01 / 03</div></div>
    </div>
    <div class="welcome-row"><div><span class="eyebrow">مسارك لحد دلوقتي</span><h2>${done ? `قطعت ${done.toLocaleString('ar-EG')} خطوة` : 'ابدأ من المكان الصح'}</h2><p>${done ? 'كل درس يضيف مهارة تقدر تستخدمها في التعامل مع القطعة والعميل.' : 'ابدأ بالأساسيات، وبعدها انتقل للفحص والتسعير والتعامل مع العميل.'}</p></div><div class="progress-pill"><div class="progress-pill-ring" style="--progress:${percentDone()}%"><span>${percentDone().toLocaleString('ar-EG')}٪</span></div><small>من الدبلومة<br>اكتمل</small></div></div>
    <div class="journey-grid">${phaseCards}</div>
    ${recentLesson}
    <section class="tool-promo"><div class="tool-promo-text"><span class="eyebrow">شوف المبدأ بعينك</span><h3>مش بس نقرا عن الجهاز.<br><em>نلفّه ونفهمه.</em></h3><p>نموذج ثلاثي الأبعاد يوضح من أين تبدأ الأشعة، إزاي تظهر بصمة العنصر، وإيه اللي يقدر الميزان يقيسه فعلًا.</p><button type="button" class="text-link" data-view="tools">جرب مختبر الأجهزة ${icon('arrow')}</button></div><div class="tool-promo-visual"><img src="images/handheld-xrf.jpg" alt="جهاز XRF يدوي لفحص تركيب المعادن" loading="lazy"><div class="promo-stamp"><strong>مختبر</strong><span>ثلاثي الأبعاد</span><b>3D</b></div><span class="promo-caption">XRF · تحليل عناصر المعدن</span></div></section>
    <section class="quick-plan"><div class="section-heading"><div><span class="eyebrow">الخطة المقترحة</span><h2>٤ أسابيع… خطوة خطوة</h2></div><button type="button" class="text-link" data-view="plan">شوف الخطة كاملة ${icon('arrow')}</button></div><div class="week-strip">${weekPlans.map((week, index) => `<button type="button" class="week-chip ${index === 0 ? 'is-now' : ''}" data-view="plan"><span>${String(index + 1).padStart(2, '0')}</span><strong>${week.week}</strong><small>${week.label}</small></button>`).join('')}</div></section>
    <div class="trust-note"><span class="trust-icon">i</span><p>المعلومات للتعلّم. الأسعار والقوانين والدمغات ممكن تتغيّر؛ راجع الجهات المختصة قبل أي معاملة فعلية.</p><button type="button" data-view="references">المراجع المستخدمة ${icon('arrow')}</button></div>
  </section>`;
}

function renderLesson(lesson: Lesson): string {
  const meta = lessonMeta[lesson.id];
  const body = DOMPurify.sanitize(md.parse(lesson.body) as string);
  const phase = PHASES[lesson.phase];
  const position = lessons.findIndex((item) => item.id === lesson.id);
  const previous = lessons[position - 1];
  const next = lessons[position + 1];
  const done = progress.completed.includes(lesson.id);
  const quiz = meta?.quiz;
  const relatedTools = ['2.5', '2.6'].includes(lesson.id) ? `<section class="inline-tools"><div><span class="eyebrow">شوف الأداة وهي شغّالة</span><strong>حوّل وصف الجهاز إلى صورة ومشهد تفاعلي</strong></div><button type="button" class="button button-dark" data-view="tools">افتح مختبر الأجهزة ${icon('arrow')}</button></section>` : '';
  const quizMarkup = quiz ? `<section class="quiz-card" id="quiz-card"><div class="quiz-top"><span class="quiz-marker">?</span><div><span class="eyebrow">وقفة مراجعة</span><h3>اختبر فهمك في دقيقة</h3></div><span class="quiz-count">سؤال سريع</span></div><p class="quiz-question">${escapeHtml(quiz.question)}</p><div class="quiz-options">${quiz.options.map((option, index) => `<label class="quiz-option ${quizAnswer === index ? 'is-selected' : ''} ${quizRevealed && index === quiz.answer ? 'is-correct' : ''} ${quizRevealed && quizAnswer === index && index !== quiz.answer ? 'is-wrong' : ''}"><input type="radio" name="lesson-quiz" value="${index}" ${quizAnswer === index ? 'checked' : ''} ${quizRevealed ? 'disabled' : ''}><span class="option-key">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></label>`).join('')}</div>${quizRevealed ? `<div class="quiz-feedback ${quizAnswer === quiz.answer ? 'correct' : 'try-again'}"><strong>${quizAnswer === quiz.answer ? 'إجابة مظبوطة.' : 'راجع النقطة دي.'}</strong> ${escapeHtml(quiz.why)}</div>` : `<button type="button" class="button button-dark quiz-submit" data-action="quiz-submit" ${quizAnswer === null ? 'disabled' : ''}>راجع إجابتي ${icon('arrow')}</button>`}</section>` : '';
  const lessonNav = `<div class="lesson-navigation">${previous ? `<button type="button" class="lesson-nav-card prev" data-topic="${previous.id}"><span>الدرس السابق</span><strong>${escapeHtml(previous.title)}</strong><small>← ${previous.id}</small></button>` : '<div></div>'}${next ? `<button type="button" class="lesson-nav-card next" data-topic="${next.id}"><span>الدرس التالي</span><strong>${escapeHtml(next.title)}</strong><small>${next.id} ←</small></button>` : '<div></div>'}</div>`;
  return `<article class="lesson-page"><div class="lesson-header"><div class="lesson-breadcrumb"><button type="button" data-view="home">الدبلومة</button><span>/</span><span>${phase?.title ?? ''}</span><span>/</span><span>${lesson.id}</span></div><div class="lesson-meta-row"><span class="phase-tag phase-tag-${lesson.phase}"><i></i>${phase?.title ?? ''}</span><span class="reading-time">◷ ٨–١٢ دقيقة</span><span class="lesson-index">${String(position + 1).padStart(2, '0')} <i>/</i> ${String(lessons.length).padStart(2, '0')}</span></div><h1>${escapeHtml(lesson.title)}</h1><p class="lesson-intro">${escapeHtml(meta?.summary ?? 'اقرأ هذا المحور على مهل، وسجّل ما يحتاج إلى تحقق عملي.')}</p><div class="lesson-actions"><button type="button" class="button ${done ? 'button-complete' : 'button-dark'}" data-action="toggle-complete" data-id="${lesson.id}">${done ? `${icon('check')} مكتمل — ألغِ التحديد` : `${icon('check')} علّمه كمكتمل`}</button><div class="lesson-keywords">${(meta?.keywords ?? []).map((word) => `<span>${escapeHtml(word)}</span>`).join('')}</div></div></div><div class="lesson-body-wrap"><div class="key-idea"><span class="key-idea-icon">✦</span><div><span class="eyebrow">الفكرة اللي لازم تفضل فاكرها</span><p>${escapeHtml(meta?.summary ?? '')}</p></div></div><div class="markdown-content">${body}</div>${relatedTools}${quizMarkup}${lessonNav}</div></article>`;
}

function renderTools(): string {
  const toolCards = [
    { id: 'xrf', title: 'محلل XRF مكتبي', image: 'images/xrf-bench-analyzer.jpg', alt: 'محلل XRF مكتبي', note: 'صورة مرجعية' },
    { id: 'handheld', title: 'XRF يدوي', image: 'images/handheld-xrf.jpg', alt: 'جهاز تحليل XRF محمول', note: 'صورة مرجعية' },
    { id: 'scale', title: 'ميزان دقيق', image: 'images/jewelry-scale.jpg', alt: 'ميزان رقمي للمجوهرات', note: 'صورة مرجعية' },
  ];
  const gallery = toolCards.map((tool) => `<article class="tool-tile"><div class="tool-tile-art"><img src="${tool.image}" alt="${tool.alt}" loading="lazy"></div><div><strong>${tool.title}</strong><small>${tool.note}</small></div>${tool.id === 'scale' ? '<button type="button" class="tool-open" data-open-device="scale" aria-label="افتح نموذج الميزان">↗</button>' : tool.id === 'xrf' ? '<button type="button" class="tool-open" data-open-device="xrf" aria-label="افتح نموذج XRF">↗</button>' : ''}</article>`).join('');
  return `<section class="tools-page"><div class="page-heading"><div><div class="lesson-breadcrumb"><button type="button" data-view="home">الدبلومة</button><span>/</span><span>المختبر التفاعلي</span></div><span class="eyebrow">شوف الفكرة… بعدين ارجع للمشغولة</span><h1>مختبر الأجهزة</h1><p>حرّك النموذج واسحب المشهد، واختار خطوة عشان تشوف مكانها في عملية القياس. ده شرح بصري مبسّط، مش جهاز حقيقي ولا بديل عن الفحص المؤهل.</p></div><div class="heading-ornament"><span>LAB</span><b>٠٢</b></div></div><div id="device-lab"></div><section class="tool-gallery-section"><div class="section-heading"><div><span class="eyebrow">أدوات تظهر في المنهج</span><h2>كل أداة… واستخدامها وحدودها</h2><p>صور مرجعية للأجهزة، ورسوم توضيحية مولّدة للأدوات اليدوية؛ لا تمثل ماركة بعينها.</p></div><span class="gallery-count">${toolCards.length.toLocaleString('ar-EG')} أدوات</span></div><div class="tool-gallery">${gallery}</div></section><section class="lab-note"><span class="note-icon">!</span><p><strong>سلامة أولًا:</strong> لا تشغّل جهاز أشعة أو تستخدم حمضًا على قطعة عميل من دون تدريب وموافقة وإجراء سلامة مناسب. المغناطيس وUV والحجر والحمض قرائن أولية، وليست شهادة نهائية.</p></section></section>`;
}

function addLessonOutline(markdownContent: HTMLElement, lessonId: string) {
  const sections: { node: HTMLElement; id: string; title: string }[] = [];
  markdownContent.querySelectorAll<HTMLElement>('h2, h3, h4, p').forEach((node) => {
    let title = '';
    if (/^H[2-4]$/.test(node.tagName)) title = node.textContent?.trim() ?? '';
    else if (node.tagName === 'P' && node.firstElementChild?.tagName === 'STRONG') title = node.firstElementChild.textContent?.replace(/[：:]\s*$/, '').trim() ?? '';
    if (!title || title.length > 80) return;
    const id = `lesson-section-${lessonId.replace(/\./g, '-')}-${sections.length + 1}`;
    node.id = id;
    sections.push({ node, id, title });
  });
  if (!sections.length) return;
  const details = document.createElement('details');
  details.className = 'lesson-outline';
  details.open = true;
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.textContent = 'محتويات الدرس';
  const count = document.createElement('small');
  count.textContent = `${sections.length.toLocaleString('ar-EG')} عناوين`;
  const caret = document.createElement('b');
  caret.textContent = '⌄';
  summary.append(label, count, caret);
  const nav = document.createElement('nav');
  nav.className = 'lesson-outline-links';
  nav.setAttribute('aria-label', 'عناوين الدرس');
  sections.forEach((section, index) => {
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('strong');
    title.textContent = section.title;
    link.append(number, title);
    nav.append(link);
  });
  details.append(summary, nav);
  markdownContent.parentElement?.insertBefore(details, markdownContent);
}

function renderPlan(): string {
  const weekTopicIds = [
    ['1.1', '1.2', '1.3', '2.1'],
    ['2.2', '2.3', '2.4', '2.6'],
    ['2.5', '2.7', '2.8', '3.2', '3.3', '3.4'],
    ['3.1', '3.5'],
  ];
  const blocks = weekPlans.map((week, index) => {
    const topicIds = weekTopicIds[index] ?? [];
    const completedCount = topicIds.filter((id) => progress.completed.includes(id)).length;
    const progressWidth = topicIds.length ? Math.round(completedCount / topicIds.length * 100) : 0;
    const firstLesson = lessons.find((lesson) => lesson.id === topicIds[0]) ?? lessons[0];
    return `<article class="plan-week"><div class="plan-week-number">${String(index + 1).padStart(2, '0')}<span>أسبوع</span></div><div class="plan-week-content"><div class="plan-week-top"><span>${escapeHtml(week.week)}</span><b>${escapeHtml(week.lessons)}</b></div><h2>${escapeHtml(week.label)}</h2><p>${escapeHtml(week.task)}</p><div class="week-progress-line"><i style="width:${progressWidth}%"></i></div></div><button type="button" class="plan-week-button" data-topic="${firstLesson?.id ?? ''}" aria-label="ابدأ هذا الأسبوع">${icon('arrow')}</button></article>`;
  }).join('');
  return `<section class="plan-page"><div class="page-heading"><div><div class="lesson-breadcrumb"><button type="button" data-view="home">الدبلومة</button><span>/</span><span>خطة المذاكرة</span></div><span class="eyebrow">خطة قابلة للتطبيق، من غير استعجال</span><h1>خلي التعلّم عادة.</h1><p>أربع أسابيع مقسّمة بجلسات قصيرة: اقرأ، طبّق، وبعدها راجع اللي فهمته بصوتك.</p></div><div class="plan-counter"><strong>٢٠</strong><span>دقيقة يوميًا<br>بداية كفاية</span></div></div><div class="plan-timeline">${blocks}</div><section class="study-rhythm"><div class="rhythm-heading"><span class="eyebrow">روتين الجلسة</span><h2>جلسة صغيرة… تعلّم يثبت</h2><p>مش لازم تحفظ كل حاجة مرة واحدة. حوّل كل درس لخطوة عملية.</p></div><div class="rhythm-steps"><div><b>٠٥</b><span>دقائق</span><p>اقرأ الفكرة الأساسية</p></div><i></i><div><b>١٠</b><span>دقائق</span><p>افهم المثال أو الأداة</p></div><i></i><div><b>٠٥</b><span>دقائق</span><p>جاوب سؤال المراجعة</p></div></div></section><div class="plan-reminder"><span>✦</span><p>لو فاتك يوم، ما تبدأش من الصفر. كمّل من آخر درس خلصته، وسجّل الملاحظة اللي محتاج تسأل عنها خبير.</p></div></section>`;
}

function renderReferences(): string {
  const grouped = new Map<string, Reference[]>();
  for (const reference of references) grouped.set(reference.group, [...(grouped.get(reference.group) ?? []), reference]);
  const sections = [...grouped.entries()].map(([group, items]) => `<details class="reference-group" open><summary><span>${escapeHtml(group)}</span><small>${items.length.toLocaleString('ar-EG')} مصدر</small><b>⌄</b></summary><div class="reference-list">${items.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="reference-item"><span class="reference-icon">↗</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(new URL(item.url).hostname.replace(/^www\./, ''))}</small></span><span class="reference-arrow">${icon('arrow')}</span></a>`).join('')}</div></details>`).join('');
  return `<section class="references-page"><div class="page-heading"><div><div class="lesson-breadcrumb"><button type="button" data-view="home">الدبلومة</button><span>/</span><span>المراجع</span></div><span class="eyebrow">الشرح يستند إلى مصادر مهنية وعلمية</span><h1>مكتبة المراجع</h1><p>روابط الدليل الأصلي، مُجمّعة حسب المجال. افصل بين المرجع الفني والقانون المحلي؛ بعض المصادر الأجنبية للمقارنة فقط.</p></div><div class="reference-count"><strong>${references.length.toLocaleString('ar-EG')}</strong><span>مرجع<br>ورابط رسمي ومهني</span></div></div><div class="reference-caution"><span>i</span><p>الخبر أو الصفحة المؤرخة لا تضمن بقاء الإجراءات دون تغيير. راجع الجهة المختصة قبل تطبيق أي متطلب قانوني أو ضريبي.</p></div><div class="reference-groups">${sections}</div></section>`;
}

function renderView() {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view) return;
  if (currentView === 'home') view.innerHTML = renderHome();
  else if (currentView === 'lesson') {
    const lesson = lessons.find((item) => item.id === currentLessonId);
    if (lesson) {
      view.innerHTML = renderLesson(lesson);
      const keyIdea = view.querySelector<HTMLElement>('.key-idea');
      if (keyIdea && audioAssets[lesson.id]) keyIdea.insertAdjacentHTML('afterend', renderAudio(lesson.id));
      const markdownContent = view.querySelector<HTMLElement>('.markdown-content');
      if (markdownContent) addLessonOutline(markdownContent, lesson.id);
    } else view.innerHTML = renderHome();
  } else if (currentView === 'tools') {
    view.innerHTML = renderTools();
    const lab = view.querySelector<HTMLElement>('#device-lab');
    if (lab) {
      const container = lab;
      void import('./device-lab').then(({ mountDeviceLab }) => {
        if (currentView === 'tools' && container.isConnected) labUnmount = mountDeviceLab(container, preferredDevice);
      });
    }
  } else if (currentView === 'plan') view.innerHTML = renderPlan();
  else view.innerHTML = renderReferences();
}

function handleClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const topic = target.closest<HTMLElement>('[data-topic]');
  if (topic?.dataset.topic && lessons.some((lesson) => lesson.id === topic.dataset.topic)) { go('lesson', topic.dataset.topic); return; }
  const viewButton = target.closest<HTMLElement>('[data-view]');
  if (viewButton?.dataset.view && ['home', 'tools', 'plan', 'references'].includes(viewButton.dataset.view)) { go(viewButton.dataset.view as View); return; }
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'open-menu') { document.body.classList.add('menu-open'); return; }
  if (action === 'close-menu') { document.body.classList.remove('menu-open'); return; }
  if (action === 'continue') { const next = lessons.find((lesson) => lesson.id === progress.lastLesson) ?? lessons.find((lesson) => !progress.completed.includes(lesson.id)) ?? lessons[0]; if (next) go('lesson', next.id); return; }
  if (action === 'toggle-complete') {
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!id) return;
    progress.completed = progress.completed.includes(id) ? progress.completed.filter((item) => item !== id) : [...progress.completed, id];
    progress.lastLesson = id;
    saveProgress();
    renderSidebar();
    renderView();
    document.querySelector('#top-context')!.textContent = lessons.find((lesson) => lesson.id === id)?.title ?? 'الدرس';
    return;
  }
  if (action === 'quiz-submit') {
    if (quizAnswer === null) return;
    quizRevealed = true;
    renderView();
    document.querySelector('#quiz-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (target.closest('[data-open-device="scale"]')) { preferredDevice = 'scale'; go('tools'); return; }
  if (target.closest('[data-open-device="xrf"]')) { preferredDevice = 'xrf'; go('tools'); return; }
}

function handleInput(event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === 'lesson-search') {
    searchTerm = target.value.trim();
    renderSidebar();
    const input = document.querySelector<HTMLInputElement>('#lesson-search');
    if (input) { input.focus(); input.setSelectionRange(searchTerm.length, searchTerm.length); }
  }
  if (target instanceof HTMLInputElement && target.name === 'lesson-quiz') {
    quizAnswer = Number(target.value);
    const submit = document.querySelector<HTMLButtonElement>('[data-action="quiz-submit"]');
    if (submit) submit.disabled = false;
    document.querySelectorAll('.quiz-option').forEach((label) => label.classList.toggle('is-selected', label.querySelector('input') === target));
  }
}

function handleTranscriptToggle(event: Event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.open || !details.dataset.transcript) return;
  const content = details.querySelector<HTMLElement>('.audio-transcript-content');
  if (!content || content.dataset.loaded === 'true' || content.dataset.loading === 'true') return;
  content.dataset.loading = 'true';
  content.textContent = 'جاري تحميل نص التعليق...';
  void fetch(details.dataset.transcript).then((response) => {
    if (!response.ok) throw new Error('Transcript unavailable');
    return response.text();
  }).then((text) => {
    content.textContent = text;
    content.dataset.loaded = 'true';
  }).catch(() => {
    content.textContent = 'تعذّر تحميل النص الآن. جرّب فتحه مرة أخرى.';
    content.dataset.loading = 'false';
  });
}

function addKeyboardHelpers() {
  window.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (event.key === '/' && !(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('#lesson-search')?.focus();
    }
    if (event.key === 'Escape') document.body.classList.remove('menu-open');
  });
}

async function init() {
  root.innerHTML = shell();
  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('toggle', handleTranscriptToggle, true);
  const response = await fetch('data/guide.md');
  if (!response.ok) throw new Error('تعذّر تحميل ملف الدبلومة.');
  const markdown = await response.text();
  lessons = parseLessons(markdown);
  references = parseReferences(markdown);
  try {
    const audioResponse = await fetch('audio/manifest.json');
    if (audioResponse.ok) audioAssets = await audioResponse.json() as Record<string, AudioAsset>;
  } catch { audioAssets = {}; }
  if (!currentLessonId || !lessons.some((lesson) => lesson.id === currentLessonId)) currentLessonId = lessons[0]?.id ?? '';
  if (lessons.length !== 16) console.warn(`Expected 16 lessons, found ${lessons.length}.`);
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  const requestedLesson = params.get('lesson');
  if (params.get('device') === 'scale') preferredDevice = 'scale';
  if (requestedLesson && lessons.some((lesson) => lesson.id === requestedLesson)) {
    currentLessonId = requestedLesson;
    currentView = 'lesson';
  }
  if (requestedView === 'tools' || requestedView === 'plan' || requestedView === 'references') currentView = requestedView;
  renderSidebar();
  renderView();
  addKeyboardHelpers();
}

init().catch((error: unknown) => {
  console.error(error);
  root.innerHTML = `<div class="fatal-error"><div class="fatal-mark">!</div><h1>فيه عطل بسيط في تحميل الدبلومة</h1><p>${escapeHtml(error instanceof Error ? error.message : 'حاول تحديث الصفحة مرة تانية.')}</p><button type="button" onclick="location.reload()">إعادة المحاولة</button></div>`;
});
