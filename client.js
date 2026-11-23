/* 上下文领域 · Client 半边（v0.3）
 *
 * 一个落点：会话头右侧的 utilities 槽位（为了拿到 sessionId 与会话列几何），
 * 但真正的界面是一条 **贴住会话头下沿的固定横条**（portal 到 body），
 * 只在有会话时出现 —— 新会话与对话是同一个位置。
 * 条上只有领域：● 名称，点一下开关；悬停看成员（技能/工具两段，名字用顿号连起来）。
 * 设置页在 settings.section。
 */
window.__ModuleLoader__.load({
  id: 'dsh-context-domains',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const NS = 'context-domains'
    const API = '/context-domains/api'

    /* ------------------------------------------------------------- styles */
    const CSS = `
.cdx-slot{display:contents}
.cdx-bar{position:fixed;z-index:40;display:flex;align-items:center;gap:4px;height:34px;padding:0 12px;
  background:color-mix(in srgb, var(--dsw-alias-bg-base) 90%, var(--dsw-alias-label-primary) 6%);
  backdrop-filter:blur(12px) saturate(1.2);
  border-bottom:1px solid var(--dsw-alias-border-l1);box-sizing:border-box;pointer-events:auto;
  font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.cdx-bar-chips{display:flex;align-items:center;gap:3px;min-width:0;flex:1 1 auto;
  overflow-x:auto;scrollbar-width:none}
.cdx-bar-chips::-webkit-scrollbar{height:0}
.cdx-chip{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;height:24px;padding:0 9px;
  border-radius:999px;border:1px solid transparent;background:transparent;font:inherit;font-size:11.5px;
  color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;transition:background-color .12s ease}
.cdx-chip:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.cdx-chip[aria-checked="false"]{color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));opacity:.8}
.cdx-dot{width:6px;height:6px;border-radius:50%;flex:0 0 6px;background:var(--dsw-alias-state-idle-primary)}
.cdx-chip[aria-checked="true"] .cdx-dot{background:var(--dsw-alias-state-success-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent)}
/* 压缩阈值计数器：条的最右边，左减右加、中间是数字（单位 10 万 token） */
.cdx-budget{display:inline-flex;align-items:center;flex:0 0 auto;gap:1px;height:22px;margin-left:8px;padding:0 3px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:999px;
  background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 72%, transparent);
  font-variant-numeric:tabular-nums;user-select:none}
.cdx-budget-btn{display:grid;place-items:center;width:17px;height:17px;padding:0;border:0;border-radius:50%;
  background:transparent;font:inherit;font-size:12px;line-height:1;cursor:pointer;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-budget-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));
  color:var(--dsw-alias-label-primary)}
.cdx-budget-btn:disabled{opacity:.3;cursor:default}
.cdx-budget-num{min-width:17px;text-align:center;font-size:11.5px;font-weight:600;
  color:var(--dsw-alias-label-primary);cursor:default}
.cdx-budget[data-busy="true"]{opacity:.55}
.cdx-budget[data-degraded="true"] .cdx-budget-num{color:var(--dsw-alias-label-warning, #e8a33d)}
.cdx-more{flex:0 0 auto;width:22px;height:22px;border-radius:6px;border:0;background:transparent;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));cursor:pointer;line-height:1}
.cdx-more:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary)}
.cdx-pop{position:fixed;z-index:300;width:310px;padding:8px;box-sizing:border-box;
  display:flex;flex-direction:column;min-height:0;overflow:hidden;
  background:var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
  box-shadow:0 18px 48px rgba(0,0,0,.32);color:var(--dsw-alias-label-primary)}
/* 头尾固定，中间成员清单自己滚：领域装了几十个 skill 也不会把弹窗拉成一整屏 */
.cdx-pop-hd{display:flex;align-items:baseline;gap:7px;padding:2px 4px 7px;
  border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.cdx-pop-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;
  padding-right:2px;scrollbar-width:thin;
  scrollbar-color:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35)) transparent}
.cdx-pop-body::-webkit-scrollbar{width:6px}
.cdx-pop-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35));border-radius:3px}
.cdx-pop-body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2, rgba(127,127,127,.55))}
.cdx-pop-hd b{font-size:12.5px}
.cdx-pop-sub{color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));font-size:10.5px;
  font-variant-numeric:tabular-nums}
.cdx-grp{display:flex;align-items:center;gap:6px;padding:8px 4px 2px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));font-size:10px;letter-spacing:.3px}
.cdx-grp:not(:first-of-type){margin-top:3px;border-top:1px solid var(--dsw-alias-border-l1)}
.cdx-grp .n{color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));opacity:.8}
.cdx-names{margin:0;padding:2px 4px 4px;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.85;
  font-family:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);overflow-wrap:anywhere}
.cdx-pop-ft{padding:7px 4px 2px;border-top:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));font-size:10.5px}
.cdx-fallback{display:flex;align-items:center;gap:3px;max-width:42vw;overflow-x:auto;scrollbar-width:none}
.cdx-fallback::-webkit-scrollbar{height:0}

/* ---------- 设置面板：左列领域清单 / 右列编辑器（视觉稿来自 OpenDesign cdx-settings-v2） ---------- */
.cdx-set,.cdx-set *,.cdx-scrim,.cdx-scrim *{box-sizing:border-box}
.cdx-set{display:flex;height:clamp(440px,68vh,690px);min-height:400px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);container-type:inline-size}
/* 左列 200px */
.cdx-side{display:flex;flex:0 0 200px;flex-direction:column;width:200px;
  background:color-mix(in srgb, var(--dsw-alias-bg-base) 55%, var(--dsw-alias-bg-layer-1));
  border-right:1px solid var(--dsw-alias-border-l1)}
.cdx-side-hd{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:8px;
  height:48px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.cdx-side-count{font-size:11px;letter-spacing:.04em;white-space:nowrap;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-side-actions{display:flex;align-items:center;gap:4px}
.cdx-side-list{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:2px;
  margin:0;padding:8px 8px 0;overflow-y:auto;list-style:none;
  scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35)) transparent}
.cdx-side-list::-webkit-scrollbar{width:6px}
.cdx-side-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35));border-radius:3px}
.cdx-side-list::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2, rgba(127,127,127,.55))}
.cdx-domain{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;
  gap:8px;width:100%;min-height:56px;padding:8px 8px 8px 12px;border:0;border-radius:8px;
  background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background-color .14s ease}
.cdx-domain:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}
.cdx-domain[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-active, rgba(127,127,127,.18))}
.cdx-domain-mark{position:absolute;top:10px;bottom:10px;left:0;width:2px;border-radius:2px;background:transparent}
.cdx-domain[aria-selected="true"] .cdx-domain-mark{background:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-domain-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.cdx-domain-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.cdx-domain[aria-selected="true"] .cdx-domain-name{color:var(--dsw-alias-label-primary)}
.cdx-domain-meta{display:flex;align-items:center;gap:4px;font-size:11px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-domain-badge{flex:0 0 auto;height:16px;padding:0 4px;font-size:11px;line-height:14px;border-radius:4px;
  color:var(--dsw-alias-state-success-primary);
  border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 42%, transparent)}
.cdx-domain-ratio{flex:0 0 auto;white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px;
  font-family:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-side-foot{flex:0 0 auto;margin:0;padding:12px;font-size:11px;line-height:1.5;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  border-top:1px solid var(--dsw-alias-border-l1)}
/* 右列 */
.cdx-main{display:flex;flex:1 1 auto;flex-direction:column;gap:16px;min-width:0;padding:16px}
.cdx-field{display:flex;flex-direction:column;gap:8px}
.cdx-field-lbl{font-size:11px;letter-spacing:.04em;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-input{width:100%;height:32px;padding:0 8px;font:inherit;font-size:12px;outline:none;
  color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;
  transition:border-color .14s ease, box-shadow .14s ease}
.cdx-input::placeholder{color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-input:focus{border-color:var(--dsw-alias-brand-primary, #5686fe);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 18%, transparent)}
.cdx-input-area{height:56px;padding:8px;line-height:1.5;resize:none}
/* 默认启用开关行 */
.cdx-switchrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;
  border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1)}
.cdx-switchrow-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.cdx-switchrow-lbl{font-size:12px;color:var(--dsw-alias-label-primary)}
.cdx-switchrow-hint{font-size:11px;color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-switch{position:relative;flex:0 0 auto;width:32px;height:18px;padding:0;cursor:pointer;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;
  transition:background-color .14s ease, border-color .14s ease}
.cdx-switch::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
  background:var(--dsw-alias-switch-thumb, var(--dsw-alias-label-tertiary, #888));
  transition:transform .14s ease, background-color .14s ease}
.cdx-switch[aria-checked="true"]{border-color:var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-brand-primary)}
.cdx-switch[aria-checked="true"]::after{background:var(--dsw-alias-label-primary-foreground);transform:translateX(14px)}
.cdx-switch:focus-visible{outline:none;
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 20%, transparent)}
.cdx-switch:disabled{cursor:default;opacity:.6}
/* 成员区 */
.cdx-members{display:flex;flex:1 1 auto;flex-direction:column;gap:4px;min-height:0}
.cdx-search{display:flex;align-items:center;height:32px;border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);
  transition:border-color .14s ease, box-shadow .14s ease}
.cdx-search:focus-within{border-color:var(--dsw-alias-brand-primary, #5686fe);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 18%, transparent)}
.cdx-search-input{flex:1 1 auto;min-width:0;height:100%;padding:0 8px;font:inherit;font-size:12px;
  color:var(--dsw-alias-label-primary);background:transparent;border:0;outline:none;appearance:none}
.cdx-search-input::placeholder{color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-search-input::-webkit-search-cancel-button{display:none}
.cdx-search-meta{flex:0 0 auto;padding:0 8px;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  border-left:1px solid var(--dsw-alias-border-l1)}
.cdx-filters{display:flex;align-items:center;justify-content:space-between;gap:8px;row-gap:6px;
  flex-wrap:wrap;padding:4px 0}
.cdx-filters-right{display:flex;align-items:center;gap:4px;min-width:0}
.cdx-filters-lbl{font-size:11px;white-space:nowrap;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1)}
.cdx-seg-btn{height:22px;padding:0 6px;font:inherit;font-size:11px;white-space:nowrap;cursor:pointer;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  background:transparent;border:0;border-radius:6px;transition:background-color .14s ease, color .14s ease}
.cdx-seg-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary)}
.cdx-seg-btn[aria-pressed="true"]{
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);
  color:var(--dsw-alias-label-primary);font-weight:600}
.cdx-seg-btn:focus-visible{outline:none;
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 22%, transparent)}
.cdx-list{display:grid;grid-template-columns:1fr 1fr;column-gap:8px;align-content:start;
  flex:1 1 auto;min-height:160px;max-height:260px;padding:4px 4px 4px 0;
  overflow-y:auto;overscroll-behavior:contain;
  border-top:1px solid var(--dsw-alias-border-l1);
  scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35)) transparent}
.cdx-list-one{grid-template-columns:1fr}
.cdx-list::-webkit-scrollbar{width:6px}
.cdx-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35));border-radius:3px}
.cdx-list::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2, rgba(127,127,127,.55))}
.cdx-member{position:relative;display:flex;align-items:center;gap:8px;height:26px;min-width:0;
  padding:0 4px;border-radius:6px;cursor:pointer;transition:background-color .14s ease}
.cdx-member:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}
.cdx-member input{position:absolute;width:13px;height:13px;margin:0;opacity:0;pointer-events:none}
.cdx-check{position:relative;flex:0 0 auto;width:13px;height:13px;border-radius:4px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);
  transition:background-color .14s ease, border-color .14s ease}
.cdx-check::after{content:"";position:absolute;top:1px;left:3.5px;width:4px;height:7px;
  border-right:1.5px solid var(--dsw-alias-label-primary-foreground, #fff);
  border-bottom:1.5px solid var(--dsw-alias-label-primary-foreground, #fff);
  opacity:0;transform:rotate(40deg) scale(.5);transition:opacity .14s ease, transform .14s ease}
.cdx-member input:checked + .cdx-check{
  background:var(--dsw-alias-brand-primary, #5686fe);border-color:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-member input:checked + .cdx-check::after{opacity:1;transform:rotate(40deg) scale(1)}
.cdx-member input:focus-visible + .cdx-check{border-color:var(--dsw-alias-brand-primary, #5686fe);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 22%, transparent)}
.cdx-member-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1;
  font-family:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);font-size:11px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-member input:checked ~ .cdx-member-name{color:var(--dsw-alias-label-secondary)}
/* 空态 */
.cdx-empty{grid-column:1 / -1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;min-height:200px;padding:16px;text-align:center}
.cdx-empty-text{margin:0;font-size:11px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-hint{font-size:11px;color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
/* 加载骨架：首次打开先给形状，不用「还没有领域」冒充加载中 */
.cdx-skel{display:flex;flex-direction:column;gap:6px;width:100%;animation:cdx-pulse 1.2s ease-in-out infinite}
.cdx-skel-line{grid-column:1 / -1;height:10px;border-radius:5px;
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent)}
.cdx-skel-short{width:56%}
.cdx-skel-domain{min-height:48px;padding:8px 12px;border-radius:8px;justify-content:center}
.cdx-skel-main{min-height:120px;gap:12px;padding:8px 0}
@keyframes cdx-pulse{0%,100%{opacity:.5}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.cdx-skel{animation:none}}
/* 错误只影响对应区块，带就地重试 */
.cdx-error{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.5;
  color:var(--dsw-alias-label-error);
  background:color-mix(in srgb, var(--dsw-alias-label-error) 10%, transparent);
  border:1px solid color-mix(in srgb, var(--dsw-alias-label-error) 30%, transparent)}
.cdx-error-text{min-width:0;overflow-wrap:anywhere}
.cdx-error .cdx-btn{flex:0 0 auto;height:22px;color:var(--dsw-alias-label-error)}
/* 虚拟列表上下的占位：让滚动条仍按完整列表算长度 */
.cdx-pad{grid-column:1 / -1;width:100%;pointer-events:none}
.cdx-empty-btn{height:24px;padding:0 8px;font:inherit;font-size:11px;cursor:pointer;border-radius:6px;
  color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2)}
.cdx-empty-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary)}
/* 底部操作 */
.cdx-main-foot{display:flex;flex:0 0 auto;align-items:center;gap:8px;margin-top:auto;padding-top:12px;
  border-top:1px solid var(--dsw-alias-border-l1)}
.cdx-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;padding:0 8px;
  font:inherit;font-size:11px;white-space:nowrap;cursor:pointer;border-radius:6px;
  color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);
  transition:background-color .14s ease, border-color .14s ease, color .14s ease, transform .14s ease}
.cdx-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary)}
.cdx-btn:active{transform:translateY(1px)}
.cdx-btn:disabled{opacity:.5;cursor:default}
.cdx-btn-primary{height:36px;font-size:13px;font-weight:600;border-color:transparent;
  color:var(--dsw-alias-label-primary-foreground, #fff);background:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-btn-primary:hover{filter:brightness(1.08);color:var(--dsw-alias-label-primary-foreground, #fff);
  background:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-btn-danger{height:30px;padding:0 12px;background:transparent;border-color:var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-error)}
.cdx-btn-danger:hover{color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-label-error);
  background:color-mix(in srgb, var(--dsw-alias-label-error) 12%, transparent)}
.cdx-iconbtn{display:grid;place-items:center;width:24px;height:24px;padding:0;font:inherit;font-size:12px;
  line-height:1;cursor:pointer;border-radius:6px;background:transparent;border:1px solid transparent;
  color:var(--dsw-alias-label-secondary);transition:background-color .14s ease, border-color .14s ease, color .14s ease}
.cdx-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-iconbtn-accent{color:var(--dsw-alias-brand-primary, #5686fe)}
/* AI 归类弹窗 */
.cdx-scrim{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;
  background:var(--dsw-alias-bg-mask-1, rgba(0,0,0,.4));
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.cdx-modal{display:flex;flex-direction:column;gap:12px;width:520px;max-width:100%;max-height:86vh;
  padding:16px;box-sizing:border-box;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);box-shadow:0 28px 72px rgba(0,0,0,.42)}
.cdx-modal-hd{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cdx-modal-title{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.cdx-modal-desc{margin:0;font-size:11px;line-height:1.6;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-prompt{display:flex;flex-direction:column;overflow:hidden;cursor:copy;border-radius:8px;
  background:color-mix(in srgb, var(--dsw-alias-bg-base) 55%, var(--dsw-alias-bg-layer-1));
  border:1px solid var(--dsw-alias-border-l2);transition:border-color .14s ease}
.cdx-prompt:hover{border-color:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-prompt:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary, #5686fe);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #5686fe) 18%, transparent)}
.cdx-prompt-text{max-height:248px;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;
  overflow-wrap:break-word;font-family:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size:11px;line-height:1.7;color:var(--dsw-alias-label-secondary);scrollbar-width:thin}
.cdx-prompt-text::-webkit-scrollbar{width:6px}
.cdx-prompt-text::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2, rgba(127,127,127,.35));border-radius:3px}
.cdx-prompt-hint{align-self:flex-end;height:20px;margin:6px 6px 0;padding:0 4px;font-size:11px;line-height:18px;
  white-space:nowrap;pointer-events:none;opacity:0;border-radius:6px;transition:opacity .14s ease;
  color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2)}
.cdx-prompt:hover .cdx-prompt-hint,
.cdx-prompt:focus-visible .cdx-prompt-hint,
.cdx-prompt[data-copied="true"] .cdx-prompt-hint{opacity:1}
.cdx-prompt[data-copied="true"] .cdx-prompt-hint{color:var(--dsw-alias-state-success-primary);
  border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)}
.cdx-modal-foot{display:flex}
.cdx-modal-foot .cdx-btn{width:100%}
/* 窄面板：左列收窄、成员列表单列 */
@container (max-width: 520px){
  .cdx-side{flex-basis:172px;width:172px}
  .cdx-list{grid-template-columns:1fr}
  .cdx-main{gap:12px;padding:12px}
  .cdx-filters-lbl{display:none}
}
@media (prefers-reduced-motion: reduce){.cdx-chip{transition:none}}
`

    function ensureStyles() {
      const tag = 'context-domains/plugin.css'
      if (document.querySelector(`style[data-plugin-css="${tag}"]`)) return
      const style = document.createElement('style')
      style.dataset.plugin = NS
      style.dataset.pluginCss = tag
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ---------------------------------------------------------------- api */
    async function call(path, body) {
      const init = body === undefined
        ? { headers: { accept: 'application/json' } }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      const response = await fetch(`${API}${path}`, init)
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
      return payload.value
    }

    /* ------------------------------------------------------ 唯一实例仲裁 */
    // 新会话与已有会话落在不同槽位（hero.options / session.header.utilities），
    // 同一时刻只允许一个实例把条子画出来，否则会出现两条。
    let barOwner = null

    function useBarOwnership() {
      const self = React.useRef({})
      const [owned, setOwned] = React.useState(false)
      React.useEffect(() => {
        if (barOwner === null) {
          barOwner = self.current
          setOwned(true)
        }
        return () => {
          if (barOwner === self.current) barOwner = null
        }
      }, [])
      return owned
    }

    /* -------------------------------------------------------------- hooks */
    const listeners = new Set()
    function broadcast() {
      for (const reload of listeners) void reload()
    }

    function useSnapshot(sessionId) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState(null)
      const reload = React.useCallback(async () => {
        if (!sessionId) return
        try {
          setSnapshot(await call(`/snapshot?sessionId=${encodeURIComponent(sessionId)}`))
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [sessionId])
      React.useEffect(() => {
        void reload()
        const timer = setInterval(() => void reload(), 8000)
        const onFocus = () => void reload()
        window.addEventListener('focus', onFocus)
        listeners.add(reload)
        return () => {
          clearInterval(timer)
          window.removeEventListener('focus', onFocus)
          listeners.delete(reload)
        }
      }, [reload])
      return { snapshot, error, reload }
    }

    const BAR_HEIGHT = 34

    /** 滚动容器按几何找：与会话列同左边缘、同宽、可滚动、够高 —— 不依赖 class 名。 */
    function findScroller(box) {
      const candidates = [...document.querySelectorAll('div')].filter((el) => {
        const style = getComputedStyle(el)
        if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return false
        const rect = el.getBoundingClientRect()
        return Math.abs(rect.left - box.left) < 8 && Math.abs(rect.width - box.width) < 24 && rect.height > 300
      })
      return candidates[0] ?? null
    }

    /**
     * 横条是固定定位、盖在正文上方，所以要给会话的滚动容器补一段 padding-top，
     * 否则第一条消息会被压住。只改一个内联样式、卸载时还原，不动 DOM 结构。
     *
     * 关键：padding 一旦加上，就不要在每次 box 变化时「先摘掉再补上」。摘掉的瞬间
     * scrollHeight 抖掉 BAR_HEIGHT，浏览器会把贴底的 scrollTop 夹回去 —— 表现就是
     * 内容更新时视图被弹上去、再也贴不到最底。所以这里按「滚动容器元素」记住原始
     * padding，重复应用同一个值（幂等），只有容器换了才迁移，box 没了或卸载时才还原。
     */
    function useOverlayPadding(box) {
      const stateRef = React.useRef(null)

      React.useEffect(() => {
        // 几何测不到 / 会话切走：还原并清掉，别把 padding 留在死元素上
        if (!box) {
          const state = stateRef.current
          if (state) {
            state.el.style.paddingTop = state.original
            stateRef.current = null
          }
          return
        }
        const scroller = findScroller(box)
        if (!scroller) return
        const state = stateRef.current
        if (state && state.el === scroller) {
          // 同一个容器：只补到目标值，不摘不重建
          const wanted = `${state.base + BAR_HEIGHT}px`
          if (scroller.style.paddingTop !== wanted) scroller.style.paddingTop = wanted
          return
        }
        // 容器换了：先还原旧的，再给新的补上
        if (state) state.el.style.paddingTop = state.original
        const original = scroller.style.paddingTop
        const base = parseFloat(getComputedStyle(scroller).paddingTop) || 0
        scroller.style.paddingTop = `${base + BAR_HEIGHT}px`
        stateRef.current = { el: scroller, original, base }
      }, [box])

      // 卸载时还原（上面的 effect 不返回 cleanup，避免每次 box 变化都摘 padding）
      React.useEffect(() => {
        return () => {
          const state = stateRef.current
          if (state) state.el.style.paddingTop = state.original
          stateRef.current = null
        }
      }, [])
    }

    /** 会话列的几何：横条要贴住会话头下沿、和会话列同宽。测不到就返回 null（走内联降级）。 */
    function useColumnBox(anchorRef) {
      const [box, setBox] = React.useState(null)
      React.useEffect(() => {
        let observer
        const measure = () => {
          const anchor = anchorRef.current
          const column = document.querySelector('[data-slot="conversation.session"]')?.parentElement
          const headerSlot = document.querySelector('[data-slot="conversation.session.header"]')
          const header = headerSlot?.parentElement
          const headerRect = header?.getBoundingClientRect()
          const colRect = column?.getBoundingClientRect() ?? anchor?.parentElement?.getBoundingClientRect()
          if (!colRect || colRect.width < 200) {
            setBox(null)
            return
          }
          const top = headerRect && headerRect.height > 10 ? headerRect.bottom : colRect.top
          const next = { left: Math.round(colRect.left), top: Math.round(top), width: Math.round(colRect.width) }
          // 只在几何真的变了才换引用：之前每秒都 setBox 一个新对象，
          // 让 useOverlayPadding 每秒「摘掉 padding 再补上」，贴底时被浏览器夹回去。
          setBox((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width ? prev : next))
        }
        measure()
        const timer = setInterval(measure, 1000)
        window.addEventListener('resize', measure)
        if (typeof ResizeObserver !== 'undefined' && document.body) {
          observer = new ResizeObserver(measure)
          observer.observe(document.body)
        }
        return () => {
          clearInterval(timer)
          window.removeEventListener('resize', measure)
          observer?.disconnect()
        }
      }, [anchorRef])
      return box
    }

    function useAnchoredPopover(open, onClose) {
      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        const onDown = (event) => {
          if (event.target.closest?.('.cdx-pop, .cdx-chip, .cdx-bar')) return
          onClose()
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onDown)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('mousedown', onDown)
        }
      }, [open, onClose])
    }

    function portal(node) {
      return ReactDOM.createPortal(node, document.body)
    }

    function counts(domain) {
      let skills = 0
      let tools = 0
      for (const member of domain.members ?? []) {
        if (member.type === 'tool') tools += 1
        else skills += 1
      }
      return { skills, tools, total: skills + tools }
    }

    /* ------------------------------------------------- 压缩阈值计数器 */
    // 条的最右边：左减右加，中间是数字，单位 10 万 token（2 = 20 万，最低值）。
    // 值是全局的（压缩引擎按 preset 挂一个，多会话共用），所以条上改了立刻对全场生效。
    function CompactionCounter({ info }) {
      const [busy, setBusy] = React.useState(false)
      if (info === null || info === undefined) return null
      const step = info.stepTokens > 0 ? info.stepTokens : 100000
      const min = Math.round((info.minTokens ?? 200000) / step)
      const max = Math.round((info.maxTokens ?? 10000000) / step)
      const value = Math.round((info.budgetTokens ?? min * step) / step)
      const wan = Math.round((info.budgetTokens ?? 0) / 10000)
      const clamped = Array.isArray(info.targets) && info.targets.some((target) => target.clamped === true)
      const degraded = Array.isArray(info.degraded) && info.degraded.length > 0

      const move = async (delta) => {
        const next = Math.min(max, Math.max(min, value + delta))
        if (busy || next === value) return
        setBusy(true)
        try {
          await call('/compaction', { tokens: next })
          broadcast()
        } catch (error) {
          console.warn('[context-domains] compaction budget failed', error)
        } finally {
          setBusy(false)
        }
      }

      const title = `上下文压缩阈值 ${wan} 万 token`
        + `（${value} × ${step / 10000} 万，最低 ${min}）\n`
        + `全局生效：所有会话共用这一个数；改了下一轮就用新值，不用重启。\n`
        + (clamped ? '当前模型窗口比这个数小，实际按窗口上限压。\n' : '')
        + (degraded
          ? `降级：${info.degraded.map((item) => item.reason).join('；')}`
          : `已接管 ${info.engines} 个 compaction 引擎`)

      return h(
        'div',
        {
          className: 'cdx-budget',
          role: 'group',
          'aria-label': '上下文压缩阈值',
          'data-busy': busy ? 'true' : 'false',
          'data-degraded': degraded ? 'true' : 'false',
          title,
        },
        h('button', {
          className: 'cdx-budget-btn', type: 'button', 'aria-label': '降低压缩阈值 10 万 token',
          disabled: busy || value <= min,
          onClick: () => void move(-1),
        }, '−'),
        h('span', { className: 'cdx-budget-num', 'aria-live': 'polite' }, String(value)),
        h('button', {
          className: 'cdx-budget-btn', type: 'button', 'aria-label': '提高压缩阈值 10 万 token',
          disabled: busy || value >= max,
          onClick: () => void move(1),
        }, '+'),
      )
    }

    /* ------------------------------------------------------------- 领域条 */
    function DomainBar(props) {
      const sessionId = props.sessionId
      const owned = useBarOwnership()
      const { snapshot } = useSnapshot(sessionId)
      const anchorRef = React.useRef(null)
      const box = useColumnBox(anchorRef)
      useOverlayPadding(owned ? box : null)
      const [openId, setOpenId] = React.useState(null)
      const [chipRect, setChipRect] = React.useState(null)
      const [viewHeight, setViewHeight] = React.useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight))
      const close = React.useCallback(() => setOpenId(null), [])
      useAnchoredPopover(openId !== null, close)

      // 弹窗开着时窗口尺寸变了要重算高度上限，否则窗口缩小后清单底部会被挤到屏幕外
      React.useEffect(() => {
        if (openId === null) return undefined
        const onResize = () => setViewHeight(window.innerHeight)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [openId])

      const toggle = async (domain) => {
        try {
          await call('/toggle', { sessionId, domainId: domain.id, enabled: !domain.loaded })
          broadcast()
        } catch (error) {
          console.warn('[context-domains] toggle failed', error)
        }
      }

      if (!owned) return h('span', { className: 'cdx-slot', 'aria-hidden': 'true' })
      if (!snapshot) return null
      // 一个领域都没有也留着条：压缩阈值计数器挂在同一条上（老 Host 没有这个块就照旧隐藏）
      const compaction = snapshot.compaction ?? null
      if (snapshot.domains.length === 0 && compaction === null) return null
      const counter = h(CompactionCounter, { info: compaction })
      const openDomain = openId === null ? null : snapshot.domains.find((d) => d.id === openId)

      const chipList = snapshot.domains.map((domain) =>
        h(
          'button',
          {
            key: domain.id,
            className: 'cdx-chip',
            type: 'button',
            role: 'switch',
            'aria-checked': domain.loaded ? 'true' : 'false',
            title: `${domain.name} · ${counts(domain).total} 项`,
            onClick: () => void toggle(domain),
            onMouseEnter: (event) => {
              setOpenId(domain.id)
              setChipRect(event.currentTarget.getBoundingClientRect())
            },
            onFocus: (event) => {
              setOpenId(domain.id)
              setChipRect(event.currentTarget.getBoundingClientRect())
            },
          },
          h('i', { className: 'cdx-dot' }),
          domain.name,
        ),
      )

      // 高度上限：最多占视口 55%，且不越过屏幕下沿；剩下的交给 .cdx-pop-body 自己滚
      const viewport = viewHeight > 0 ? viewHeight : (typeof window === 'undefined' ? 720 : window.innerHeight)
      const popTop = Math.round((chipRect?.bottom ?? 0) + 6)
      const cap = Math.max(132, Math.min(
        Math.round(viewport - popTop - 12),
        Math.round(viewport * 0.55),
      ))

      const popover = openDomain && chipRect
        ? portal(
            h(
              'div',
              {
                className: 'cdx-pop',
                role: 'dialog',
                'aria-label': openDomain.name,
                style: {
                  left: Math.round(Math.max(8, Math.min(chipRect.left, window.innerWidth - 318))) + 'px',
                  top: popTop + 'px',
                  maxHeight: cap + 'px',
                },
                onMouseLeave: close,
              },
              h(
                'div',
                { className: 'cdx-pop-hd' },
                h('b', null, openDomain.name),
                h('span', { className: 'cdx-pop-sub' }, `${counts(openDomain).total} 项`),
              ),
              h(
                'div',
                { className: 'cdx-pop-body' },
                ['skill', 'tool'].map((type) => {
                  const names = (openDomain.members ?? []).filter((m) => m.type === type).map((m) => m.name)
                  if (names.length === 0) return null
                  return h(
                    React.Fragment,
                    { key: type },
                    h('div', { className: 'cdx-grp' }, type === 'skill' ? '技能' : '工具', h('span', { className: 'n' }, String(names.length))),
                    h('p', { className: 'cdx-names' }, names.join('、')),
                  )
                }),
              ),
              h('div', { className: 'cdx-pop-ft' }, '点条上的名字开关这个领域；这里只列出它装了哪些东西'),
            ),
          )
        : null

      // 几何测不到（没有会话列 / 布局异常）时，降级成会话头里的一行紧凑芯片，功能不变
      if (box === null) {
        return h(
          React.Fragment,
          null,
          h('span', { ref: anchorRef, className: 'cdx-slot', 'aria-hidden': 'true' }),
          h('div', { className: 'cdx-fallback', role: 'group', 'aria-label': '上下文领域' }, chipList, counter),
          popover,
        )
      }

      return h(
        React.Fragment,
        null,
        h('span', { ref: anchorRef, className: 'cdx-slot', 'aria-hidden': 'true' }),
        portal(
          h(
            'div',
            {
              className: 'cdx-bar',
              style: { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` },
              role: 'group',
              'aria-label': '上下文领域',
              title: '点领域开关；在 设置 → 上下文领域 里管理领域',
            },
            h('div', { className: 'cdx-bar-chips' }, chipList),
            counter,
          ),
        ),
        popover,
      )
    }

    /* -------------------------------------------------------------- 设置 */
    // 页签与显示范围都记住：重新打开设置页不至于又回到「全部」再翻一遍
    let lastMemberTab = 'all'
    let lastMemberFilter = 'all'

    /** 给用户抄的 prompt：自动化建域走的是同一套 HTTP 契约，这里只负责把话写顺。 */
    const AI_PROMPT = '读 GET /context-domains/api/catalog，把里面的 skill 和 tool 按用途归成 6–8 个领域：\n'
      + '名字 ≤6 字，一个领域可以同时装 skill 与 tool，成员不要重复。\n'
      + '先给我一份归类清单，我确认后你用 POST /context-domains/api/domains\n'
      + '（op=create, name, description, members:[{type,name}]）逐条建好。'

    const EMPTY_CATALOG = { skills: [], tools: [], suggestions: [], unassigned: { skills: [], tools: [] } }
    const NO_MEMBERS = []
    const CATALOG_TTL_MS = 60_000
    const SEARCH_DEBOUNCE_MS = 120
    const MEMBER_COALESCE_MS = 40
    const META_DEBOUNCE_MS = 450
    const VIRTUAL_THRESHOLD = 200
    const MEMBER_ROW_HEIGHT = 26

    // 设置页跨打开复用：模块级缓存活过组件卸载，第二次打开先出内容再后台校验。
    const settingsCache = { domains: null, catalog: null, catalogAt: 0, selectedId: null }

    /** 只用最新一次加载的结果：慢的旧响应回来时丢掉，不能覆盖新状态。 */
    function createLoadGate() {
      let current = 0
      return {
        begin() {
          current += 1
          return current
        },
        isCurrent(token) {
          return token === current
        },
      }
    }

    /** 尾触发防抖；cancel 给清除筛选/卸载用，flush 给输入框失焦用。 */
    function debounce(fn, ms) {
      let timer = null
      let lastArgs = []
      const wrapped = (...args) => {
        lastArgs = args
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          fn(...lastArgs)
        }, ms)
      }
      wrapped.cancel = () => {
        if (timer !== null) clearTimeout(timer)
        timer = null
      }
      wrapped.flush = () => {
        if (timer === null) return
        clearTimeout(timer)
        timer = null
        fn(...lastArgs)
      }
      return wrapped
    }

    /** reload 后保留选中；领域被删时选原位置的邻居，不回到第一个。 */
    function pickSelected(domains, selectedId, previous = []) {
      if (selectedId !== null && domains.some((domain) => domain.id === selectedId)) return selectedId
      if (domains.length === 0) return null
      const index = previous.findIndex((domain) => domain.id === selectedId)
      if (index < 0) return domains[0].id
      return domains[Math.min(index, domains.length - 1)].id
    }

    /**
     * 大目录只渲染视口附近的行。返回行区间与上下占位高度，
     * 滚动条仍按完整列表算长度。
     */
    function windowRange({ scrollTop = 0, viewportHeight = 260, rowHeight = MEMBER_ROW_HEIGHT, totalLines = 0, overscan = 6 } = {}) {
      if (totalLines <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
      const top = Math.max(0, scrollTop)
      // 结果变少时旧 scrollTop 可能远超新列表长度：夹到最后一行，别渲染出一片空白。
      const start = Math.max(0, Math.min(totalLines - 1, Math.floor(top / rowHeight) - overscan))
      const end = Math.min(totalLines, Math.ceil((top + Math.max(1, viewportHeight)) / rowHeight) + overscan)
      return { start, end, padTop: start * rowHeight, padBottom: (totalLines - end) * rowHeight }
    }

    /** 把一次勾选合并进成员列表：只动目标那一项，其余顺序不变。 */
    function toggleMember(members, type, name, on) {
      const next = [...(members ?? [])]
      const index = next.findIndex((m) => m.type === type && m.name === name)
      if (on && index < 0) next.push({ type, name })
      if (!on && index >= 0) next.splice(index, 1)
      return next
    }

    /** 把输入框里攒下的改动变成一次 update；和已落盘值相同就不发。 */
    function metaPayload(pending, storedDomains = settingsCache.domains?.domains ?? []) {
      const payload = { op: 'update', id: pending.id }
      if (pending.name !== undefined) payload.name = pending.name
      if (pending.description !== undefined) payload.description = pending.description
      const stored = storedDomains.find((domain) => domain.id === pending.id)
      if (payload.name !== undefined && stored?.name === payload.name) delete payload.name
      if (payload.description !== undefined && (stored?.description ?? '') === payload.description) delete payload.description
      if (payload.name === undefined && payload.description === undefined) return null
      return payload
    }

    /**
     * 成员勾选的写入口。抽出来是为了让 node:test 能直接驱动两次连点，
     * 不用把 React 设置页整个渲染起来。
     *
     * 每个领域一条队列：连点在 40ms 合并窗口里压成一次提交，写串行；每次提交都拿
     * 队列里的最新意图。旧实现每次都用渲染快照算 next，两次连点会后写覆盖先写。
     */
    function createMemberWriter({ write, reload, onBusy, onError, onMembers, onIdle, coalesceMs = MEMBER_COALESCE_MS }) {
      const queues = new Map()
      let busyCount = 0
      const setBusy = (on) => {
        busyCount += on ? 1 : -1
        onBusy?.(busyCount > 0)
      }

      const settle = (queue) => {
        if (queue.dirty || queue.running !== null) return
        const waiters = queue.waiters
        queue.waiters = []
        for (const resolve of waiters) resolve()
        onIdle?.(queue.id)
      }

      const schedule = (queue) => {
        if (queue.timer !== null || queue.running !== null) return
        queue.timer = setTimeout(() => {
          queue.timer = null
          void drain(queue)
        }, coalesceMs)
      }

      const drain = (queue) => {
        if (queue.running !== null) return queue.running
        queue.running = (async () => {
          let wrote = false
          setBusy(true)
          try {
            while (queue.dirty) {
              queue.dirty = false
              const next = queue.members
              await write(queue.id, next)
              wrote = true
            }
            // 一次连点只重拉一次领域；目录不跟着刷。
            if (wrote) await reload?.(queue.id)
          } catch (cause) {
            // 失败就丢掉未落盘意图，下一次勾选重新从页面快照起算，避免把幽灵成员写上去。
            queue.dirty = false
            queue.members = []
            queue.dead = true
            onError?.(cause, queue.id)
          } finally {
            setBusy(false)
          }
        })().finally(() => {
          queue.running = null
          if (queue.dirty) schedule(queue)
          else settle(queue)
        })
        return queue.running
      }

      return {
        toggle(id, base, type, name, on) {
          let queue = queues.get(id)
          if (queue === undefined) {
            queue = { id, members: [...(base ?? [])], dirty: false, dead: false, timer: null, running: null, waiters: [] }
            queues.set(id, queue)
          }
          // 上一次写失败后，下一次勾选从页面快照重新起算。
          if (queue.dead) {
            queue.members = [...(base ?? [])]
            queue.dead = false
          }
          queue.members = toggleMember(queue.members, type, name, on)
          queue.dirty = true
          // 先让界面当帧打勾，再走网络。
          onMembers?.(id, queue.members)
          const done = new Promise((resolve) => queue.waiters.push(resolve))
          schedule(queue)
          return done
        },
      }
    }

    const memoComponent = typeof React.memo === 'function' ? React.memo : (component) => component

    /** 成员行只有自己那一格变化时才重渲染；onToggle 由父组件保持稳定引用。 */
    const MemberRow = memoComponent(function MemberRow({ type, name, checked, onToggle }) {
      return h(
        'label',
        { className: 'cdx-member', title: name, 'data-type': type },
        h('input', {
          type: 'checkbox',
          checked,
          onChange: (event) => onToggle(type, name, event.target.checked),
        }),
        h('span', { className: 'cdx-check', 'aria-hidden': 'true' }),
        h('span', { className: 'cdx-member-name' }, name),
      )
    })

    function DomainsSettings() {
      const cachedDomains = settingsCache.domains
      const cachedCatalog = settingsCache.catalog
      const [domains, setDomains] = React.useState(() => cachedDomains?.domains ?? [])
      const [catalog, setCatalog] = React.useState(() => cachedCatalog ?? EMPTY_CATALOG)
      const [selectedId, setSelectedId] = React.useState(() => settingsCache.selectedId)
      const [searchInput, setSearchInput] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [tab, setTab] = React.useState(lastMemberTab)
      const [filter, setFilter] = React.useState(lastMemberFilter)
      const [aiOpen, setAiOpen] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const [domainsError, setDomainsError] = React.useState(null)
      const [catalogError, setCatalogError] = React.useState(null)
      const [loadingDomains, setLoadingDomains] = React.useState(cachedDomains === null)
      const [loadingCatalog, setLoadingCatalog] = React.useState(cachedCatalog === null)
      const [savingMembers, setSavingMembers] = React.useState(false)
      const [metaSaving, setMetaSaving] = React.useState(false)
      const [mutating, setMutating] = React.useState(false)
      const [memberDraft, setMemberDraft] = React.useState(null)
      const [listState, setListState] = React.useState({ scrollTop: 0, height: 260 })

      const domainGate = React.useRef(null)
      if (domainGate.current === null) domainGate.current = createLoadGate()
      const catalogGate = React.useRef(null)
      if (catalogGate.current === null) catalogGate.current = createLoadGate()

      const loadDomains = React.useCallback(async () => {
        const token = domainGate.current.begin()
        setLoadingDomains(true)
        try {
          const value = await call('/domains')
          if (!domainGate.current.isCurrent(token)) return
          settingsCache.domains = value
          setDomains(value.domains)
          setDomainsError(null)
        } catch (cause) {
          if (!domainGate.current.isCurrent(token)) return
          setDomainsError(cause.message ?? String(cause))
        } finally {
          if (domainGate.current.isCurrent(token)) setLoadingDomains(false)
        }
      }, [])

      const loadCatalog = React.useCallback(async (force = false) => {
        const fresh = settingsCache.catalog !== null && Date.now() - settingsCache.catalogAt < CATALOG_TTL_MS
        if (!force && fresh) {
          setCatalog(settingsCache.catalog)
          setCatalogError(null)
          return
        }
        const token = catalogGate.current.begin()
        setLoadingCatalog(true)
        try {
          const value = await call('/catalog')
          if (!catalogGate.current.isCurrent(token)) return
          settingsCache.catalog = value
          settingsCache.catalogAt = Date.now()
          setCatalog(value)
          setCatalogError(null)
        } catch (cause) {
          if (!catalogGate.current.isCurrent(token)) return
          setCatalogError(cause.message ?? String(cause))
        } finally {
          if (catalogGate.current.isCurrent(token)) setLoadingCatalog(false)
        }
      }, [])

      React.useEffect(() => {
        void loadDomains()
        void loadCatalog()
      }, [loadDomains, loadCatalog])

      // reload 后保留选中；领域被删时用上一份列表找回原来位置，选相邻项。
      const previousDomains = React.useRef(domains)
      React.useEffect(() => {
        const next = pickSelected(domains, selectedId, previousDomains.current)
        previousDomains.current = domains
        if (next !== selectedId) {
          setSelectedId(next)
          settingsCache.selectedId = next
        }
      }, [domains, selectedId])

      const pickTab = (next) => {
        lastMemberTab = next
        setTab(next)
      }
      const pickFilter = (next) => {
        lastMemberFilter = next
        setFilter(next)
      }

      // 搜索输入先落到框里，过滤晚 120ms 再跑；连打五个字只算一次。
      const commitSearch = React.useMemo(() => debounce((value) => setQuery(value), SEARCH_DEBOUNCE_MS), [])
      React.useEffect(() => {
        commitSearch(searchInput)
        return () => commitSearch.cancel()
      }, [searchInput, commitSearch])

      const selected = domains.find((domain) => domain.id === selectedId) ?? null

      // 成员写不跟全局 busy 走：勾选是输入，连续点两项必须都能进队。
      // 跟 busy 一起禁掉复选框的话，浏览器会把第二次点击吞掉。
      const selectedRef = React.useRef(selected)
      selectedRef.current = selected
      const draftRef = React.useRef(memberDraft)
      draftRef.current = memberDraft

      const writerRef = React.useRef(null)
      if (writerRef.current === null) {
        writerRef.current = createMemberWriter({
          write: (id, members) => call('/domains', { op: 'update', id, members }),
          reload: async () => {
            await loadDomains()
            broadcast()
          },
          onBusy: setSavingMembers,
          onMembers: (id, members) => setMemberDraft({ id, members }),
          onIdle: () => setMemberDraft(null),
          onError: (cause) => setDomainsError(cause.message ?? String(cause)),
        })
      }

      const setMember = React.useCallback((type, name, on) => {
        const domain = selectedRef.current
        if (domain === null) return
        const draft = draftRef.current
        const base = draft !== null && draft.id === domain.id ? draft.members : (domain.members ?? [])
        void writerRef.current.toggle(domain.id, base, type, name, on)
      }, [])

      /* --------------------------------------------------- 名称/说明防抖 */
      const metaTimer = React.useRef(null)
      const metaPending = React.useRef(null)

      const flushMeta = React.useCallback(async () => {
        if (metaTimer.current !== null) {
          clearTimeout(metaTimer.current)
          metaTimer.current = null
        }
        const pending = metaPending.current
        metaPending.current = null
        const payload = pending === null ? null : metaPayload(pending)
        if (payload === null) return
        setMetaSaving(true)
        try {
          await call('/domains', payload)
          await loadDomains()
          broadcast()
        } catch (cause) {
          setDomainsError(cause.message ?? String(cause))
        } finally {
          setMetaSaving(false)
        }
      }, [loadDomains])

      const queueMeta = (id, patch) => {
        if (metaPending.current === null || metaPending.current.id !== id) metaPending.current = { id }
        Object.assign(metaPending.current, patch)
        if (metaTimer.current !== null) clearTimeout(metaTimer.current)
        metaTimer.current = setTimeout(() => {
          metaTimer.current = null
          void flushMeta()
        }, META_DEBOUNCE_MS)
      }

      // 关掉设置页时把还没到点的编辑直接发出去，别让用户最后几个字白打。
      React.useEffect(() => () => {
        if (metaTimer.current !== null) clearTimeout(metaTimer.current)
        const pending = metaPending.current
        metaPending.current = null
        const payload = pending === null ? null : metaPayload(pending)
        if (payload !== null) void call('/domains', payload).then(() => broadcast()).catch(() => {})
      }, [])

      const run = async (fn) => {
        setMutating(true)
        try {
          await fn()
        } catch (cause) {
          setDomainsError(cause.message ?? String(cause))
        } finally {
          setMutating(false)
        }
      }
      // 新建即默认启用：用户建领域的意图就是「要用它」，默认值别再让人多勾一次
      const create = (draft) => run(async () => {
        const created = await call('/domains', { op: 'create', defaultOn: true, ...draft })
        // 先刷新列表再选中新领域：反过来的话，选中 effect 会拿「还没有新领域」的旧列表
        // 把刚选的 id 判成失效，跳回第一个领域。
        await loadDomains()
        settingsCache.selectedId = created.id
        setSelectedId(created.id)
        broadcast()
      })
      const update = (patch) => run(async () => {
        if (selected) await call('/domains', { op: 'update', id: selected.id, ...patch })
        await loadDomains()
        broadcast()
      })
      const remove = () => run(async () => {
        if (!selected) return
        const index = domains.findIndex((domain) => domain.id === selected.id)
        const rest = domains.filter((domain) => domain.id !== selected.id)
        const next = rest[Math.min(index, rest.length - 1)]?.id ?? null
        await call('/domains', { op: 'delete', id: selected.id })
        settingsCache.selectedId = next
        setSelectedId(next)
        await loadDomains()
        broadcast()
      })

      const pickDomain = (id) => {
        if (id === selectedId) return
        void flushMeta()
        settingsCache.selectedId = id
        setSelectedId(id)
        setMemberDraft(null)
        setListState((prev) => (prev.scrollTop === 0 ? prev : { ...prev, scrollTop: 0 }))
      }

      const members = memberDraft !== null && memberDraft.id === selectedId
        ? memberDraft.members
        : (selected?.members ?? NO_MEMBERS)
      const memberSet = React.useMemo(
        () => new Set(members.map((member) => `${member.type}:${member.name}`)),
        [members],
      )

      const keywords = query.trim().toLowerCase()
      // 搜索/页签只跟目录与关键字有关；勾选一项不重跑名称匹配。
      const matchedRows = React.useMemo(() => {
        const types = tab === 'all' ? ['skill', 'tool'] : [tab]
        const list = []
        for (const type of types) {
          const source = type === 'skill' ? catalog.skills : catalog.tools
          for (const item of source) {
            if (keywords !== '' && !item.name.toLowerCase().includes(keywords)) continue
            list.push({ type, name: item.name })
          }
        }
        return list
      }, [catalog, tab, keywords])
      // 「已选 / 未选」才看成员集合，且只在匹配结果上筛。
      const rows = React.useMemo(() => {
        if (filter === 'all') return matchedRows
        return matchedRows.filter((row) => {
          const on = memberSet.has(`${row.type}:${row.name}`)
          return filter === 'picked' ? on : !on
        })
      }, [matchedRows, filter, memberSet])

      // 领域计数只在 domains 变化时算一次，勾选/搜索不重算。
      const countsById = React.useMemo(() => {
        const map = new Map()
        for (const domain of domains) map.set(domain.id, counts(domain))
        return map
      }, [domains])

      /* ------------------------------------------------------ 大目录窗口 */
      const columns = tab === 'all' ? 2 : 1
      const totalLines = Math.ceil(rows.length / columns)
      const virtualized = rows.length > VIRTUAL_THRESHOLD
      const range = virtualized
        ? windowRange({ scrollTop: listState.scrollTop, viewportHeight: listState.height, totalLines, rowHeight: MEMBER_ROW_HEIGHT })
        : { start: 0, end: totalLines, padTop: 0, padBottom: 0 }
      const visibleRows = virtualized ? rows.slice(range.start * columns, range.end * columns) : rows
      const listRef = React.useRef(null)
      const scrollRaf = React.useRef(0)
      const onListScroll = (event) => {
        if (scrollRaf.current !== 0) return
        const el = event.currentTarget
        scrollRaf.current = requestAnimationFrame(() => {
          scrollRaf.current = 0
          setListState({ scrollTop: el.scrollTop, height: el.clientHeight || 260 })
        })
      }
      React.useEffect(() => () => cancelAnimationFrame(scrollRaf.current), [])
      React.useEffect(() => {
        const el = listRef.current
        if (el === null) return
        el.scrollTop = 0
        setListState((prev) => (prev.scrollTop === 0 ? prev : { ...prev, scrollTop: 0 }))
      }, [tab, filter, keywords, selectedId])

      const copyPrompt = async () => {
        try {
          await navigator.clipboard.writeText(AI_PROMPT)
        } catch {
          const area = document.createElement('textarea')
          area.value = AI_PROMPT
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand?.('copy')
          area.remove()
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }

      /** 分段控件：类型页签与显示范围共用，选中态用 aria-pressed 表达。 */
      const segmented = (label, items, active, onPick) =>
        h(
          'div',
          { className: 'cdx-seg', role: 'group', 'aria-label': label },
          items.map(([id, text]) =>
            h(
              'button',
              {
                key: id,
                className: 'cdx-seg-btn',
                type: 'button',
                'aria-pressed': active === id ? 'true' : 'false',
                onClick: () => onPick(id),
              },
              text,
            ),
          ),
        )

      const emptyText = () => {
        if (keywords !== '') return `没有匹配「${query.trim()}」的成员`
        if (filter === 'picked') return '还没有已选成员'
        if (filter === 'unpicked') return '本领域成员已全部选中'
        if (tab === 'skill') return '本领域没有技能成员'
        if (tab === 'tool') return '本领域没有工具成员'
        return '还没有可用的成员'
      }

      const clearFilters = () => {
        commitSearch.cancel()
        setSearchInput('')
        setQuery('')
        pickTab('all')
        pickFilter('all')
      }

      const catalogEmpty = catalog.skills.length === 0 && catalog.tools.length === 0
      const catalogSkeleton = loadingCatalog && catalogEmpty
      // 目录没拿到时别用「还没有可用的成员」冒充空目录：错误已经在上方说明。
      const catalogUnavailable = !catalogSkeleton && catalogError !== null && catalogEmpty
      const memberList = catalogSkeleton
        ? h(
            'div',
            { className: 'cdx-list' },
            [0, 1, 2, 3, 4].map((index) => h('div', { key: index, className: 'cdx-skel cdx-skel-line' })),
          )
        : catalogUnavailable
          ? h('div', { className: 'cdx-list' })
          : rows.length === 0
          ? h(
              'div',
              { className: 'cdx-empty' },
              h('p', { className: 'cdx-empty-text' }, emptyText()),
              h('button', { className: 'cdx-empty-btn', type: 'button', onClick: clearFilters }, '清除筛选'),
            )
          : h(
              React.Fragment,
              null,
              virtualized && range.padTop > 0
                ? h('div', { key: 'pad-top', className: 'cdx-pad', style: { height: `${range.padTop}px` }, 'aria-hidden': 'true' })
                : null,
              visibleRows.map((row) =>
                h(MemberRow, {
                  key: `${row.type}:${row.name}`,
                  type: row.type,
                  name: row.name,
                  checked: memberSet.has(`${row.type}:${row.name}`),
                  onToggle: setMember,
                }),
              ),
              virtualized && range.padBottom > 0
                ? h('div', { key: 'pad-bottom', className: 'cdx-pad', style: { height: `${range.padBottom}px` }, 'aria-hidden': 'true' })
                : null,
            )

      // AI 弹窗：portal 到 body 且 z-index 高过宿主设置弹窗（1000/1100 的 fixed 层），
      // 否则会被压在那个对话框下面 —— 表现就是「点了 AI 什么都不出现」。
      const aiDialog = aiOpen
        ? portal(
            h(
              'div',
              {
                className: 'cdx-scrim',
                role: 'presentation',
                onMouseDown: (event) => {
                  event.stopPropagation()
                  if (event.target === event.currentTarget) setAiOpen(false)
                },
                onClick: (event) => event.stopPropagation(),
              },
              h(
                'div',
                {
                  className: 'cdx-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '让 AI 帮忙归类',
                  onMouseDown: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'cdx-modal-hd' },
                  h('h2', { className: 'cdx-modal-title' }, '让 AI 帮忙归类'),
                  h('button', {
                    className: 'cdx-iconbtn', type: 'button', 'aria-label': '关闭弹窗',
                    onClick: () => setAiOpen(false),
                  }, '✕'),
                ),
                h('p', { className: 'cdx-modal-desc' },
                  '把下面这段发给会话里的 AI：它会自己读目录、按用途归类，先给你清单，确认后再建域。'),
                h(
                  'div',
                  {
                    className: 'cdx-prompt',
                    role: 'button',
                    tabIndex: 0,
                    title: '点一下复制',
                    'data-copied': copied ? 'true' : 'false',
                    'aria-label': 'prompt 文本，点击复制',
                    onClick: () => void copyPrompt(),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void copyPrompt()
                      }
                    },
                  },
                  h('span', { className: 'cdx-prompt-hint', 'aria-live': 'polite' }, copied ? '已复制' : '点击复制'),
                  h('pre', { className: 'cdx-prompt-text' }, AI_PROMPT),
                ),
                h(
                  'div',
                  { className: 'cdx-modal-foot' },
                  h('button', {
                    className: 'cdx-btn cdx-btn-primary', type: 'button',
                    onClick: () => void copyPrompt(),
                  }, copied ? '已复制' : '复制 prompt'),
                ),
              ),
            ),
          )
        : null

      const domainRow = (domain) => {
        const c = countsById.get(domain.id) ?? { skills: 0, tools: 0, total: 0 }
        return h(
          'button',
          {
            key: domain.id,
            className: 'cdx-domain',
            type: 'button',
            'aria-selected': selectedId === domain.id ? 'true' : 'false',
            onClick: () => pickDomain(domain.id),
          },
          h('span', { className: 'cdx-domain-mark', 'aria-hidden': 'true' }),
          h(
            'span',
            { className: 'cdx-domain-body' },
            h('span', { className: 'cdx-domain-name' }, domain.name),
            h(
              'span',
              { className: 'cdx-domain-meta' },
              `${c.total} 项`,
              domain.defaultOn ? h('span', { className: 'cdx-domain-badge' }, '默认') : null,
            ),
          ),
          h('span', { className: 'cdx-domain-ratio' }, `${c.skills}/${c.tools}`),
        )
      }

      const showDomainSkeleton = loadingDomains && domains.length === 0
      const domainErrorBlock = domainsError !== null
        ? h(
            'div',
            { className: 'cdx-error', role: 'alert' },
            h('span', { className: 'cdx-error-text' }, domainsError),
            h('button', { className: 'cdx-btn', type: 'button', onClick: () => void loadDomains() }, '重试'),
          )
        : null

      return h(
        'div',
        { className: 'cdx-set' },
        h(
          'aside',
          { className: 'cdx-side' },
          h(
            'header',
            { className: 'cdx-side-hd' },
            h('span', { className: 'cdx-side-count' }, `${domains.length} 个领域`),
            h(
              'div',
              { className: 'cdx-side-actions' },
              h('button', {
                className: 'cdx-btn', type: 'button', disabled: mutating,
                onClick: () => void create({ name: '新领域', members: [] }),
              }, '＋ 新建'),
              h('button', {
                className: 'cdx-iconbtn cdx-iconbtn-accent', type: 'button',
                title: '让 AI 帮忙归类成员（点开有可复制的 prompt）',
                'aria-label': '让 AI 帮忙归类成员',
                onClick: () => setAiOpen(true),
              }, '✦'),
            ),
          ),
          h(
            'div',
            { className: 'cdx-side-list', role: 'list' },
            showDomainSkeleton
              ? [0, 1, 2, 3].map((index) =>
                  h('div', { key: index, className: 'cdx-skel cdx-skel-domain' },
                    h('span', { className: 'cdx-skel cdx-skel-line' }),
                    h('span', { className: 'cdx-skel cdx-skel-line cdx-skel-short' })),
                )
              : domains.length === 0
                ? domainsError !== null
                  ? domainErrorBlock
                  : h(
                      'div',
                      { className: 'cdx-empty' },
                      h('p', { className: 'cdx-empty-text' }, '还没有领域，可以从建议开始'),
                      (catalog.suggestions ?? []).map((s) =>
                        h('button', {
                          key: s.name, className: 'cdx-empty-btn', type: 'button', disabled: mutating,
                          onClick: () => void create({ name: s.name, members: s.members }),
                        }, `${s.name} · ${s.members.length} 项`),
                      ),
                    )
                : domains.map(domainRow),
          ),
          h('p', { className: 'cdx-side-foot' },
            `未归入领域：${catalog.unassigned?.skills?.length ?? 0} skill · ${catalog.unassigned?.tools?.length ?? 0} tool`),
        ),
        h(
          'div',
          { className: 'cdx-main' },
          selected !== null && domainsError !== null ? domainErrorBlock : null,
          selected === null
            ? showDomainSkeleton
              ? h('div', { className: 'cdx-empty', style: { minHeight: '0', flex: '1 1 auto' } },
                  h('div', { className: 'cdx-skel cdx-skel-main' },
                    h('span', { className: 'cdx-skel cdx-skel-line' }),
                    h('span', { className: 'cdx-skel cdx-skel-line cdx-skel-short' }),
                    h('span', { className: 'cdx-skel cdx-skel-line' })))
              : h('div', { className: 'cdx-empty', style: { minHeight: '0', flex: '1 1 auto' } },
                  h('p', { className: 'cdx-empty-text' }, domainsError !== null ? domainsError : '从左侧选一个领域，或新建一个。领域只做归纳：一个领域里可以同时装 skill 和 tool。'))
            : h(
                React.Fragment,
                null,
                h('label', { className: 'cdx-field' },
                  h('span', { className: 'cdx-field-lbl' }, '名称'),
                  h('input', {
                    className: 'cdx-input', defaultValue: selected.name, key: `${selected.id}:name`, spellCheck: false,
                    onInput: (event) => {
                      const value = event.target.value.trim()
                      if (value === '') {
                        if (metaPending.current?.id === selected.id) delete metaPending.current.name
                      } else {
                        queueMeta(selected.id, { name: value })
                      }
                    },
                    onBlur: (event) => {
                      if (event.target.value.trim() === '') {
                        event.target.value = selected.name
                        if (metaPending.current?.id === selected.id) delete metaPending.current.name
                      }
                      void flushMeta()
                    },
                  })),
                h('label', { className: 'cdx-field' },
                  h('span', { className: 'cdx-field-lbl' }, '说明'),
                  h('textarea', {
                    className: 'cdx-input cdx-input-area', rows: 2, spellCheck: false,
                    defaultValue: selected.description ?? '', key: `${selected.id}:desc`,
                    placeholder: '这个领域装了什么，什么时候要开',
                    onInput: (event) => queueMeta(selected.id, { description: event.target.value }),
                    onBlur: () => void flushMeta(),
                  })),
                h('div', { className: 'cdx-switchrow' },
                  h('span', { className: 'cdx-switchrow-text' },
                    h('span', { className: 'cdx-switchrow-lbl' }, '默认启用'),
                    h('span', { className: 'cdx-switchrow-hint' }, '勾上 = 新会话自动点亮，会话里仍可随时关')),
                  h('button', {
                    className: 'cdx-switch', type: 'button', role: 'switch',
                    'aria-checked': selected.defaultOn ? 'true' : 'false', 'aria-label': '默认启用',
                    disabled: mutating,
                    onClick: () => void update({ defaultOn: !selected.defaultOn }),
                  })),
                h('div', { className: 'cdx-members' },
                  h('div', { className: 'cdx-search' },
                    h('input', {
                      className: 'cdx-search-input', type: 'search', placeholder: '搜索成员名称',
                      'aria-label': '搜索成员', value: searchInput,
                      onChange: (event) => setSearchInput(event.target.value),
                    }),
                    h('span', { className: 'cdx-search-meta' }, `已选 ${memberSet.size} 项`)),
                  h('div', { className: 'cdx-filters' },
                    segmented('成员类型', [['all', '全部'], ['skill', '技能'], ['tool', '工具']], tab, pickTab),
                    h('div', { className: 'cdx-filters-right' },
                      h('span', { className: 'cdx-filters-lbl' }, '显示'),
                      segmented('显示范围',
                        [['all', '全部成员'], ['picked', '已选'], ['unpicked', '未选']], filter, pickFilter))),
                  catalogError !== null
                    ? h('div', { className: 'cdx-error', role: 'alert' },
                        h('span', { className: 'cdx-error-text' }, catalogError),
                        h('button', { className: 'cdx-btn', type: 'button', onClick: () => void loadCatalog(true) }, '重试'))
                    : null,
                  h('div', {
                    ref: listRef,
                    className: tab === 'all' ? 'cdx-list' : 'cdx-list cdx-list-one',
                    role: 'group', 'aria-label': '成员列表',
                    onScroll: onListScroll,
                  }, memberList)),
                h('div', { className: 'cdx-main-foot' },
                  h('button', {
                    className: 'cdx-btn cdx-btn-danger', type: 'button',
                    disabled: mutating || savingMembers || memberDraft !== null,
                    onClick: () => void remove(),
                  }, '删除领域'),
                  h('span', { className: 'cdx-hint' },
                    savingMembers || metaSaving ? '保存中…' : '保存即时生效，下一轮生效')),
              ),
        ),
        aiDialog,
      )
    }

    /* -------------------------------------------------------------- locale */
    const zh = {
      meta: { title: '上下文领域', description: '把一组 skill / tool 归成一个领域，在会话顶部整块开关。' },
      sectionTitle: '上下文领域',
    }
    const en = {
      meta: { title: 'Context domains', description: 'Group skills and tools into domains and toggle them from the session bar.' },
      sectionTitle: 'Context domains',
    }

    /* --------------------------------------------------------------- apply */
    return {
      name: NS,
      inject: ['slots', 'locale'],
      // 只给 node:test 用：宿主只读 name / inject / apply，多一个字段不影响加载。
      __test: { toggleMember, createMemberWriter, metaPayload, windowRange, pickSelected, createLoadGate, debounce },
      apply(ctx) {
        ensureStyles()
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-domains: dictionaries')
        const t = ctx.locale.bind(NS)

        // 两个锚点：新会话落在 hero.options，已有会话落在会话头 utilities。
        // 两处渲染的是同一条固定横条（portal 到 body），由 useBarOwnership 保证同一时刻只有一条。
        ctx.slots.inject('conversation.hero.options', () =>
          ctx.slots.register({ name: 'conversation.hero.options', id: 'context-domains.bar.blank', order: 10, locale: NS }, DomainBar))
        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'context-domains.bar', order: 20, locale: NS }, DomainBar))

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'context-domains', order: 35, locale: NS, label: () => t('sectionTitle') }, DomainsSettings))
      },
    }
  },
})
