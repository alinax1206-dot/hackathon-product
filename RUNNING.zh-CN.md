# ChartAloud Studio：在 VS Code 中运行

1. 解压 `ChartAloud-integrated.zip`，在 VS Code 中打开 `chartaloud-integrated` 文件夹。
2. 安装 Node.js 20.19+ 或 22.12+。在 VS Code 终端运行 `npm ci`。
3. 运行 `npm run dev`，打开终端显示的本地网址。运行 `npm test`、`npm run build` 检查项目；安装 Playwright 浏览器后运行 `npm run test:browser` 可检查页面流程。
4. 首页选择 **Creator Mode**，上传 CSV/Excel（演示文件在 `public/demo/`），完成映射和预览，填写标题及可选学习目标，点击 **Continue to publish → Publish learning material**。发布成功后在 **05 Code** 查看六位码。
5. 点击 **Open User Mode** 会直接打开刚发布的资料。首页 **User Mode** 可输入其他六位码，也可继续本标签页最近打开的资料。侧边步骤可点击切换；回到首页后，**Continue draft** 返回未完成的 Creator 草稿。
6. 右上角 **Material Archive** 可查看当前浏览器的所有已发布版本和六位码，并切换到较早版本。替换上传文件或从 Archive 打开其他版本时，当前草稿会暂存在 Archive。草稿仅保留在当前标签页，刷新或关闭后消失；已发布资料保存在当前浏览器。

Creator 的 **Play as music** 使用 Tinker 推荐的风格和音高映射。**Adjust music** 可手动改音乐风格与音高细节，**How is the sound chosen?** 解释规则。图表中的单点音只是探索该点的短音，与完整编曲不同。User 的 Explore 页面用左右方向键切换点、Enter 听数值、Space 唤起语音输入、Escape 停止声音。首页及 User Mode 会尝试播放简短英文问候；浏览器可能限制未点击页面前的自动语音。打开材料时只简短打招呼，等待提问；可点击右下角动态小音符打开聊天框。语音识别和朗读设为英语，音色取决于设备，项目没有附带语音包或音色选择器。

AI 功能：复制 `.env.example` 为 `.env.local`，填写 `TINKER_API_KEY` 和完整的 `TINKER_MODEL_PATH`，再重新启动开发服务器。音乐推荐和语音助手均通过 Tinker。不要把 `.env.local` 或密钥上传到 GitHub。未配置密钥时仍可使用图表、标准声音和发布流程。`npm run build` 生成的静态网页不包含 AI 后端。

六位码只在发布者使用的浏览器及同一网址来源中有效，另一台设备不能直接凭码访问。JSON 导出位于 Creator 的 Code 页面；User 页面不需要导出。
