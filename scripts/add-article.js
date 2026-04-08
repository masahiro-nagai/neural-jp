import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline/promises";
import * as dotenv from "dotenv";

// .env ファイルの読み込み
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log("=== AI記事自動追加ツール (Powered by Gemini API) ===");
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("エラー: 環境変数 'GEMINI_API_KEY' が設定されていません。");
    console.log("リポジトリのルートに .env ファイルを作成し、以下のように記述してください：");
    console.log("GEMINI_API_KEY=あなたのAPIキー");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // より良い結果を得るために、最新モデルを使用
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const inputType = await rl.question("入力方法を選んでください (1: URL, 2: テキスト直接入力): ");
  let content = "";
  let originalUrl = "";

  if (inputType === "1") {
    originalUrl = await rl.question("記事のURLを入力してください: ");
    console.log("※URLから直接内容を取得する機能は簡易版のため、手動でテキストを入力することを推奨します。");
    const fetchContent = await rl.question("ページの内容を取得して良いですか？ (y/N): ");
    if (fetchContent.toLowerCase() === "y") {
        try {
            const response = await fetch(originalUrl);
            content = await response.text();
            // 簡易的にHTMLタグを削除 (実際は cheerio などを使うのがベターですが今回はプロンプトで処理させます)
        } catch (e) {
            console.error("URLからの取得に失敗しました:", e);
            content = await rl.question("直接テキストを貼り付けてください:\n");
        }
    } else {
        content = await rl.question("直接テキストを貼り付けてください:\n");
    }
  } else {
    console.log("追加したい英語（または日本語）の情報を貼り付けてください。");
    console.log("終了するには新しい行で 'EOF' と入力してEnterを押してください:");
    
    let line;
    while ((line = await rl.question("")) !== "EOF") {
        content += line + "\n";
    }
    
    const urlInput = await rl.question("情報元のURLがあれば入力してください (なければ空白でEnter): ");
    if (urlInput.trim()) {
        originalUrl = urlInput.trim();
    }
  }

  if (!content.trim()) {
      console.log("内容が空のため終了します。");
      process.exit(0);
  }

  console.log("\nGemini APIで記事を処理しています... 少々お待ちください...");

  const prompt = `
以下の情報を元に、技術ブログの記事（Markdown形式のFrontmatter付き）を作成してください。

【要件】
1. 情報が英語の場合は、自然な日本語に翻訳および要約してください。
2. 情報が日本語の場合は、ブログ記事として読みやすく整理してください。
3. 出力は必ず以下の形式のMarkdown（Frontmatter付き）のみとしてください。余計な挨拶や説明は不要です。
4. Frontmatterのフィールドは必ず以下のものを含めてください。
   - title: 記事のタイトル（日本語）
   - pubDate: 今日の日付 (YYYY-MM-DD形式)
   - description: 記事の1〜2文の要約
   - category: "Google", "OpenAI", "Claude", "ハーネスエンジニアリング", "その他" のいずれか、最も適切なもの1つ
   - tags: 記事に関連するタグを2〜3個（例: ["LLM", "アップデート"]）

【出力形式の例】
---
title: "記事のタイトル"
pubDate: 2024-05-13
category: "OpenAI"
tags: ["タグ1", "タグ2"]
description: "記事の要約です。"
---

ここに本文を記述します。
見出し（## など）やリストを使って読みやすく構成してください。

【情報元テキスト】
${content}
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Markdownのコードブロックバッククォートが含まれている場合は除去する
    let markdownContent = responseText.trim();
    if (markdownContent.startsWith("```markdown")) {
        markdownContent = markdownContent.replace(/^```markdown\n/, "").replace(/\n```$/, "");
    } else if (markdownContent.startsWith("```")) {
         markdownContent = markdownContent.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    // URLがある場合はFrontmatterに追記する
    if (originalUrl) {
       markdownContent = markdownContent.replace(
           /---\n([\s\S]*?)\n---/, 
           `---\n$1\noriginalUrl: "${originalUrl}"\n---`
       );
    }

    console.log("\n=== 生成された記事 ===\n");
    console.log(markdownContent);
    console.log("\n=====================\n");

    const save = await rl.question("この記事を保存しますか？ (y/N): ");
    if (save.toLowerCase() === "y") {
        // タイトルからファイル名を生成する（簡易的）
        const titleMatch = markdownContent.match(/title:\s*"(.*?)"/);
        const title = titleMatch ? titleMatch[1] : `article-${Date.now()}`;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `article-${Date.now()}`;
        const filename = `${slug}.md`;
        
        const filepath = path.join(process.cwd(), "src", "content", "blog", filename);
        await fs.writeFile(filepath, markdownContent, "utf-8");
        console.log(`\n✅ 記事を保存しました: ${filepath}`);
    } else {
        console.log("保存をキャンセルしました。");
    }

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    rl.close();
  }
}

main();
