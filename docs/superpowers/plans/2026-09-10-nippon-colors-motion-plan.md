# Nippon Colors 风格与动效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将座位编排工作台升级为更易读、具有 Nippon Colors 色票气质和明确微交互的静态原生网页，同时保持现有排座功能与紧凑布局。

**Architecture:** 保留现有 DOM ID、`js/app.js` 的业务状态和 `js/layout.js` 的布局 API。视觉层由 `index.html` 提供一个简洁的色票轨容器，`css/style.css` 负责纸张底色、传统色变量、字体层级和可访问动效，`js/app.js` 仅给座位渲染输出错峰动画延迟变量。

**Tech Stack:** 原生 HTML、CSS、JavaScript；现有 SheetJS、html2canvas、jsPDF；不新增构建工具或第三方 UI 依赖。

## Global Constraints

- 保留 `app.js` 当前使用的全部 DOM ID 与导入、拖拽、排序、保存、导出、打印功能。
- 正文最小默认字号调整为 14px；座位姓名不低于 14px；标题不低于 28px。
- 参考 Nippon Colors 的纯色表面、色票块、强对比文字、悬停变色和慢速过渡，不复制其图片资源或代码。
- 所有动画只使用 `transform`、`opacity`、伪元素缩放或颜色过渡；`prefers-reduced-motion` 必须关闭错峰与过渡。
- 桌面端仍由画布内部滚动，移动端不得产生页面横向溢出。

### Task 1: 重做色彩与字体层级

**Files:**
- Modify: `css/style.css`
- Test: `tests/layout.test.mjs`（保持现有布局 API 回归）

**Interfaces:**
- Consumes: 现有 `.app-shell`、`.sidebar`、`.main-stage`、`.seat` 等 DOM 类名。
- Produces: `--nakabeni: #DB4D6D`、纸白/墨色/灰紫棕 token，14–16px 的可读正文和 28–32px 的标题层级。

- [ ] **Step 1: 写出视觉回归检查目标**

  检查 CSS 中存在 `--nakabeni: #DB4D6D`、`body` 的 `font-size: 14px`、`.seat-name` 的 `font-size: 14px` 以及 `.title-line input` 的 `font-size: 28px` 或更大。

- [ ] **Step 2: 运行现有布局测试确认基线**

  Run: `node --test tests/layout.test.mjs`
  Expected: 4 tests pass。

- [ ] **Step 3: 应用 Nippon Colors 风格变量与字体层级**

  将当前 coral/green token 替换为中紅、纸白、墨色、灰紫棕；放大正文、名单行、座位姓名、统计数字和主标题，维持紧凑的行高与间距。

- [ ] **Step 4: 运行测试与空白检查**

  Run: `node --test tests/layout.test.mjs` and `git diff --check`
  Expected: 4 tests pass and no whitespace errors。

### Task 2: 添加色票轨与交互状态

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 当前顶部 header、画布工具栏和 `#seat-grid`。
- Produces: `.palette-rail`、`.palette-swatch`、`.seat` 的 hover/focus/drag-over/special 状态。

- [ ] **Step 1: 在工作台头部加入可访问色票轨**

  在 `header-inner` 内加入 3 个带 `title` 的按钮式色票块，文案分别为“中紅 / Nakabeni”“銀鼠 / Ginnezumi”“深緋 / Kokiake”；不新增业务动作，色票只作为当前视觉系统的状态提示。

- [ ] **Step 2: 为色票和座位建立单一交互语言**

  色票 hover 时扩大并显示标签；座位 hover/focus 时使用伪元素从底部向上填充中紅色，文字转为深色或白色以保持对比；特殊座位使用同一色票作为实心状态。

- [ ] **Step 3: 检查键盘焦点与移动端触控状态**

  色票、按钮和座位保留 `:focus-visible`；移动端不依赖 hover，座位操作按钮保持可见且触控区域不小于 28px。

### Task 3: 增加错峰入场与拖拽反馈

**Files:**
- Modify: `js/app.js:281-303`
- Modify: `css/style.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: `seatHtml(c, idx, seatNoText, extraClass)` 的 `idx` 和现有 `drag-over` 类。
- Produces: `--seat-delay` 内联变量、`.app-ready` 入场状态、`.seat.drag-over` 呼吸高亮以及 toast/按钮的流畅反馈。

- [ ] **Step 1: 给座位输出稳定的错峰延迟变量**

  在座位根元素上增加 `style="--seat-delay:${Math.min(idx, 35) * 18}ms"`，不改变数据属性、拖拽逻辑或可访问标签。

- [ ] **Step 2: 增加应用入场与座位铺色动画**

  在 `index.html` 的现有初始化脚本中给 `document.body` 增加 `app-ready`；CSS 使用 `app-ready` 控制 header/sidebar/stage 的淡入，`.seat` 使用 `seat-arrive` 错峰动画。动画只改变 `opacity` 和 `transform`。

- [ ] **Step 3: 增加拖拽、按钮和提示的动态反馈**

  为 `.seat.drag-over` 添加轻微 pulse；为主要按钮添加按压缩放；为 `.toast` 保留滑入并增加离场 opacity 过渡；不使用无限循环动画，除拖拽目标外不引入持续运动。

- [ ] **Step 4: 添加 reduced-motion 覆盖**

  在 `@media (prefers-reduced-motion: reduce)` 中取消 `animation-delay`、动画和过渡，并保持焦点边框与颜色状态可见。

### Task 4: 浏览器视觉验证与推送

**Files:**
- Verify: `index.html`
- Verify: `css/style.css`
- Verify: `js/app.js`

**Interfaces:**
- Consumes: Tasks 1–3 的静态页面与现有本地服务器。
- Produces: 桌面/移动端无横向溢出、座位字样可读、首屏能看到底部行、交互状态可见的最终提交。

- [ ] **Step 1: 运行完整静态检查**

  Run: `node --test tests/layout.test.mjs`, `node --check js/app.js`, `node --check js/layout.js`, `git diff --check`
  Expected: tests pass, syntax checks exit 0, no whitespace errors。

- [ ] **Step 2: 通过本地浏览器截图检查**

  打开 `http://127.0.0.1:8000/`，检查 6×6 座位表、较大字体、色票轨、座位 hover/focus、拖拽目标和首屏底部可见性；移动端检查单列布局和横向溢出。

- [ ] **Step 3: 暂存并复核变更**

  Run: `git add index.html css/style.css js/app.js docs/superpowers/plans/2026-09-10-nippon-colors-motion-plan.md` and `git diff --cached --check`
  Expected: only the planned UI, motion, seat-delay and plan files are staged。

- [ ] **Step 4: 中文提交并推送**

  Run: `git commit -m "强化中红色票风格与交互动画"` and `git push origin main`
  Expected: `origin/main` points to the new commit and the worktree is clean。
