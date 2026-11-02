# 上岸鸭：科研质量进阶工作台

## 从新克隆启动

安装Python 3.10以上，在仓库根目录运行：

```sh
python start_research.py
```

打开 http://127.0.0.1:9010 ，质量闭环在 `/quality`，原55项实际提交验收在 `/acceptance`。可用 `--port 9011` 更换端口。

该入口只依赖Python标准库。目标、判据、原稿上传、能力试做、V2、同标准复核、另一处迁移、任务验收和上下文存入本机SQLite。运行数据在 `work/workflow-state/`，已加入忽略规则，不提交到公共仓库。

八项目种子是候选任务与历史状态，不附带用户原作。用户可在质量流程上传有权使用的原稿；“打开已准备材料”的旧私有文件索引在新电脑未配置时会明确返回不可用，不能冒充已读取原作。

真实模型诊断需另配模型和导入的项目材料；规则候选不冒充模型成功，接口通过也不等于真人效果或获奖。通用Python Agent底座的启动及可选依赖见 `learning-agent/README.md`。

## 验证

```sh
cd learning-agent
python -m unittest discover -q
cd visual-workflow
python -m unittest discover -q
```

工程夹具明确标为SYNTHETIC，不充作真人V2或用户试用。旧V7工作台、资料池与原型作为保留模块，不能把多个界面的历史版本混用；未解决的旧界面冲突见本次PR整合记录。
