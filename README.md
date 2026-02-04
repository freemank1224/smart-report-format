<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1eFwGaoQ13gq8UoE_OTb6kYh0mNRAX6Lf

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. 在本地开发时，在 [.env.local](.env.local) 中设置 `VITE_API_KEY`（用于本地直连 Gemini）
3. Run the app:
   `npm run dev`

## Deploy to Vercel

在 Vercel 项目设置中添加环境变量：

- `GEMINI_API_KEY`: Gemini API Key（仅在 Serverless Function 中使用）

部署到 Vercel 后，前端会自动通过 Serverless Function 访问 Gemini；本地开发仍然直连 Gemini。
