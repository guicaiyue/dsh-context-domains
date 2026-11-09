# 发布到 npm（首次 + 之后交给 CI）

> 仓库自带的 `~/.npmrc` 指向 `registry.npmmirror.com`（国内镜像）。**镜像是只读的，发不了包。**
> 下面每条命令都显式带 `--registry=https://registry.npmjs.org`，别省。

本插件**没有构建步骤**（Host 与 Client 都是纯 ESM），所以发布链路比带构建的插件短：
质量门 = `npm run verify`（语法检查 + `node --test`）。

## 0. 现状

| 项 | 值 |
|---|---|
| 包名 | `dsh-context-domains` |
| 发布账号 | npm 用户 `xirizhi` |
| token | `~/.npmrc` 里那条 `//registry.npmjs.org/:_authToken=...`，名字 `dsh-archify CI`，`bypass_2fa=true` |
| 已发布版本 | 见 <https://www.npmjs.com/package/dsh-context-domains> |

同一个 granular token 复用于两个仓库（Packages 选的是 All packages），
所以 `dsh-context-domains` 首次发布不用另建 token。

## 1. 首次发布

```bash
cd dsh-context-domains
npm run verify                                        # 必须绿
npm publish --access public --registry=https://registry.npmjs.org
npm view dsh-context-domains version --registry=https://registry.npmjs.org
```

`prepublishOnly` 会再跑一遍 `npm run verify`，所以坏包发不出去。

## 2. 之后交给 CI 自动发

1. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `NPM_TOKEN`；值取 `~/.npmrc` 里 `_authToken=` 后面那段（**不含**前缀）
3. 之后打标签即自动发：

   ```bash
   npm version patch --no-git-tag-version
   git commit -am "chore: release v0.3.1"
   git tag v0.3.1 && git push origin main --tags
   ```

   `.github/workflows/release.yml` 会先建 GitHub Release（始终），再因为 `NPM_TOKEN`
   存在而跑 `npm publish`。没配 secret 时这一步跳过，其它照常。

用 `scripts/npm-onboard.sh` 可以一条命令走完「登录 → 发版 → 写 secret」。

## 3. 发布被 2FA 挡住（E403）

npm 不接受「网页登录换来的 session token」直接发版，两条路：

**A. 用验证器的一次性码**

```bash
NPM_OTP=123456 ./scripts/npm-onboard.sh
# 或直接
npm publish --access public --registry=https://registry.npmjs.org --otp=123456
```

**B. 用带 Bypass 2FA 的 granular token（CI 也用这个，本仓库已在用）**

1. <https://www.npmjs.com/settings/xirizhi/tokens> → **Generate New Token** → **Granular Access Token**
2. Permissions：**Read and write**
3. Packages and scopes：**All packages**（首次发布时包还不存在，只能选全部）
4. **勾上 `Bypass two-factor authentication`**（默认关闭，不勾等于白建）
5. 验证开关真的生效（**最容易踩的坑**）：

   ```bash
   TOKEN=$(sed -n 's#^//registry.npmjs.org/:_authToken=##p' ~/.npmrc | tail -1)
   curl -s -H "Authorization: Bearer $TOKEN" https://registry.npmjs.org/-/npm/v1/tokens \
     | python3 -c 'import json,sys; [print(t["name"], "bypass_2fa=", t["bypass_2fa"]) for t in json.load(sys.stdin)["objects"]]'
   ```

   必须看到 `bypass_2fa= True`。显示 `False` 说明勾选框没保存，得重建。

## 4. 版本号与 tag 的关系

- `package.json` 的 `version` 是唯一真相；
- 标签必须是 `v<version>`，否则 release workflow 直接失败；
- npm 不允许覆盖已发布版本：改代码后必须 bump version 才能再发。

## 5. 两个 registry 的坑（本仓库都踩过）

**发布成功 ≠ 立刻可查。** 第一次发布时 CI 打完 `npm publish` 立刻 `npm view`，
拿到 404 就把整条发布判成失败——其实版本两分钟后就在了。所以 `release.yml` 里
那步现在是「已存在就跳过，不存在才发，发完轮询 registry」，rerun 也安全。

**包名会先出现一个 `0.0.0-stage`。** 首次发布一个新包时，npm 会先用这个占位版本
建出包，再放真正的版本（`dsh-archify-projects` 也是这样）。它是正常的，
`dist-tags.latest` 指向真实版本后就不用管它。

## 6. 常见错误

| 报错                                                            | 原因          | 处理                                           |
| --------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| `403 You must verify your email`                                | 邮箱没验证    | 去 npm 邮箱点验证链接                          |
| `403 You cannot publish over the previously published versions` | 版本号没 bump | 改 `version` 再发                              |
| `EOTP` / 要求一次性密码                                         | 账号开了 2FA  | 命令后加 `--otp=123456`                        |
| `404 Not Found - PUT ...`                                       | 打到了镜像源  | 显式加 `--registry=https://registry.npmjs.org` |
| `402 Payment Required`                                          | 想发私有包    | 公开包必须 `--access public`                   |
