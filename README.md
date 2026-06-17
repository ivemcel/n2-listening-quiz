# 🎧 N2听力即时问答

日本語能力試験 N2 の聴解「即時応答」問題をブラウザで練習できる Web アプリです。
历年真题 · 即时答题 · 错题收藏 · 音频导出

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## ✨ 功能

- **历年真题** — 收录 2016~2024 年 N2 即时问答真题（共 13 场）
- **听力播放** — 逐题播放对应音频片段，支持重播
- **假名切换** — 对话原文支持假名显示/隐藏
- **语法解析** — 每题附语法点讲解
- **即时批改** — 选择答案后立即显示对错
- **错题本** — 答错自动收录，支持复习模式
- **音频导出** — 浏览器端一键下载错题音频合集（.wav），无需 ffmpeg

## 🏗 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + Vite 5 |
| 路由 | react-router-dom v6 |
| 状态管理 | Zustand (persist to localStorage) |
| 样式 | Tailwind CSS 3 |
| 音频处理 | Web Audio API |
| 数据格式 | JSON (题目数据 / 时间戳) |

## 📁 项目结构

```
├── data/
│   ├── questions.json          # 题目数据
│   ├── timestamps.json         # 每题音频时间戳
│   ├── session_starts.txt      # 各场次开始时间
│   └── sessions/               # 各场次音频文件 (*.wav)
├── public/
│   └── audio/                  # 完整音频 (n2_full.mp3)
├── scripts/
│   ├── parse.js                # 解析题目数据
│   ├── detect-silence.sh       # 音频静音检测
│   ├── align_timestamps.py     # 时间戳对齐
│   ├── extract-audio.sh        # 音频文件提取
│   └── export-wrong-audio.mjs  # 错题音频导出 (Node.js)
├── src/
│   ├── components/             # 组件
│   │   ├── AudioPlayer.jsx     # 音频播放器
│   │   ├── QuestionCard.jsx    # 题目卡片（对话+语法）
│   │   ├── OptionList.jsx      # 选项列表
│   │   ├── ProgressBar.jsx     # 进度条
│   │   ├── YearSelector.jsx    # 年份选择器
│   │   └── NavBar.jsx          # 底部导航
│   ├── pages/
│   │   ├── HomePage.jsx        # 首页（场次选择）
│   │   ├── QuizPage.jsx        # 答题页
│   │   ├── ReviewPage.jsx      # 错题复习
│   │   └── ExportPage.jsx      # 音频导出
│   ├── store/
│   │   └── useStore.js         # Zustand 状态管理
│   ├── utils/
│   │   ├── audio.js            # 音频工具
│   │   ├── sessionAudio.js     # 场次音频映射
│   │   ├── export.js           # 导出数据工具
│   │   └── downloadAudio.js    # 浏览器端音频裁剪/拼接/下载
│   └── styles/
│       └── index.css           # 全局样式
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## 📝 数据来源

题目数据来自历年日本語能力試験 N2 真题。

## 📄 License

MIT
