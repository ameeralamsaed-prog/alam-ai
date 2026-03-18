export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message } = req.body;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY, // Secret Key
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: "claude-3-opus-20240229",
                max_tokens: 1024,
                messages: [{ role: "user", content: message }]
            })
        });

        const data = await response.json();
        res.status(200).json({ reply: data.content[0].text });
    } catch (error) {
        res.status(500).json({ error: "Something went wrong" });
    }
}
