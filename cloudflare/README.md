# 云边聊天室后端

Worker：`luoty-chat`。D1：`luoty-chat`，绑定名 `DB`。

接口地址：`https://luoty-chat.luoty-garden.workers.dev`。

访客选择仅保存在页面内存中，刷新或新开页面后重新选择。未选择、选择本地或删除遮罩时，发送只写本机存储。本地历史不会自动上传。自己的云端留言在发送成功后另存正文至本机，本地模式显示本机留言及自己的云端留言备份，不显示他人留言、不请求留言接口。云端模式合并自己的留言与云端最近 150 条留言，按消息 ID 去重；每 30 秒刷新一次，仅在聊天室打开且页面可见时读取。云端提交失败保留输入，重试沿用同一消息 ID。旧版本只保留过自己云端留言的 ID，这部分正文在再次选择云端、读到对应留言后补存；未曾保存且已不在最近 150 条中的正文不能凭 ID 在本机恢复。

## 部署

在本目录执行：

```powershell
npx wrangler@4 login
npx wrangler@4 d1 execute luoty-chat --remote --file=schema.sql
npx wrangler@4 deploy
```

`wrangler.jsonc` 只包含公开配置，不存储密码或令牌。登录凭据由官方 Wrangler 管理，不进入网站构建文件。前端接口地址位于 `../src/chat-config.js`；允许的网页来源在 `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 中配置。

## 接口

- `GET /messages`：按时间升序返回最近 150 条，结构为 `{ messages: [{ id, name, text, time }] }`。
- `POST /messages`：JSON `{ id, name, text }`。服务端生成时间；消息 ID 重复时返回已存消息，不重复插入。
- `OPTIONS /messages`：跨域预检。

仅云端分享的数据写入数据库，不收集客户端标识、邮箱或 IP。昵称上限 16 个 UTF-16 代码单元，正文上限 500；界面以纯文本渲染。当前未接入验证码、频率限制、审核或管理员删除入口；跨域允许列表不是身份认证或防刷措施。

## 备份

```powershell
npx wrangler@4 d1 export luoty-chat --remote --output=luoty-chat.sql
```

导出文件可能包含访客留言，应存到私有位置，不要提交到公开仓库。数据库保留全部历史，150 条只是接口的显示上限。
