# 上岸鸭 · 卡点解困任务调度

网址：https://shanganya-unblocking-dispatch.mystictoad65.chatgpt.site（当前账号私有访问）。

完整范围和8项任务见 [分支任务文档](../../docs/task-unblocking-dispatch-2026-10-16.md)。这是可用的任务调度看板；新增解困业务模块仍待开发和真人验收。

## 使用与验证

在此目录启动任意静态HTTP服务器即可本地查看。浏览器需支持JavaScript模块和fetch；不要直接以file://打开。

`node scripts/check.mjs` 检查依赖、状态规则与资产；`node --check app.js` 检查脚本语法。

修改data.json后需同步发布Site；首次加载用打包快照，随后读取本GitHub分支的data.json及对应issue状态。网络或API异常明确显示同步失败。状态只能由成员在对应GitHub issue更新；本页不会直接写入GitHub。

不在localStorage存储共享业务数据，不含账户令牌或后端模型调用。Site托管源码与本目录代码对应，原项目Python后端未因本轮任务看板而改动。
