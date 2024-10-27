export default {
    async scheduled(event, env, ctx): Promise<void> {
        const domain = env.DOMAIN;
        const url = `https://crt.sh/?dnsname=${domain}&exclude=expired&group=none&output=json`;
        let isFirstRun = await env.NAMES.get("isFirstRun");
        
        if (!isFirstRun) {
            console.log("Initial startup detected.");
            await env.NAMES.put("isFirstRun", "false"); // 初回起動フラグを設定
            isFirstRun = true;
        } else {
            isFirstRun = false;
        }
        
        try {
            const response = await fetch(url);
            const data = await response.json();

            // 前回の最大IDを取得
            const lastMaxId = await env.NAMES.get("lastMaxId");
            let newMaxId = lastMaxId ? parseInt(lastMaxId) : 0;
            // 各entryの処理（IDが大きい順に並んでいることを考慮）
            for (const entry of data) {
                const entryId = entry.id ? parseInt(entry.id) : 0;

                // エントリのIDが前回の最大IDより小さければ終了（降順であることを利用）
                if (entryId <= newMaxId) {
                    break;
                }

                // 新しい最大IDを更新
                newMaxId = entryId;

                const nameList = entry.name_value ? entry.name_value.split("\n") : [];
                
                // for (const name of nameList) {
                //     const existingName = await env.NAMES.get(name);
                //     if (!existingName) {
                //         await env.NAMES.put(name, name);
                //         console.log(`New entry added: ${name}`);
                //     }
                // }

                // 初回実行時は通知を無効化
                if (!isFirstRun) {
                    const message = `
🪪 [新しい証明書が発行されました] \`\`\`
発行者:     ${entry.issuer_name}
CN:        ${entry.common_name}
Name:      ${nameList.join("\n           ")}
登録日時:   ${new Date(entry.entry_timestamp).toLocaleString()}
有効開始日: ${new Date(entry.not_before).toLocaleString()}
有効終了日: ${new Date(entry.not_after).toLocaleString()}\`\`\`
                    `;
                    await notifySlack(env.SLACK_WEBHOOK_URL, message);
                }
            }

            // KVに新しい最大IDを保存
            await env.NAMES.put("lastMaxId", newMaxId.toString());

            console.log("Trigger fired");
        } catch (error) {
            console.error("Error during scheduled task:", error);
        }
    },
} satisfies ExportedHandler<Env>;

async function notifySlack(webhookUrl: string, message: string): Promise<void> {
    const payload = JSON.stringify({ text: message });
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-type': 'application/json' },
            body: payload,
        });

        if (!response.ok) {
            console.error("Slack notification failed with status:", response.status);
        } else {
            console.log("Slack notification sent successfully.");
        }
    } catch (error) {
        console.error("Failed to send notification to Slack:", error);
    }
}
