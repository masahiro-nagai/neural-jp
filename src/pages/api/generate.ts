export const prerender = false;
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Octokit } from "@octokit/rest";

export async function POST({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const { url, text, memo, password } = body;

    // パスワードチェック
    if (password !== process.env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: "パスワードが間違っています。環境変数 ADMIN_PASSWORD を設定してください。" }), { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY が設定されていません" }), { status: 500 });
    }

    if (!process.env.GITHUB_TOKEN) {
      return new Response(JSON.stringify({ error: "GITHUB_TOKEN が設定されていません" }), { status: 500 });
    }

    let sourceText = "";
    if (url) {
      try {
        const res = await fetch(url);
        sourceText = await res.text();
      } catch (e) {
        sourceText = url; // フォールバック
      }
    } else if (text) {
      sourceText = text;
    } else if (memo) {
      sourceText = memo;
    }

    if (!sourceText) {
      return new Response(JSON.stringify({ error: "情報源が入力されていません" }), { status: 400 });
    }

    // Gemini APIで記事生成
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `以下の情報を元に、技術ブログの記事（Markdown形式のFrontmatter付き）を作成してください。

【要件】
1. 情報が英語の場合は、自然な日本語に翻訳および要約してください。
2. 情報が日本語の場合は、ブログ記事として読みやすく整理してください。
3. 出力は必ず以下の形式のMarkdown（Frontmatter付き）のみとしてください。余計な挨拶や説明は不要です。
4. Frontmatterのフィールドは必ず以下のものを含めてください。
   - title: 記事のタイトル（日本語）
   - pubDate: ${new Date().toISOString().split('T')[0]}
   - description: 記事の1〜2文の要約
   - category: "Google", "OpenAI", "Claude", "ハーネスエンジニアリング", "その他" のいずれか
   - tags: 記事に関連するタグを2〜3個（例: ["LLM", "アップデート"]）

【情報元テキスト】
${sourceText}
`;

    const result = await model.generateContent(prompt);
    let markdownContent = result.response.text().trim();
    if (markdownContent.startsWith("```markdown")) {
        markdownContent = markdownContent.replace(/^```markdown\n/, "").replace(/\n```$/, "");
    } else if (markdownContent.startsWith("```")) {
        markdownContent = markdownContent.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    if (url) {
       markdownContent = markdownContent.replace(
           /---\n([\s\S]*?)\n---/, 
           `---\n$1\noriginalUrl: "${url}"\n---`
       );
    }

    const titleMatch = markdownContent.match(/title:\s*"(.*?)"/);
    const title = titleMatch ? titleMatch[1] : `article-${Date.now()}`;
    // Generate valid ascii slug
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug || slug.length < 3) slug = `article-${Date.now()}`;
    const filename = `src/content/blog/${slug}.md`;

    // GitHub APIでコミット作成
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = "masahiro-nagai";
    const repo = "neural-jp";
    const branch = "main";

    try {
        const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
        const commitSha = refData.object.sha;
        const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: commitSha });
        const treeSha = commitData.tree.sha;

        const { data: blobData } = await octokit.git.createBlob({
            owner, repo, content: markdownContent, encoding: "utf-8"
        });

        const { data: newTreeData } = await octokit.git.createTree({
            owner, repo, base_tree: treeSha,
            tree: [{ path: filename, mode: "100644", type: "blob", sha: blobData.sha }]
        });

        const { data: newCommitData } = await octokit.git.createCommit({
            owner, repo, message: `Auto Add: ${title}`, tree: newTreeData.sha, parents: [commitSha]
        });

        await octokit.git.updateRef({
            owner, repo, ref: `heads/${branch}`, sha: newCommitData.sha
        });
    } catch (gitErr: any) {
        console.error("Github API Error", gitErr.message || gitErr);
        return new Response(JSON.stringify({ error: `GitHubへのコミットに失敗しました: ${gitErr.message}` }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, title, filename }), { status: 200 });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: `サーバーエラーが発生しました: ${error?.message}` }), { status: 500 });
  }
}
