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

.cdx-set{display:flex;gap:16px;min-height:380px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.cdx-set-list{width:215px;flex:0 0 215px;display:flex;flex-direction:column;gap:3px}
.cdx-set-list-hd{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11.5px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-btn{font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
.cdx-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}
.cdx-btn-primary{background:var(--dsw-alias-button-primary-fill, #111);color:var(--dsw-alias-label-primary-foreground, #fff);
  border-color:transparent;font-weight:600}
.cdx-dcard{display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:9px;cursor:pointer;
  border:1px solid transparent;background:transparent;color:inherit;text-align:left;font:inherit}
.cdx-dcard:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}
.cdx-dcard[aria-selected="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.cdx-dcard-ico{width:24px;height:24px;flex:0 0 24px;border-radius:7px;display:grid;place-items:center;font-size:12px;
  background:var(--dsw-alias-bg-layer-2)}
.cdx-dcard-n{font-size:12.5px;display:block}
.cdx-dcard-m{font-size:10.5px;display:block;color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-badge{margin-left:auto;flex:0 0 auto;white-space:nowrap;font-size:9.5px;padding:0 5px;border-radius:4px;
  color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)}
.cdx-set-edit{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:12px}
.cdx-field{display:flex;gap:12px;align-items:flex-start}
.cdx-field>label{width:74px;flex:0 0 74px;font-size:11.5px;padding-top:6px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-input{flex:1 1 auto;min-width:0;font:inherit;font-size:12.5px;padding:6px 9px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.cdx-mem-hd{display:flex;align-items:center;gap:8px}
.cdx-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px}
.cdx-mem{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px;font-size:12px;cursor:pointer;
  color:var(--dsw-alias-label-secondary)}
.cdx-mem:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))}
.cdx-mem input{appearance:none;width:13px;height:13px;margin:0;border-radius:4px;flex:0 0 13px;position:relative;
  border:1.5px solid var(--dsw-alias-label-tertiary, #888);background:transparent}
.cdx-mem input:checked{background:var(--dsw-alias-brand-primary, #5686fe);border-color:var(--dsw-alias-brand-primary, #5686fe)}
.cdx-mem input:checked::after{content:"";position:absolute;left:3px;top:0;width:4px;height:7px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(42deg)}
.cdx-mem .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);font-size:11.5px}
.cdx-empty{padding:20px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-hint{font-size:11px;color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))}
.cdx-scroll{max-height:250px;overflow:auto;padding-right:4px}
@container (max-width: 720px){
  .cdx-grid{grid-template-columns:1fr}
  .cdx-field{flex-wrap:wrap;gap:4px}
  .cdx-field>label{width:100%;flex:1 1 100%;padding-top:0}
  .cdx-set-list{width:180px;flex:0 0 180px}
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
    function DomainsSettings() {
      const [domains, setDomains] = React.useState([])
      const [catalog, setCatalog] = React.useState({ skills: [], tools: [], suggestions: [], unassigned: { skills: [], tools: [] } })
      const [selectedId, setSelectedId] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

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
      const create = (draft) => run(async () => {
        const created = await call('/domains', { op: 'create', ...draft })
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
      const memberNames = (type) => (selected?.members ?? []).filter((m) => m.type === type).map((m) => m.name)

      const setMember = (type, name, on) => {
        if (!selected) return
        const next = [...(selected.members ?? [])]
        const index = next.findIndex((m) => m.type === type && m.name === name)
        if (on && index < 0) next.push({ type, name })
        if (!on && index >= 0) next.splice(index, 1)
        void update({ members: next })
      }

      const section = (type, label) => {
        const names = pool[type].map((item) => item.name)
        if (names.length === 0) return null
        return h(
          React.Fragment,
          { key: type },
          h('div', { className: 'cdx-grp', style: { borderTop: 'none', paddingLeft: 0 } },
            label, h('span', { className: 'n' }, String(memberNames(type).length))),
          h(
            'div',
            { className: 'cdx-grid' },
            names.map((name) =>
              h(
                'label',
                { className: 'cdx-mem', key: name },
                h('input', {
                  type: 'checkbox',
                  checked: memberSet.has(`${type}:${name}`),
                  disabled: busy,
                  onChange: (event) => setMember(type, name, event.target.checked),
                }),
                h('span', { className: 'nm', title: name }, name),
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'cdx-set' },
        h(
          'div',
          { className: 'cdx-set-list' },
          h(
            'div',
            { className: 'cdx-set-list-hd' },
            h('span', null, `${domains.length} 个领域`),
            h('span', { style: { flex: '1 1 auto' } }),
            h('button', { className: 'cdx-btn', type: 'button', disabled: busy, onClick: () => void create({ name: '新领域', members: [] }) }, '＋ 新建'),
          ),
          domains.map((domain) => {
            const c = counts(domain)
            return h(
              'button',
              {
                key: domain.id,
                className: 'cdx-dcard',
                type: 'button',
                'aria-selected': selectedId === domain.id ? 'true' : 'false',
                onClick: () => setSelectedId(domain.id),
              },
              h('span', { className: 'cdx-dcard-ico' }, domain.icon ?? '◈'),
              h(
                'span',
                null,
                h('span', { className: 'cdx-dcard-n' }, domain.name),
                h('span', { className: 'cdx-dcard-m' }, `${c.total} 项`),
              ),
              domain.defaultOn ? h('span', { className: 'cdx-badge' }, '默认') : null,
            )
          }),
          domains.length === 0
            ? h('div', { className: 'cdx-empty' }, '还没有领域。可以从下面的建议开始：',
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } },
                  (catalog.suggestions ?? []).map((s) => h('button', {
                    key: s.name, className: 'cdx-btn', type: 'button', disabled: busy,
                    onClick: () => void create({ name: s.name, members: s.members }),
                  }, `${s.name} (${s.members.length})`))))
            : null,
          h('div', { className: 'cdx-hint', style: { marginTop: '8px' } },
            `未归入领域：${catalog.unassigned?.skills?.length ?? 0} skill · ${catalog.unassigned?.tools?.length ?? 0} tool`),
        ),
        h(
          'div',
          { className: 'cdx-set-edit' },
          error ? h('div', { className: 'cdx-empty', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
          selected === null
            ? h('div', { className: 'cdx-empty' }, '从左侧选一个领域，或新建一个。领域只做归纳：一个领域里可以同时装 skill 和 tool。')
            : h(
                React.Fragment,
                null,
                h('div', { className: 'cdx-field' }, h('label', null, '名称'),
                  h('input', {
                    className: 'cdx-input', defaultValue: selected.name, key: `${selected.id}:name`,
                    onBlur: (event) => {
                      const value = event.target.value.trim()
                      if (value !== '' && value !== selected.name) void update({ name: value })
                    },
                  })),
                h('div', { className: 'cdx-field' }, h('label', null, '说明'),
                  h('input', {
                    className: 'cdx-input', defaultValue: selected.description ?? '', key: `${selected.id}:desc`,
                    placeholder: '这个领域装了什么，什么时候要开',
                    onBlur: (event) => void update({ description: event.target.value }),
                  })),
                h('div', { className: 'cdx-field' }, h('label', null, '新会话默认'),
                  h('label', { className: 'cdx-mem', style: { paddingLeft: 0 } },
                    h('input', {
                      type: 'checkbox', checked: selected.defaultOn, disabled: busy,
                      onChange: (event) => void update({ defaultOn: event.target.checked }),
                    }),
                    h('span', { className: 'nm' }, '新会话自动点亮，仍可在会话里改'))),
                h('div', { className: 'cdx-mem-hd' },
                  h('input', {
                    className: 'cdx-input', placeholder: '搜索成员…', value: query,
                    onChange: (event) => setQuery(event.target.value),
                  }),
                  h('span', { className: 'cdx-hint' }, `已选 ${memberSet.size} 项`)),
                h('div', { className: 'cdx-scroll' }, section('skill', '技能'), section('tool', '工具')),
                h('div', { className: 'cdx-field', style: { marginTop: '6px' } }, h('label', null, '为什么混装'),
                  h('div', { style: { flex: 1, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' } },
                    '有的产品是「一个 skill 带一个专用 tool」，拆成两个领域反而要记两次。',
                    h('br'),
                    h('span', { className: 'cdx-hint' }, '对用户是一个开关；加载时才按类型分别处理（skill 进目录、tool 进工具表）。'))),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
                  h('button', { className: 'cdx-btn', type: 'button', disabled: busy, onClick: () => void remove() }, '删除领域'),
                  h('span', { className: 'cdx-hint', style: { alignSelf: 'center' } },
                    '保存即时生效：新会话立刻按新领域组装，已有会话在下一轮生效。'))),
        ),
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
