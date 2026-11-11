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
.cdx-more{flex:0 0 auto;width:22px;height:22px;border-radius:6px;border:0;background:transparent;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));cursor:pointer;line-height:1}
.cdx-more:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary)}
.cdx-pop{position:fixed;z-index:300;width:310px;padding:8px;box-sizing:border-box;
  background:var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
  box-shadow:0 18px 48px rgba(0,0,0,.32);color:var(--dsw-alias-label-primary)}
.cdx-pop-hd{display:flex;align-items:baseline;gap:7px;padding:2px 4px 7px;border-bottom:1px solid var(--dsw-alias-border-l1)}
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

    /**
     * 横条是固定定位、盖在正文上方，所以要给会话的滚动容器补一段 padding-top，
     * 否则第一条消息会被压住。只改一个内联样式、卸载时还原，不动 DOM 结构。
     * 滚动容器按几何找：与会话列同左边缘、同宽、可滚动、够高 —— 不依赖 class 名。
     */
    function useOverlayPadding(box) {
      React.useEffect(() => {
        if (!box) return undefined
        const candidates = [...document.querySelectorAll('div')].filter((el) => {
          const style = getComputedStyle(el)
          if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return false
          const rect = el.getBoundingClientRect()
          return Math.abs(rect.left - box.left) < 8 && Math.abs(rect.width - box.width) < 24 && rect.height > 300
        })
        const scroller = candidates[0]
        if (!scroller) return undefined
        const previous = scroller.style.paddingTop
        const base = parseFloat(getComputedStyle(scroller).paddingTop) || 0
        scroller.style.paddingTop = `${base + BAR_HEIGHT}px`
        return () => {
          scroller.style.paddingTop = previous
        }
      }, [box])
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
          setBox({ left: Math.round(colRect.left), top: Math.round(top), width: Math.round(colRect.width) })
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
      const close = React.useCallback(() => setOpenId(null), [])
      useAnchoredPopover(openId !== null, close)

      const toggle = async (domain) => {
        try {
          await call('/toggle', { sessionId, domainId: domain.id, enabled: !domain.loaded })
          broadcast()
        } catch (error) {
          console.warn('[context-domains] toggle failed', error)
        }
      }

      if (!owned) return h('span', { className: 'cdx-slot', 'aria-hidden': 'true' })
      if (!snapshot || snapshot.domains.length === 0) return null
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
                  top: Math.round(chipRect.bottom + 6) + 'px',
                },
                onMouseLeave: close,
              },
              h(
                'div',
                { className: 'cdx-pop-hd' },
                h('b', null, openDomain.name),
                h('span', { className: 'cdx-pop-sub' }, `${counts(openDomain).total} 项`),
              ),
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
          h('div', { className: 'cdx-fallback', role: 'group', 'aria-label': '上下文领域' }, chipList),
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

    function DomainsSettings() {
      const [domains, setDomains] = React.useState([])
      const [catalog, setCatalog] = React.useState({ skills: [], tools: [], suggestions: [], unassigned: { skills: [], tools: [] } })
      const [selectedId, setSelectedId] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [tab, setTab] = React.useState(lastMemberTab)
      const [filter, setFilter] = React.useState(lastMemberFilter)
      const [aiOpen, setAiOpen] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      const pickTab = (next) => {
        lastMemberTab = next
        setTab(next)
      }
      const pickFilter = (next) => {
        lastMemberFilter = next
        setFilter(next)
      }

      const load = React.useCallback(async () => {
        try {
          const [domainValue, catalogValue] = await Promise.all([call('/domains'), call('/catalog')])
          setDomains(domainValue.domains)
          setCatalog(catalogValue)
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      React.useEffect(() => {
        if (selectedId === null && domains.length > 0) setSelectedId(domains[0].id)
      }, [domains, selectedId])

      const selected = domains.find((domain) => domain.id === selectedId) ?? null

      React.useEffect(() => {
        if (!aiOpen) return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          // 只关这一层：宿主设置弹窗也监听 Esc，别连带把设置页关掉
          event.stopPropagation()
          event.stopImmediatePropagation?.()
          setAiOpen(false)
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [aiOpen])
      const run = async (fn) => {
        setBusy(true)
        try {
          await fn()
        } catch (cause) {
          setError(cause.message ?? String(cause))
        } finally {
          setBusy(false)
        }
      }
      // 新建即默认启用：用户建领域的意图就是「要用它」，默认值别再让人多勾一次
      const create = (draft) => run(async () => {
        const created = await call('/domains', { op: 'create', defaultOn: true, ...draft })
        await load()
        setSelectedId(created.id)
      })
      const update = (patch) => run(async () => {
        if (selected) await call('/domains', { op: 'update', id: selected.id, ...patch })
        await load()
      })
      const remove = () => run(async () => {
        if (!selected) return
        await call('/domains', { op: 'delete', id: selected.id })
        setSelectedId(null)
        await load()
      })

      const memberSet = new Set((selected?.members ?? []).map((m) => `${m.type}:${m.name}`))
      const keywords = query.trim().toLowerCase()
      const match = (name) => keywords === '' || name.toLowerCase().includes(keywords)
      const pool = {
        skill: catalog.skills.filter((item) => match(item.name)),
        tool: catalog.tools.filter((item) => match(item.name)),
      }
      const setMember = (type, name, on) => {
        if (!selected) return
        const next = [...(selected.members ?? [])]
        const index = next.findIndex((m) => m.type === type && m.name === name)
        if (on && index < 0) next.push({ type, name })
        if (!on && index >= 0) next.splice(index, 1)
        void update({ members: next })
      }

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

      // 成员行：技能在前、工具在后。类型由页签表达，列表本身保持无装饰（视觉稿的做法），
      // 顺序本身就是「混装」的暗示。
      const rows = (tab === 'all' ? ['skill', 'tool'] : [tab]).flatMap((type) =>
        pool[type]
          .filter((item) => {
            if (filter === 'all') return true
            const on = memberSet.has(`${type}:${item.name}`)
            return filter === 'picked' ? on : !on
          })
          .map((item) => ({ type, name: item.name })),
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
        setQuery('')
        pickTab('all')
        pickFilter('all')
      }

      const memberList = rows.length === 0
        ? h(
            'div',
            { className: 'cdx-empty' },
            h('p', { className: 'cdx-empty-text' }, emptyText()),
            h('button', { className: 'cdx-empty-btn', type: 'button', onClick: clearFilters }, '清除筛选'),
          )
        : rows.map((row) =>
            h(
              'label',
              { className: 'cdx-member', key: `${row.type}:${row.name}`, title: row.name },
              h('input', {
                type: 'checkbox',
                checked: memberSet.has(`${row.type}:${row.name}`),
                disabled: busy,
                onChange: (event) => setMember(row.type, row.name, event.target.checked),
              }),
              h('span', { className: 'cdx-check', 'aria-hidden': 'true' }),
              h('span', { className: 'cdx-member-name' }, row.name),
            ),
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
        const c = counts(domain)
        return h(
          'button',
          {
            key: domain.id,
            className: 'cdx-domain',
            type: 'button',
            'aria-selected': selectedId === domain.id ? 'true' : 'false',
            onClick: () => setSelectedId(domain.id),
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
                className: 'cdx-btn', type: 'button', disabled: busy,
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
            domains.length === 0
              ? h(
                  'div',
                  { className: 'cdx-empty' },
                  h('p', { className: 'cdx-empty-text' }, '还没有领域，可以从建议开始'),
                  (catalog.suggestions ?? []).map((s) =>
                    h('button', {
                      key: s.name, className: 'cdx-empty-btn', type: 'button', disabled: busy,
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
          error
            ? h('div', { className: 'cdx-empty-text', style: { color: 'var(--dsw-alias-label-error)' } }, error)
            : null,
          selected === null
            ? h('div', { className: 'cdx-empty', style: { minHeight: '0', flex: '1 1 auto' } },
                h('p', { className: 'cdx-empty-text' }, '从左侧选一个领域，或新建一个。领域只做归纳：一个领域里可以同时装 skill 和 tool。'))
            : h(
                React.Fragment,
                null,
                h('label', { className: 'cdx-field' },
                  h('span', { className: 'cdx-field-lbl' }, '名称'),
                  h('input', {
                    className: 'cdx-input', defaultValue: selected.name, key: `${selected.id}:name`, spellCheck: false,
                    onBlur: (event) => {
                      const value = event.target.value.trim()
                      if (value !== '' && value !== selected.name) void update({ name: value })
                    },
                  })),
                h('label', { className: 'cdx-field' },
                  h('span', { className: 'cdx-field-lbl' }, '说明'),
                  h('textarea', {
                    className: 'cdx-input cdx-input-area', rows: 2, spellCheck: false,
                    defaultValue: selected.description ?? '', key: `${selected.id}:desc`,
                    placeholder: '这个领域装了什么，什么时候要开',
                    onBlur: (event) => void update({ description: event.target.value }),
                  })),
                h('div', { className: 'cdx-switchrow' },
                  h('span', { className: 'cdx-switchrow-text' },
                    h('span', { className: 'cdx-switchrow-lbl' }, '默认启用'),
                    h('span', { className: 'cdx-switchrow-hint' }, '勾上 = 新会话自动点亮，会话里仍可随时关')),
                  h('button', {
                    className: 'cdx-switch', type: 'button', role: 'switch',
                    'aria-checked': selected.defaultOn ? 'true' : 'false', 'aria-label': '默认启用',
                    disabled: busy,
                    onClick: () => void update({ defaultOn: !selected.defaultOn }),
                  })),
                h('div', { className: 'cdx-members' },
                  h('div', { className: 'cdx-search' },
                    h('input', {
                      className: 'cdx-search-input', type: 'search', placeholder: '搜索成员名称',
                      'aria-label': '搜索成员', value: query,
                      onChange: (event) => setQuery(event.target.value),
                    }),
                    h('span', { className: 'cdx-search-meta' }, `已选 ${memberSet.size} 项`)),
                  h('div', { className: 'cdx-filters' },
                    segmented('成员类型', [['all', '全部'], ['skill', '技能'], ['tool', '工具']], tab, pickTab),
                    h('div', { className: 'cdx-filters-right' },
                      h('span', { className: 'cdx-filters-lbl' }, '显示'),
                      segmented('显示范围',
                        [['all', '全部成员'], ['picked', '已选'], ['unpicked', '未选']], filter, pickFilter))),
                  h('div', {
                    className: tab === 'all' ? 'cdx-list' : 'cdx-list cdx-list-one',
                    role: 'group', 'aria-label': '成员列表',
                  }, memberList)),
                h('div', { className: 'cdx-main-foot' },
                  h('button', { className: 'cdx-btn cdx-btn-danger', type: 'button', disabled: busy, onClick: () => void remove() }, '删除领域'),
                  h('span', { className: 'cdx-hint' }, '保存即时生效，下一轮生效')),
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
