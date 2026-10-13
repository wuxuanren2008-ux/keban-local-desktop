# Windows 系统声音字幕验收（2026-10-13）

版本 0.2.0，Windows 11 x64，Electron 41.10.7，Whisper small / CPU int8，Qwen3.5 4B 本机推理。

- Python 后端、课程隔离、模型失败、保存和语言协议：107 passed，1 项 macOS 专用检查 skipped。
- Node 前端、权限策略、立体声混合、字幕配对与浮窗：36 passed。
- 使用冻结 Python 服务和真正的打包 Electron 程序，外部 SoundPlayer 播放公开的经济学测试句。最终样本是两声道 WAV：左侧静音，右侧英语人声；通过 Chromium/WASAPI 实际系统回采。
- 识别出 Opportunity cost，并显示对应“机会成本”中文译文；验证浮窗真实 isAlwaysOnTop、隐藏/重开、暂停/继续、仅保存音频、课程资料库录音回读和停止后全部音轨 ended。
- 拒绝共享和没有音轨时不会开始课堂，不会降级到麦克风。
- 打包后原有课堂回归：真实 Whisper、课程创建/保存、真实模型总结/导图及回读、反馈学习、术语和文献页均 PASS，无 pageerror。

可复验命令：`node --test tests/*.test.cjs`；`python -m pytest tests/test_local_runtime.py tests/test_macos_runtime.py tests/test_subtitle_languages.py -q`；`LECTURE_APP_EXE` 指向打包后的课伴，再运行 `node scripts/subtitle-smoke.cjs`。原生系统测试使用 `test-results/system-audio-fixture.wav`，只播放自有或公开测试音频；`scripts/test-system-playback.ps1` 使用 PowerShell 7。

![原生系统声音双语字幕](subtitles-overlay.png)

测试不是对所有播放器、DRM 或独占全屏模式的兼容保证，具体使用边界见 [系统声音字幕](system-subtitles.md)。
