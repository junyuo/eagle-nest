# Eagle Nest

Eagle Nest 是一個純 HTML/CSS/JavaScript 的靜態網站，可同時觀看多個 YouTube 直播，適合部署到 GitHub Pages。

## 功能

- 輸入多個 YouTube 直播網址
- 自動轉成 YouTube embed 播放器
- 支援 2x2 與 3x3 grid
- 每個直播卡片可自訂標題
- 一鍵靜音或取消靜音全部播放器
- 點選單一路直播放大觀看
- 使用 `localStorage` 記住上次輸入的直播清單
- 響應式設計，支援手機與桌機
- 不需要後端、資料庫或建置流程

## 支援的 YouTube 網址格式

常見格式都可解析，例如：

```text
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/live/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
https://www.youtube.com/shorts/VIDEO_ID
```

批次匯入時，每行可直接貼網址，也可使用：

```text
標題 | https://www.youtube.com/watch?v=VIDEO_ID
```

## 本機預覽

直接開啟 `index.html` 即可使用。若要用本機伺服器預覽，也可以在專案資料夾執行：

```bash
python3 -m http.server 8080
```

然後打開：

```text
http://localhost:8080
```

## 部署到 GitHub Pages

此專案對應的 GitHub repository：

```text
https://github.com/junyuo/eagle-nest
```

### 1. 將檔案推送到 GitHub

如果本機資料夾尚未設定 Git，可執行：

```bash
git init
git branch -M main
git remote add origin https://github.com/junyuo/eagle-nest.git
git add index.html styles.css script.js README.md .nojekyll
git commit -m "Create static multi YouTube live viewer"
git push -u origin main
```

如果已經設定好 Git remote，則只需要：

```bash
git add index.html styles.css script.js README.md .nojekyll
git commit -m "Create static multi YouTube live viewer"
git push
```

### 2. 啟用 GitHub Pages

1. 前往 repository 的 `Settings`
2. 點選左側 `Pages`
3. 在 `Build and deployment` 選擇 `Deploy from a branch`
4. Branch 選擇 `main`
5. Folder 選擇 `/ (root)`
6. 按下 `Save`

部署完成後，網站通常會在幾分鐘內出現在：

```text
https://junyuo.github.io/eagle-nest/
```

## 檔案結構

```text
.
├── index.html
├── styles.css
├── script.js
├── README.md
└── .nojekyll
```

