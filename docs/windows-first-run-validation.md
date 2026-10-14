# Windows 新电脑首次运行复测（2026-10-14）

0.2.0 在没有运行 Ollama 的 Windows 环境中存在启动错误。旧版每次等待健康检查 1 秒，而健康检查包含本机 Ollama 状态查询；Ollama 未运行时实测约 2 秒，因此已启动的后端仍被判定为未就绪，课堂窗口打不开，并误报“端口可能已占用”。上次有模型服务的开发电脑测试漏掉了这一场景。

0.2.1 使用独立、带认证的 `/api/ready` 检查程序就绪，不查询模型服务；首次未安装 Ollama、未下载 Whisper/LLM 也可进入软件。程序默认端口占用时选择其他本机端口，失败时生成 startup.log / runtime.log。

## 实际发布 EXE 验收

完整作业：[38520726221](https://github.com/wuxuanren2008-ux/keban-local-desktop/actions/runs/38520726221)。测试直接下载同一份 0.2.1 候选发布 EXE，核验 SHA256，在准备任何应用依赖之前启动。

| 测试环境 | 免安装 EXE | 安装包与安装后启动 | 首次 CPU 模型准备 |
|---|---|---|---|
| 新建 Windows Server 2022 x64 虚拟机 | 通过 | 通过 | Whisper base、官方 Ollama、Qwen3.5 0.8B 加载及实际中文翻译通过 |
| 新建 Windows Server 2025 x64 虚拟机 | 通过 | 通过 | Whisper base、官方 Ollama、Qwen3.5 0.8B 加载及实际中文翻译通过 |
| 本机 Windows 11 x64、空资料/缓存目录 | 通过 | 通过 | 已有课堂与模型测试证据见其他验收报告 |

- 每个应用测试进程 PATH 仅保留 Windows 系统目录，清除 Python/Node/虚拟环境路径，使用全新的资料、模型缓存和临时目录。
- 测试实际 portable.exe 外层解压启动器，不仅测试 win-unpacked。临时、安装及资料目录包含中文与空格。
- 初次打开时模型不可用；检查课堂界面、所属课程、模型设置和系统声音控件，以及课程/课堂保存回读与无 token 时 403。
- 模型准备验证调用真正的生产功能下载并校验官方 Ollama，在 CPU 环境加载 Whisper base / Qwen3.5 0.8B，并实际生成中文翻译，没有云端替代结果。
- 在本机主动占用 8766，实际免安装包改用其他端口正常运行，原端口监听器保持活动。
- 后端回归 108 passed、1 项 macOS 专用测试 skipped；Node 前端/权限/浮窗/启动回归 39 passed。

## 使用条件与测试范围

面向 Windows 10/11 **64 位 x64**，无需用户另外安装 Python 或 Node。首次使用 AI 功能仍需下载 Whisper 和 LLM，并准备 Ollama；模型下载需要能访问相应官方下载源。

GitHub 标准 Windows runner 是新建的、带预装系统组件与开发工具的虚拟机。测试移除了应用进程对开发工具 PATH 和旧模型/资料的依赖，但不把它称为所有系统组件都被移除的纯净镜像。尚未接触用户报告失败的实体电脑，也未覆盖 Windows 7/8、32 位系统、Windows ARM、所有显卡/CPU 或企业应用管控策略。

若还有启动问题，请查看 `%APPDATA%\lecture-companion-desktop\classroom-data\startup.log` 和 `runtime.log`。免安装版也将课程资料存到当前 Windows 用户的应用数据目录，升级保留这些资料。

证据来源：[GitHub 标准运行环境](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、上述完整作业中的日志、result.json、native-models.json 与实际界面截图。
