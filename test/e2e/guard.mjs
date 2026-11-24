// e2e 共用护栏：测试只许动自己新建的临时领域，别人的领域一个字段都不许变。
//
// 为什么有它：2026-11-23 两次真事故。
//   第 980 轮：探针在真实实例上点了已有领域「创造者技能」的复选框，4 个成员被点到 12 个。
//   第 1022 轮：同一个领域被整个删掉，agent 从第 980 轮的日志里翻出原始数据才手工恢复。
// 两次都靠「旧日志里恰好留着原始数据」才救回来。这个护栏让下一次在测试结束时就发现，
// 而不是等人某天打开设置页发现少了东西。
//
// 用法：
//   const guard = await guardDomains(readDomains, { note: 'settings-race' })
//   try { …点真实页面… } finally { await guard.verify() }
//
// readDomains 要返回 [{ name, members, defaultOn, order, description }]，即 GET /domains 的 domains。
// 默认把名字以 __cdx-e2e- 开头的领域当作「测试自己建的」排除在对比之外。
export async function guardDomains(readDomains, options = {}) {
  const { note = '', isOurs = (name) => name.startsWith('__cdx-e2e-') } = options

  // 一个领域一个指纹：名字、成员数、默认开关、顺序、说明。任何一项变了就算动了别人的东西。
  const fingerprint = (domains) =>
    domains
      .filter((domain) => !isOurs(domain.name))
      .map((domain) =>
        [
          domain.name,
          `members=${(domain.members ?? []).length}`,
          `defaultOn=${domain.defaultOn === true}`,
          `order=${domain.order}`,
          `description=${domain.description ?? ''}`,
        ].join(' | '),
      )
      .sort()

  const before = fingerprint(await readDomains())

  return {
    // 拍一张快照，供别处断言（例如「领域总数没变」）。
    before,
    async verify() {
      const after = fingerprint(await readDomains())
      const lost = before.filter((line) => !after.includes(line))
      const gained = after.filter((line) => !before.includes(line))
      if (lost.length === 0 && gained.length === 0) return

      const lines = [`${note ? note + '：' : ''}e2e 动了不属于自己的领域，已中止。`]
      if (lost.length) lines.push(`跑之前有、现在没有或变了（${lost.length} 条）：`, ...lost.map((l) => `  - ${l}`))
      if (gained.length) lines.push(`跑之后多出来或变了（${gained.length} 条）：`, ...gained.map((l) => `  + ${l}`))
      lines.push(
        '',
        '只许在自己新建的临时领域（名字以 __cdx-e2e- 开头）上点。',
        '别人的领域一个字段都不许变：不许勾成员、不许切默认开关、不许删、不许改名。',
        '要恢复请照这条记录手工改回去，不要重新跑一遍测试。',
      )
      throw new Error(lines.join('\n'))
    },
  }
}
