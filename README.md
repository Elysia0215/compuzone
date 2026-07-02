<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/291caee7-0d90-4a8a-8143-0777533cd3e7

## Run Locally

**Prerequisites:** Node.js & Python 3.x

1. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

2. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set your API Key**:
   Create a `.env` or `.env.local` file in the root directory and add:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *Note: If no API key is specified, the application will automatically fall back to its robust built-in Korean keyword fallback rules, allowing offline testing of all chatbot features.*

4. **Run the App**:
   ```bash
   npm run dev
   ```
   *(This executes `python dev.py`, which boots both the Flask API server on port `8000` and the Vite frontend on port `3000` concurrently).*

