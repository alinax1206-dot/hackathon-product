# ChartAloud Studio：在 VS Code 中运行

1. 解压 `ChartAloud-integrated.zip`，在 VS Code 中打开 `chartaloud-integrated` 文件夹。
2. 安装 Node.js 20.19+ 或 22.12+。在 VS Code 终端运行 `npm ci`。
3. 运行 `npm run dev`，打开终端显示的本地网址。运行 `npm test`、`npm run build` 检查项目；安装 Playwright 浏览器后运行 `npm run test:browser` 可检查页面流程。
4. 首页选择 **Creator Mode**，上传 CSV/Excel（演示文件在 `public/demo/`），完成映射和预览，填写标题及可选学习目标，点击 **Continue to publish → Publish learning material**。发布成功后在 **05 Code** 查看六位码。
5. 点击 **Open User Mode** 会直接打开刚发布的资料。首页 **User Mode** 可输入其他六位码，也可继续本标签页最近打开的资料。侧边步骤可点击切换；回到首页后，**Continue draft** 返回未完成的 Creator 草稿。
6. 右上角 **Material Archive** 可查看当前浏览器的所有已发布版本和六位码，并切换到较早版本。替换上传文件或从 Archive 打开其他版本时，当前草稿会暂存在 Archive。草稿仅保留在当前标签页，刷新或关闭后消失；已发布资料保存在当前浏览器。

Creator 的 **Play as music** 使用 Tinker 推荐的风格和音高映射。**Adjust music** 可手动改音乐风格与音高细节，**How is the sound chosen?** 解释规则。图表中的单点音只是探索该点的短音，与完整编曲不同。Creator 预览和 User Explore 均可先聚焦图表，再用 ←/→ 选择上一个／下一个数据点，Enter 读出准确标签、数值和单位，Space 开始语音输入，再按一次结束并发送问题。键盘快捷键只在图表本身获得焦点时生效，不拦截表单、按钮、链接或页面其他位置的按键。首页及打开材料时会尝试播放简短英文问候；浏览器可能限制未点击页面前的自动语音。打开材料时只简短打招呼，等待提问；可点击右下角动态小音符打开聊天框。

进入 User Explore 会自动聚焦图表，无需先按 Tab；←/→、Enter、Space 可直接探索。右下角音符会显示 Listening、Thinking/Preparing、Speaking、Ready 或错误状态，状态也会伴随明显的颜色/发光动画；麦克风失败或未识别到语音时会显示重试提示。

Tab 仍是浏览器原生的焦点导航（不是额外快捷键），可用于在页面控件间移动；进入 Explore 后无需按 Tab 才能开始图表交互。Space 在 User Explore 页面可直接开始录音，再按一次结束并发送；输入框和其他表单控件内的空格仍用于输入文字。

图表数值和 AI 回答优先使用网站内置的 Kokoro `af_heart` 英语音色，在浏览器本地合成。模型和 ONNX WebAssembly 文件随静态网站发布；进入 User Explore 后会预加载约 100 MB 资源并显示进度，之后由浏览器缓存。模型推理在 Web Worker 中运行，避免合成时占住页面主线程。模型尚未准备好时，第一次朗读会先用浏览器英语音色立即播放，Kokoro 在后台继续加载；之后的朗读改用 Kokoro。首次下载、弱网、设备性能不足仍可能让 Kokoro 语音变慢，但不会因此阻塞图表交互；保持页面打开直到状态显示 voice ready，后续通常可使用浏览器缓存。若仍需缩短 Kokoro 合成时间，可在 `src/kokoroSpeech.worker.js` 调整模型/量化配置；替换资源时也要同步更新 `public/models/`。首页问候使用浏览器英语音色以避免首次打开就加载模型；打包音色或音频不可用时会提示并回退到浏览器英语音色。语音识别仍使用浏览器的 `SpeechRecognition`（`en-US`），需要浏览器支持及麦克风权限；它不属于附件中的音色文件。

AI 答案需要等待 Tinker 模型和网络响应；服务端将生成上限设为 220 tokens，20 秒超时覆盖请求和响应正文读取。响应头 `Server-Timing` 中的 `tinker` 是 Tinker 网络/生成耗时，`assistant` 是服务端总耗时；`X-Tinker-Elapsed-Ms` 与 `X-Assistant-Elapsed-Ms` 也可在浏览器开发者工具 Network 中检查 `/api/assistant`。慢在这些头上的部分属于服务端/Tinker；慢在语音播放前的部分则多半属于 Kokoro 首次下载或本地合成。AI 助手会在等待时显示 Thinking。

AI 功能：复制 `.env.example` 为 `.env.local`，填写 `TINKER_API_KEY` 和完整的 `TINKER_MODEL_PATH`，再重新启动开发服务器。音乐推荐和语音助手的回答通过 Tinker；本地语音合成本身不需要 Tinker 密钥。不要把 `.env.local` 或密钥上传到 GitHub。未配置密钥时仍可使用图表、标准声音、本地语音合成和发布流程。`npm run build` 会包含本地语音模型和运行时，但不包含 Tinker AI 后端。

六位码只在发布者使用的浏览器及同一网址来源中有效，另一台设备不能直接凭码访问。JSON 导出位于 Creator 的 Code 页面；User 页面不需要导出。
