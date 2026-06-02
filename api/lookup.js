// api/lookup.js
// Vercel Serverless Function — APIキーを安全に隠してClaude APIを呼ぶプロキシ
// 環境変数 ANTHROPIC_API_KEY に sk-ant-... を登録すること（コードには書かない）

export default async function handler(req, res) {
  // CORS（同一オリジンなので基本不要だが念のため）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 番号は GET の ?phone= でも POST の body でも受け付ける
  const phone =
    (req.query && req.query.phone) ||
    (req.body && req.body.phone) ||
    '';

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: '電話番号が指定されていません' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'サーバー側のAPIキーが未設定です' });
  }

  const prompt = `あなたは日本の電話番号アナリストです。
電話番号「${String(phone).trim()}」を分析し、必ず純粋なJSONのみで回答してください（コードブロックや前置きは不要）。

形式:
{
  "type": "番号の種類（フリーダイヤル/固定電話/携帯/IP電話/国際 など）",
  "region": "地域または事業者（例: 千葉県木更津市, ソフトバンク, 不明）",
  "risk": "high|medium|low|safe",
  "risk_label": "危険|注意|不明|安全",
  "purpose": "想定される用途を1〜2文",
  "analysis": "番号のパターン・特徴・よくある用途・注意点を3〜5文",
  "advice": "受け取った際のアドバイスを1〜2文"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await r.json();

    if (data.type === 'error') {
      return res.status(502).json({ error: 'API error', detail: data.error });
    }

    // content[0].text を取り出してJSONパース
    const text =
      (data.content && data.content[0] && data.content[0].text) || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      // パースできなければ生テキストを返す
      parsed = {
        type: '不明',
        region: '不明',
        risk: 'low',
        risk_label: '不明',
        purpose: '',
        analysis: clean,
        advice: '',
      };
    }

    parsed.phone = String(phone).trim();
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
